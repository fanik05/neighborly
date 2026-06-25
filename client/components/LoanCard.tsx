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
