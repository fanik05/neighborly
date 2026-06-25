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
