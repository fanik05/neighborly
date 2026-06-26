'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLoans } from '@/lib/useLoans';
import LoanCard from '@/components/LoanCard';
import Reveal from '@/components/Reveal';

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
      <h1 className="animate-rise mb-4 text-3xl font-bold">Loans</h1>
      <div className="animate-rise mb-4 flex gap-2" style={{ animationDelay: '60ms' }}>
        {(['borrowing', 'lending'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-wider transition-all ${
              tab === t
                ? 'border-pine bg-pine text-onaccent shadow-[0_6px_14px_-8px_rgba(47,95,224,0.7)]'
                : 'border-line bg-card text-muted hover:-translate-y-px hover:border-pine hover:text-pine'
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
          {list.map((loan, i) => (
            <Reveal key={loan.id} delay={Math.min(i, 8) * 50}>
              <LoanCard loan={loan} role={tab} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
