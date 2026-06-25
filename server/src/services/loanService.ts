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
