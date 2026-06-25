# Phase 3b — Loan Request Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A neighbor can request to borrow a loan-type item; the owner runs it through a lender-driven lifecycle (pending → approved → active → returned, or declined), with the item's availability kept in sync.

**Architecture:** A new `active` loan status (migration). A `loanService` holds a pure `nextLoanStatus` transition table plus DB operations (create with validation, list, transition with an item-status flip in one transaction). REST under `auth` exposes create/list/transition. The client uses a single `LoansProvider` (one source of truth for the dashboard, item-page panel, and navbar badge) plus focused components.

**Tech Stack:** Express 5 + Drizzle/PostGIS (server), Next.js 16 + React 19 (client), TypeScript, npm workspaces. No test framework (Vitest breaks the Turbopack build).

## Global Constraints

- Lifecycle is lender-driven: `approve` (pending→approved), `decline` (pending→declined), `pickup` (approved→active), `return` (active→returned). Any other (status, action) pair is illegal → 409.
- Item-status coupling: `pickup` flips `items.status` `available → borrowed`; `return` flips `borrowed → available`. Done in the SAME transaction as the loan transition.
- A new request is allowed ONLY when the item is `available`, `listingType === 'loan'`, the requester is not the owner, there is no open request (status in pending/approved/active) for that item, and `dueDate >= startDate`. Otherwise 400.
- Only the lender (`loan.lenderId === req.userId`) may transition a loan → else 403. Unknown loan → 404.
- All loan routes under `auth`. Never return `password_hash` — map borrower/lender through owner-column selects.
- Server ESM + NodeNext: relative imports use the `.js` extension. Shared API types live once in `@neighborly/shared`, imported with `import type`.
- Tailwind v4 Lending Desk classes; never `bg-white` (use `bg-card`); render statuses as `font-mono` uppercase stamps.
- Each commit must leave `npm run typecheck` (whole repo) clean.

---

### Task 1: Shared contract — loan DTO + payloads

**Files:**
- Modify: `shared/src/index.ts` (add `'active'` to `LoanStatus`; replace `LoanRequestDTO`; add `LoanItemRef`, `CreateLoanPayload`, `LoanAction`)
- Modify: `client/lib/types.ts` (re-export under client names)

**Interfaces:**
- Consumes: existing `ItemOwner`, `ListingType`.
- Produces: the new `LoanStatus`, `LoanRequestDTO`, `LoanItemRef`, `CreateLoanPayload`, `LoanAction`.

- [ ] **Step 1: Edit `shared/src/index.ts`**

Change the `LoanStatus` line to:
```ts
export type LoanStatus = 'pending' | 'approved' | 'declined' | 'active' | 'returned';
```
Replace the existing `LoanRequestDTO` interface with:
```ts
export interface LoanItemRef {
  id: string;
  title: string;
  cover?: string;
  listingType: ListingType;
}

export interface LoanRequestDTO {
  id: string;
  item: LoanItemRef;
  borrower: ItemOwner;
  lender: ItemOwner;
  status: LoanStatus;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
}

export interface CreateLoanPayload {
  itemId: string;
  startDate: string;
  dueDate: string;
}

export interface LoanAction {
  action: 'approve' | 'decline' | 'pickup' | 'return';
}
```

- [ ] **Step 2: Re-export in `client/lib/types.ts`**

Append:
```ts
export type {
  LoanRequestDTO as LoanRequest,
  LoanItemRef,
  LoanStatus,
  CreateLoanPayload,
  LoanAction,
} from '@neighborly/shared';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no existing consumer reads the old `LoanRequestDTO` string fields).

- [ ] **Step 4: Commit**

```bash
git add shared/src/index.ts client/lib/types.ts
git commit -m "feat(shared): loan DTO + payloads with 'active' status"
```

---

### Task 2: Migration — add `'active'` to the loan_status enum

**Files:**
- Modify: `server/src/db/schema.ts:19-24` (add `'active'` to `loanStatusEnum`)
- Create: `server/drizzle/0002_*.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: the DB enum value used by Task 3's transitions.

- [ ] **Step 1: Add the enum value in `server/src/db/schema.ts`**

Replace the `loanStatusEnum` declaration with:
```ts
export const loanStatusEnum = pgEnum('loan_status', [
  'pending',
  'approved',
  'declined',
  'active',
  'returned',
]);
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -w server`
Expected: a new `server/drizzle/0002_*.sql` containing `ALTER TYPE "public"."loan_status" ADD VALUE 'active';` (plus a `meta` snapshot update).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/schema.ts server/drizzle
git commit -m "feat(db): add 'active' to loan_status enum (migration)"
```

> Note: applying the SQL to a running Postgres happens in Task 9 (verification). `ALTER TYPE … ADD VALUE` cannot run inside a transaction, so apply the generated file directly (`psql "$DATABASE_URL" -f server/drizzle/0002_*.sql`).

---

### Task 3: Server data layer — mapper + loan service

**Files:**
- Modify: `server/src/db/mappers.ts` (add `toLoanRequestDTO`)
- Create: `server/src/services/loanService.ts`

**Interfaces:**
- Consumes: `db`; schema `loanRequests`, `items`, `users`; `httpError`; shared `LoanRequestDTO`, `LoanStatus`, `LoanItemRef`, `ItemOwner`.
- Produces:
  - `toLoanRequestDTO(loan, item, borrower, lender): LoanRequestDTO`
  - `nextLoanStatus(current: LoanStatus, action): LoanStatus | null`
  - `createLoanRequest(itemId, borrowerId, startDate, dueDate): Promise<LoanRequestDTO>`
  - `listLoansForUser(userId): Promise<LoanRequestDTO[]>`
  - `transitionLoan(id, lenderId, action): Promise<LoanRequestDTO>`

- [ ] **Step 1: Add `toLoanRequestDTO` to `server/src/db/mappers.ts`**

Update the top imports to include `LoanRequestDTO`, `LoanItemRef` from `@neighborly/shared` and `loanRequests` from `./schema.js`, then append:
```ts
type LoanItemRow = { id: string; title: string; images: { url: string }[]; listingType: LoanItemRef['listingType'] };

export function toLoanRequestDTO(
  loan: typeof loanRequests.$inferSelect,
  item: LoanItemRow,
  borrower: ItemOwner,
  lender: ItemOwner
): LoanRequestDTO {
  return {
    id: loan.id,
    item: { id: item.id, title: item.title, cover: item.images?.[0]?.url, listingType: item.listingType },
    borrower,
    lender,
    status: loan.status,
    startDate: loan.startDate?.toISOString(),
    dueDate: loan.dueDate?.toISOString(),
    createdAt: loan.createdAt.toISOString(),
  };
}
```

- [ ] **Step 2: Create `server/src/services/loanService.ts`**

```ts
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import { loanRequests, items, users } from '../db/schema.js';
import { toLoanRequestDTO } from '../db/mappers.js';
import { httpError } from '../middleware/error.js';
import type { LoanRequestDTO, LoanStatus, LoanAction, ItemOwner } from '@neighborly/shared';

const OPEN_STATUSES: LoanStatus[] = ['pending', 'approved', 'active'];

const TRANSITIONS: Record<LoanAction['action'], { from: LoanStatus; to: LoanStatus }> = {
  approve: { from: 'pending', to: 'approved' },
  decline: { from: 'pending', to: 'declined' },
  pickup: { from: 'approved', to: 'active' },
  return: { from: 'active', to: 'returned' },
};

/** The next status for a (current, action) pair, or null if the transition is illegal. Pure. */
export function nextLoanStatus(current: LoanStatus, action: LoanAction['action']): LoanStatus | null {
  const t = TRANSITIONS[action];
  return t && t.from === current ? t.to : null;
}

const ownerCols = {
  id: users.id,
  name: users.name,
  avatarUrl: users.avatarUrl,
  neighborhood: users.neighborhood,
};

/** Fetch a single loan as a DTO (joins item + both users), or null. */
async function loanDTOById(id: string): Promise<LoanRequestDTO | null> {
  const borrower = alias(users, 'borrower');
  const lender = alias(users, 'lender');
  const [row] = await db
    .select({
      loan: loanRequests,
      item: { id: items.id, title: items.title, images: items.images, listingType: items.listingType },
      borrower: { id: borrower.id, name: borrower.name, avatarUrl: borrower.avatarUrl, neighborhood: borrower.neighborhood },
      lender: { id: lender.id, name: lender.name, avatarUrl: lender.avatarUrl, neighborhood: lender.neighborhood },
    })
    .from(loanRequests)
    .innerJoin(items, eq(items.id, loanRequests.itemId))
    .innerJoin(borrower, eq(borrower.id, loanRequests.borrowerId))
    .innerJoin(lender, eq(lender.id, loanRequests.lenderId))
    .where(eq(loanRequests.id, id))
    .limit(1);
  if (!row) return null;
  return toLoanRequestDTO(row.loan, row.item, row.borrower as ItemOwner, row.lender as ItemOwner);
}

/** Create a pending loan request after validating eligibility. */
export async function createLoanRequest(
  itemId: string,
  borrowerId: string,
  startDate: string,
  dueDate: string
): Promise<LoanRequestDTO> {
  const [item] = await db
    .select({ id: items.id, ownerId: items.ownerId, listingType: items.listingType, status: items.status })
    .from(items)
    .where(eq(items.id, itemId));
  if (!item) throw httpError(404, 'Item not found');
  if (item.listingType !== 'loan') throw httpError(400, 'Only items offered to borrow can be requested');
  if (item.ownerId === borrowerId) throw httpError(400, 'You cannot borrow your own item');
  if (item.status !== 'available') throw httpError(400, 'This item is not available');

  const start = new Date(startDate);
  const due = new Date(dueDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime()) || due < start) {
    throw httpError(400, 'Provide a valid start date and a due date on or after it');
  }

  const open = await db
    .select({ id: loanRequests.id })
    .from(loanRequests)
    .where(and(eq(loanRequests.itemId, itemId), inArray(loanRequests.status, OPEN_STATUSES)))
    .limit(1);
  if (open.length) throw httpError(400, 'There is already an open request for this item');

  const [created] = await db
    .insert(loanRequests)
    .values({ itemId, borrowerId, lenderId: item.ownerId, status: 'pending', startDate: start, dueDate: due })
    .returning({ id: loanRequests.id });
  const dto = await loanDTOById(created.id);
  if (!dto) throw httpError(500, 'Could not load created loan');
  return dto;
}

/** Every loan where the user is borrower or lender, newest first. */
export async function listLoansForUser(userId: string): Promise<LoanRequestDTO[]> {
  const borrower = alias(users, 'borrower');
  const lender = alias(users, 'lender');
  const rows = await db
    .select({
      loan: loanRequests,
      item: { id: items.id, title: items.title, images: items.images, listingType: items.listingType },
      borrower: { id: borrower.id, name: borrower.name, avatarUrl: borrower.avatarUrl, neighborhood: borrower.neighborhood },
      lender: { id: lender.id, name: lender.name, avatarUrl: lender.avatarUrl, neighborhood: lender.neighborhood },
    })
    .from(loanRequests)
    .innerJoin(items, eq(items.id, loanRequests.itemId))
    .innerJoin(borrower, eq(borrower.id, loanRequests.borrowerId))
    .innerJoin(lender, eq(lender.id, loanRequests.lenderId))
    .where(or(eq(loanRequests.borrowerId, userId), eq(loanRequests.lenderId, userId)))
    .orderBy(desc(loanRequests.createdAt));
  return rows.map((r) =>
    toLoanRequestDTO(r.loan, r.item, r.borrower as ItemOwner, r.lender as ItemOwner)
  );
}

/** Apply a lender action, flipping item status on pickup/return, in one transaction. */
export async function transitionLoan(
  id: string,
  lenderId: string,
  action: LoanAction['action']
): Promise<LoanRequestDTO> {
  const [loan] = await db
    .select({ id: loanRequests.id, lenderId: loanRequests.lenderId, itemId: loanRequests.itemId, status: loanRequests.status })
    .from(loanRequests)
    .where(eq(loanRequests.id, id));
  if (!loan) throw httpError(404, 'Loan request not found');
  if (loan.lenderId !== lenderId) throw httpError(403, 'Only the owner can act on this request');

  const to = nextLoanStatus(loan.status, action);
  if (!to) throw httpError(409, `Cannot ${action} a ${loan.status} request`);

  await db.transaction(async (tx) => {
    await tx.update(loanRequests).set({ status: to }).where(eq(loanRequests.id, id));
    if (action === 'pickup') {
      await tx.update(items).set({ status: 'borrowed' }).where(eq(items.id, loan.itemId));
    } else if (action === 'return') {
      await tx.update(items).set({ status: 'available' }).where(eq(items.id, loan.itemId));
    }
  });

  const dto = await loanDTOById(id);
  if (!dto) throw httpError(500, 'Could not load loan after update');
  return dto;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/mappers.ts server/src/services/loanService.ts
git commit -m "feat(server): loan service (create, list, transition + item status flip)"
```

---

### Task 4: Loan REST controller + routes

**Files:**
- Create: `server/src/controllers/loanController.ts`
- Create: `server/src/routes/loanRoutes.ts`
- Modify: `server/src/index.ts` (mount at `/api/loans`)

**Interfaces:**
- Consumes: the loan service (Task 3); `auth`, `asyncHandler`, `httpError`; shared `LoanAction`.
- Produces: `POST /api/loans`, `GET /api/loans`, `PATCH /api/loans/:id`.

- [ ] **Step 1: Create `server/src/controllers/loanController.ts`**

```ts
import { asyncHandler, httpError } from '../middleware/error.js';
import { createLoanRequest, listLoansForUser, transitionLoan } from '../services/loanService.js';
import type { LoanAction } from '@neighborly/shared';

const ACTIONS: LoanAction['action'][] = ['approve', 'decline', 'pickup', 'return'];

/** POST /api/loans { itemId, startDate, dueDate } */
export const createLoan = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const { itemId, startDate, dueDate } = req.body ?? {};
  if (!itemId || typeof itemId !== 'string') throw httpError(400, 'itemId is required');
  if (typeof startDate !== 'string' || typeof dueDate !== 'string') {
    throw httpError(400, 'startDate and dueDate are required');
  }
  const loan = await createLoanRequest(itemId, req.userId, startDate, dueDate);
  res.status(201).json(loan);
});

/** GET /api/loans — the caller's loans (borrowing + lending). */
export const getLoans = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  res.json(await listLoansForUser(req.userId));
});

/** PATCH /api/loans/:id { action } — lender-only transition. */
export const actOnLoan = asyncHandler(async (req, res) => {
  if (!req.userId) throw httpError(401, 'Authentication required');
  const action = (req.body ?? {}).action;
  if (!ACTIONS.includes(action)) throw httpError(400, 'invalid action');
  const loan = await transitionLoan(String(req.params.id), req.userId, action);
  res.json(loan);
});
```

- [ ] **Step 2: Create `server/src/routes/loanRoutes.ts`**

```ts
import { Router } from 'express';
import { createLoan, getLoans, actOnLoan } from '../controllers/loanController.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.post('/', auth, createLoan);
router.get('/', auth, getLoans);
router.patch('/:id', auth, actOnLoan);

export default router;
```

- [ ] **Step 3: Mount in `server/src/index.ts`**

Add the import after the `conversationRoutes` import:
```ts
import loanRoutes from './routes/loanRoutes.js';
```
Add the mount after `app.use('/api/conversations', conversationRoutes);`:
```ts
app.use('/api/loans', loanRoutes);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/loanController.ts server/src/routes/loanRoutes.ts server/src/index.ts
git commit -m "feat(server): loan REST routes (create, list, transition)"
```

---

### Task 5: Client `LoansProvider` + hook

**Files:**
- Create: `client/lib/useLoans.tsx`
- Modify: `client/app/layout.tsx` (mount `<LoansProvider>` once)

**Interfaces:**
- Consumes: `api`; `useAuth`; shared `LoanRequest`, `CreateLoanPayload`, `LoanAction`.
- Produces: `LoansProvider`, and `useLoans(): { borrowing, lending, pendingIncoming, reload, request, act }`.

- [ ] **Step 1: Create `client/lib/useLoans.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { LoanRequest, CreateLoanPayload, LoanAction } from '@/lib/types';

interface LoansValue {
  borrowing: LoanRequest[];
  lending: LoanRequest[];
  pendingIncoming: number;
  reload: () => void;
  request: (payload: CreateLoanPayload) => Promise<LoanRequest>;
  act: (loanId: string, action: LoanAction['action']) => Promise<LoanRequest>;
}

const noop = async () => {
  throw new Error('LoansProvider missing');
};
const LoansContext = createContext<LoansValue>({
  borrowing: [],
  lending: [],
  pendingIncoming: 0,
  reload: () => {},
  request: noop,
  act: noop,
});

/** Single source of truth for loans (dashboard, item panel, navbar badge). Mount once. */
export function LoansProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loans, setLoans] = useState<LoanRequest[]>([]);

  const reload = useCallback(() => {
    api<LoanRequest[]>('/loans')
      .then(setLoans)
      .catch(() => setLoans([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setLoans([]);
      return;
    }
    reload();
  }, [user, reload]);

  const request = useCallback(
    async (payload: CreateLoanPayload) => {
      const loan = await api<LoanRequest>('/loans', { method: 'POST', body: JSON.stringify(payload) });
      reload();
      return loan;
    },
    [reload]
  );

  const act = useCallback(
    async (loanId: string, action: LoanAction['action']) => {
      const loan = await api<LoanRequest>(`/loans/${loanId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      reload();
      return loan;
    },
    [reload]
  );

  const value = useMemo<LoansValue>(() => {
    const borrowing = user ? loans.filter((l) => l.borrower.id === user.id) : [];
    const lending = user ? loans.filter((l) => l.lender.id === user.id) : [];
    const pendingIncoming = lending.filter((l) => l.status === 'pending').length;
    return { borrowing, lending, pendingIncoming, reload, request, act };
  }, [loans, user, reload, request, act]);

  return <LoansContext.Provider value={value}>{children}</LoansContext.Provider>;
}

export function useLoans(): LoansValue {
  return useContext(LoansContext);
}
```

- [ ] **Step 2: Mount `<LoansProvider>` in `client/app/layout.tsx`**

Add the import:
```ts
import { LoansProvider } from '@/lib/useLoans';
```
Wrap the existing `<ConversationsProvider>…</ConversationsProvider>` with `<LoansProvider>` so the body reads:
```tsx
        <AuthProvider>
          <ConversationsProvider>
            <LoansProvider>
              <Navbar />
              <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
            </LoansProvider>
          </ConversationsProvider>
        </AuthProvider>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/lib/useLoans.tsx client/app/layout.tsx
git commit -m "feat(client): LoansProvider + useLoans hook"
```

---

### Task 6: Loan components — form, status panel, card

**Files:**
- Create: `client/components/LoanRequestForm.tsx`
- Create: `client/components/LoanStatusPanel.tsx`
- Create: `client/components/LoanCard.tsx`

**Interfaces:**
- Consumes: `useLoans`, `useAuth`, shared `LoanRequest`/`LoanStatus`, `Item`.
- Produces: components used by the item page (Task 8) and the dashboard (Task 7).

- [ ] **Step 1: Create `client/components/LoanRequestForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useLoans } from '@/lib/useLoans';

export default function LoanRequestForm({ itemId }: { itemId: string }) {
  const { request } = useLoans();
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !dueDate) {
      setError('Pick a start and due date.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request({ itemId, startDate, dueDate });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="text-xs text-marigold-dark">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Pick up</label>
          <input type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Return by</label>
          <input type="date" className="field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Request to borrow'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `client/components/LoanCard.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLoans } from '@/lib/useLoans';
import type { LoanRequest, LoanAction } from '@/lib/types';

const STAMP: Record<LoanRequest['status'], string> = {
  pending: 'text-marigold-dark',
  approved: 'text-pine',
  active: 'text-pine',
  returned: 'text-muted',
  declined: 'text-muted',
};

/** Actions available to the lender for a given status. */
const LENDER_ACTIONS: Partial<Record<LoanRequest['status'], { action: LoanAction['action']; label: string }[]>> = {
  pending: [
    { action: 'approve', label: 'Approve' },
    { action: 'decline', label: 'Decline' },
  ],
  approved: [{ action: 'pickup', label: 'Mark picked up' }],
  active: [{ action: 'return', label: 'Mark returned' }],
};

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

export default function LoanCard({ loan, role }: { loan: LoanRequest; role: 'borrowing' | 'lending' }) {
  const { act } = useLoans();
  const [busy, setBusy] = useState(false);
  const other = role === 'lending' ? loan.borrower : loan.lender;
  const actions = role === 'lending' ? LENDER_ACTIONS[loan.status] ?? [] : [];

  async function run(action: LoanAction['action']) {
    setBusy(true);
    try {
      await act(loan.id, action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-tag border border-line bg-card p-3">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-tag border border-line bg-paper">
        {loan.item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loan.item.cover} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/items/${loan.item.id}`} className="truncate font-semibold hover:text-pine">
          {loan.item.title}
        </Link>
        <p className="truncate text-xs text-muted">
          {role === 'lending' ? 'Requested by' : 'From'} {other.name} · {fmt(loan.startDate)} → {fmt(loan.dueDate)}
        </p>
        <span className={`font-mono text-[0.7rem] font-semibold uppercase tracking-wider ${STAMP[loan.status]}`}>
          {loan.status}
        </span>
      </div>
      {actions.length > 0 && (
        <div className="flex shrink-0 gap-2">
          {actions.map((a) => (
            <button key={a.action} onClick={() => run(a.action)} disabled={busy} className="btn-ghost text-xs">
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `client/components/LoanStatusPanel.tsx`**

```tsx
'use client';

import { useAuth } from '@/lib/auth';
import { useLoans } from '@/lib/useLoans';
import type { Item } from '@/lib/types';
import LoanRequestForm from '@/components/LoanRequestForm';
import LoanCard from '@/components/LoanCard';

/** Item-page loan UI: request form, borrower's status, or owner's action card. */
export default function LoanStatusPanel({ item }: { item: Item }) {
  const { user } = useAuth();
  const { borrowing, lending } = useLoans();
  if (item.listingType !== 'loan' || !user) return null;

  const isOwner = item.owner?.id === user.id;
  const OPEN = ['pending', 'approved', 'active'];

  if (isOwner) {
    const incoming = lending.find((l) => l.item.id === item.id && OPEN.includes(l.status));
    if (!incoming) {
      return <p className="mt-4 text-sm text-muted">No active borrow requests for this item.</p>;
    }
    return (
      <div className="mt-4">
        <p className="label">Borrow request</p>
        <LoanCard loan={incoming} role="lending" />
      </div>
    );
  }

  const mine = borrowing.find((l) => l.item.id === item.id && OPEN.includes(l.status));
  if (mine) {
    return (
      <div className="mt-4">
        <p className="label">Your request</p>
        <LoanCard loan={mine} role="borrowing" />
      </div>
    );
  }
  if (item.status !== 'available') {
    return <p className="mt-4 text-sm text-muted">This item is currently {item.status}.</p>;
  }
  return (
    <div className="mt-4 rounded-tag border border-line bg-card p-4">
      <p className="label">Borrow this item</p>
      <LoanRequestForm itemId={item.id} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/components/LoanRequestForm.tsx client/components/LoanStatusPanel.tsx client/components/LoanCard.tsx
git commit -m "feat(client): loan components (form, status panel, card)"
```

---

### Task 7: `/loans` dashboard + navbar link

**Files:**
- Create: `client/app/loans/page.tsx`
- Modify: `client/components/Navbar.tsx` (Loans link + pending badge)

**Interfaces:**
- Consumes: `useLoans`, `useAuth`, `LoanCard`.
- Produces: the `/loans` route and the navbar entry.

- [ ] **Step 1: Create `client/app/loans/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLoans } from '@/lib/useLoans';
import LoanCard from '@/components/LoanCard';

export default function LoansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { borrowing, lending } = useLoans();
  const [tab, setTab] = useState<'borrowing' | 'lending'>('borrowing');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <p className="py-16 text-center text-muted">Loading…</p>;

  const list = tab === 'borrowing' ? borrowing : lending;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">Loans</h1>
      <div className="mb-4 flex gap-2">
        {(['borrowing', 'lending'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-tag border px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wider transition-colors ${
              tab === t ? 'border-pine bg-pine text-onaccent' : 'border-line bg-card text-muted hover:border-pine'
            }`}
          >
            {t === 'borrowing' ? 'Borrowing' : 'Lending'}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-tag border border-dashed border-line bg-card py-12 text-center text-muted">
          {tab === 'borrowing' ? 'No borrow requests yet.' : 'No incoming requests yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((loan) => (
            <LoanCard key={loan.id} loan={loan} role={tab} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the Loans link to `client/components/Navbar.tsx`**

Add the import:
```ts
import { useLoans } from '@/lib/useLoans';
```
After the existing `const { totalUnread } = useConversations();` line add:
```ts
  const { pendingIncoming } = useLoans();
```
In the authenticated branch, add a Loans link next to the Messages link (before "+ List an item"):
```tsx
              <Link href="/loans" className="relative px-3 py-2 text-sm font-medium text-muted hover:text-ink">
                Loans
                {pendingIncoming > 0 && (
                  <span className="absolute -right-1 -top-0.5 rounded-full bg-marigold px-1.5 font-mono text-[0.6rem] font-semibold text-onaccent">
                    {pendingIncoming}
                  </span>
                )}
              </Link>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS; compiles with the `/loans` route. (If a stale `.next` error about a missing module appears, run `rm -rf client/.next` and rebuild.)

- [ ] **Step 4: Commit**

```bash
git add client/app/loans/page.tsx client/components/Navbar.tsx
git commit -m "feat(client): /loans dashboard + navbar Loans link"
```

---

### Task 8: Item page — borrow panel

**Files:**
- Modify: `client/app/items/[id]/page.tsx` (render `LoanStatusPanel` for loan items)

**Interfaces:**
- Consumes: `LoanStatusPanel` (Task 6).
- Produces: the borrow CTA / owner actions on the item detail page.

- [ ] **Step 1: Render the panel on the item page**

In `client/app/items/[id]/page.tsx`, add the import near the other component imports:
```ts
import LoanStatusPanel from '@/components/LoanStatusPanel';
```
In the Details column, immediately AFTER the closing `</div>` of the action-buttons block (the `<div className="mt-6 flex flex-wrap gap-2">…</div>` that holds the owner/Message/Sign-in buttons), add:
```tsx
        {item.listingType === 'loan' && <LoanStatusPanel item={item} />}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS; compiles. (Clear `.next` and rebuild if a stale-cache module error appears.)

- [ ] **Step 3: Commit**

```bash
git add "client/app/items/[id]/page.tsx"
git commit -m "feat(client): borrow panel on loan item pages"
```

---

### Task 9: Full verification (migration apply + typecheck + build + manual e2e)

**Files:** none.

- [ ] **Step 1: Whole-repo typecheck**

Run: `npm run typecheck`
Expected: PASS (server + client).

- [ ] **Step 2: Builds**

Run: `npm run build -w server && npm run build -w client`
Expected: server exit 0; client "✓ Compiled successfully" with `/loans` listed.

- [ ] **Step 3: Start Postgres and APPLY the migration**

```bash
docker start neighborly-pg 2>/dev/null || docker run -d --name neighborly-pg -p 5432:5432 -e POSTGRES_USER=neighborly -e POSTGRES_PASSWORD=neighborly -e POSTGRES_DB=neighborly postgis/postgis:16-3.4
psql "postgresql://neighborly:neighborly@localhost:5432/neighborly" -f server/drizzle/0002_*.sql
```
Expected: `ALTER TYPE` succeeds (loan_status now includes 'active').

- [ ] **Step 4: Start both servers**

```bash
PORT=5001 npm run dev:server
npm run dev:client
```
(Match `client/.env.local` `NEXT_PUBLIC_API_URL` to the port.)

- [ ] **Step 5: Manual e2e (two accounts, CLAUDE.md definition of done)**

  - As borrower B, open owner A's **loan** item → "Request to borrow" → pick start + due → submit; the panel shows the request as PENDING; navbar Loans badge appears for A.
  - As A, `/loans` Lending tab (and the item page) show the request → **Approve**. Then **Mark picked up** → the item page status reads **borrowed** and B can no longer request.
  - As A, **Mark returned** → item back to **available**.
  - Verify **Decline** from pending; the **duplicate-request block** (B can't open a second request while one is open); and that A cannot request their own item (no form shown).

- [ ] **Step 6: Final commit (only if fixups were needed)**

```bash
git add -A
git commit -m "chore: verify Phase 3b loan workflow end-to-end"
```

---

## Self-Review notes

- **Spec coverage:** state machine + item coupling (Task 3 `nextLoanStatus`/`transitionLoan`), `active` migration (Task 2), contract additions (Task 1), REST (Task 4), provider/hook (Task 5), components (Task 6), dashboard + navbar badge (Task 7), item-page panel (Task 8), verification incl. migration apply (Task 9). All spec sections mapped.
- **Type consistency:** `LoanRequest`/`LoanStatus`/`LoanAction` from Task 1 used across Tasks 3–8; service signatures (`createLoanRequest`, `listLoansForUser`, `transitionLoan`, `nextLoanStatus`) defined in Task 3 and consumed in Task 4; `useLoans` shape from Task 5 consumed in Tasks 6–8; `LoanCard` `role` prop (`'borrowing' | 'lending'`) consistent between Tasks 6 and 7.
- **Provider-first (lesson from chat):** loans use a single `LoansProvider` from the start, so the navbar badge / dashboard / item panel share one state — no multi-mount over-count.
- **Each task ends green:** every task closes with a passing typecheck (UI tasks also build). The migration is generated in Task 2 and APPLIED in Task 9 (DB needed).
- **Placeholder scan:** none — every code step is complete.
