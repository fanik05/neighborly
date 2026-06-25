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
