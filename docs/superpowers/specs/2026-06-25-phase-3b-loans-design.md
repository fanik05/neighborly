# Phase 3b — Loan Request Workflow

**Date:** 2026-06-25
**Status:** Approved design, ready for implementation plan
**Context:** Phase 3 in the README is "Socket.io chat + loan request workflow." Phase 3a (chat) is
done (PR #5, branch `phase-3a-chat`). This spec covers the **loan request workflow**. The
`loan_requests` table already exists (`itemId`, `borrowerId`, `lenderId`, `status`, `startDate`,
`dueDate`, `createdAt`) and `LoanRequestDTO` / `LoanStatus` are in `@neighborly/shared`. No loan
controller/routes/service exist yet.

**Branch:** stacked on `phase-3a-chat` (both modify the item detail page; stacking avoids a merge
conflict). The Phase 3b PR targets `phase-3a-chat`.

## Goal

Let a neighbor request to borrow a loan-type item, and let the owner run it through a clear,
lender-driven lifecycle, with the item's availability kept in sync.

Non-goals: payments/deposits, ratings/reviews, overdue reminders, borrower-side cancel/return,
real-time push for loan events (the `/loans` page fetches on load), multi-item or recurring loans.

## Lifecycle & state machine

A new loan status **`active`** (the "picked up" state) is added to the `loan_status` enum. The full
set becomes `pending | approved | declined | active | returned`. All transitions are **lender-driven**
except the initial request:

```
(borrower) request ─▶ pending ─▶ (lender) approve ─▶ approved ─▶ (lender) pickup ─▶ active ─▶ (lender) return ─▶ returned
                         └──────▶ (lender) decline ─▶ declined
```

- **Item-status coupling:** `pickup` flips `items.status` `available → borrowed`; `return` flips
  `borrowed → available`. Approve/decline do NOT change item status — the physical handoff does.
- **Double-booking prevention:** a new request is allowed only when the item is `available`, is
  `listingType === 'loan'`, the requester is not the owner, and there is **no open request**
  (status in `pending | approved | active`) for that item.
- **Legal transitions** (enforced by a pure `nextLoanStatus(current, action)` helper that returns
  the next status or `null`):
  - `approve`: `pending → approved`
  - `decline`: `pending → declined`
  - `pickup`: `approved → active`
  - `return`: `active → returned`
  Any other (current, action) pair → `null` → 409.

## Authorization

- **Create:** any authenticated user who is not the owner, on an available loan item.
- **approve / decline / pickup / return:** only the **lender** (the item owner / `loan.lenderId`).
- All loan routes are under `auth`; the transition handler verifies `loan.lenderId === req.userId`.

## Data & contract (`@neighborly/shared`)

- Add `'active'` to `LoanStatus`.
- Expand `LoanRequestDTO` so the dashboard can render without extra fetches:
  ```ts
  export interface LoanItemRef { id: string; title: string; cover?: string; listingType: ListingType }
  export interface LoanRequestDTO {
    id: string;
    item: LoanItemRef;          // was: string
    borrower: ItemOwner;        // was: string
    lender: ItemOwner;          // was: string
    status: LoanStatus;
    startDate?: string;
    dueDate?: string;
    createdAt: string;
  }
  export interface CreateLoanPayload { itemId: string; startDate: string; dueDate: string }
  export interface LoanAction { action: 'approve' | 'decline' | 'pickup' | 'return' }
  ```

## Server structure

- **Migration:** `ALTER TYPE loan_status ADD VALUE 'active';` Edit `loanStatusEnum` in
  `server/src/db/schema.ts`, run `npm run db:generate -w server`, and apply the SQL. (`ADD VALUE`
  can't run inside a transaction — apply it standalone.)
- **`db/mappers.ts`:** add `toLoanRequestDTO(loan, item, borrower, lender)` (owner-column whitelist
  for borrower/lender; never `password_hash`).
- **`services/loanService.ts`:**
  - `nextLoanStatus(current: LoanStatus, action): LoanStatus | null` — pure transition table.
  - `createLoanRequest(itemId, borrowerId, startDate, dueDate)` — validates loan-type + available +
    not owner + no open request + `dueDate >= startDate`; inserts `pending` with
    `lenderId = item.ownerId`; throws `httpError` 400/404 on violations.
  - `listLoansForUser(userId)` — every loan where the user is borrower or lender, newest first,
    each mapped to `LoanRequestDTO`.
  - `transitionLoan(id, lenderId, action)` — loads the loan, checks `lenderId` match (403),
    computes `nextLoanStatus` (409 if null), and in a **transaction** updates the loan status and,
    on `pickup`/`return`, flips `items.status`.
- **`controllers/loanController.ts`:** `createLoan`, `listLoans`, `transition` (thin handlers).
- **`routes/loanRoutes.ts`** (all under `auth`): `POST /`, `GET /`, `PATCH /:id`; mounted at
  `/api/loans` in `index.ts`.

## Client structure

- `lib/types.ts` — re-export `LoanRequest` (=`LoanRequestDTO`), `LoanStatus`, `LoanItemRef`,
  `CreateLoanPayload`, `LoanAction`.
- `lib/useLoans.ts` — fetch the user's loans, split into `borrowing` / `lending`, expose a
  `pendingIncoming` count and a `reload`; `act(loanId, action)` + `request(payload)` helpers.
- `components/LoanRequestForm.tsx` — start/due date inputs + submit (used on the item page).
- `components/LoanStatusPanel.tsx` — on the item page for the owner: shows the open request /
  active loan with the relevant action buttons; for a borrower with an open request, shows its
  status.
- `components/LoanCard.tsx` — one loan row for the dashboard (item, other party, dates, mono status
  stamp, action buttons when lending).
- `app/loans/page.tsx` — the dashboard with **Borrowing** / **Lending** tabs.
- `app/items/[id]/page.tsx` — add the borrow CTA + `LoanStatusPanel` for loan items.
- `components/Navbar.tsx` — a **Loans** link with a `pendingIncoming` badge.

## Surfaces / UX

- **Item page (loan items):** a borrower who isn't the owner and where the item is `available` with
  no open request sees **"Request to borrow"** → `LoanRequestForm` (start + due) → POST. The owner
  sees `LoanStatusPanel`: a pending request with **Approve/Decline**, or an approved loan with
  **Mark picked up**, or an active loan with **Mark returned**. When a loan is open, the borrow CTA
  is hidden/disabled with a status note.
- **`/loans`:** auth-gated (redirect to `/login`). Two tabs; **Borrowing** lists my outgoing
  requests (read-only status), **Lending** lists incoming with the lender action buttons. Status
  rendered as a mono stamp (PENDING / APPROVED / ACTIVE / RETURNED / DECLINED).
- **Navbar:** Loans link with a count of incoming pending requests (`pendingIncoming`).

## Error handling & edge cases

- Non-loan or unavailable item, requesting your own item, a duplicate open request, or
  `dueDate < startDate` → 400.
- A non-lender attempting a transition → 403; an illegal (current, action) pair → 409; unknown loan
  → 404.
- Item-status flips happen in the same transaction as the loan transition, so they can't drift.
- Item deleted while a loan exists → `loan_requests.itemId` cascade-deletes the loan (per schema FK
  `onDelete: cascade`); dashboards simply stop showing it.
- A `sold` item is never `available`, so it can't be requested.

## Testing strategy

- **No Vitest** (breaks the Turbopack build). The pure `nextLoanStatus` is unit-testable later with
  `node:test` + `tsx`; for now gate on `npm run typecheck` + `npm run build -w client`/`-w server`.
- **Manual e2e** (CLAUDE.md definition of done, two accounts): borrower requests a loan item with
  dates → lender sees it on `/loans` Lending + the item page → Approve → Mark picked up (item shows
  **borrowed**, borrow CTA gone) → Mark returned (item back to **available**). Verify Decline, the
  duplicate-request block, and the navbar pending badge.

## Conventions honored (CLAUDE.md)

- Drizzle: enum/index changes in `schema.ts`; FK `onDelete` already set; apply the generated SQL.
- All write/owned routes under `auth`; check ownership/role before mutating. Never return
  `password_hash` — map via `db/mappers.ts`.
- Server ESM + NodeNext: `.js` import extensions. Shared API types once in `@neighborly/shared`,
  imported with `import type`.
- Tailwind v4 Lending Desk tokens/classes; never `bg-white` (use `bg-card`); status as `font-mono`
  stamps.
