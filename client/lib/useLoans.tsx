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
