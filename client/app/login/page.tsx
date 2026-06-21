'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to message neighbors and list your goods.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-tag bg-marigold/15 px-3 py-2 text-sm text-marigold-dark">{error}</p>}
        <div>
          <label className="label">Email</label>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        New here?{' '}
        <Link href="/register" className="font-semibold text-pine">
          Join your neighborhood
        </Link>
      </p>
    </div>
  );
}
