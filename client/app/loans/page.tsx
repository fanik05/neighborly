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
