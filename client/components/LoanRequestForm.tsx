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
