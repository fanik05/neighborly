'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import PasswordInput from '@/components/PasswordInput';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(name, email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise mx-auto max-w-sm">
      <div className="rounded-tag border border-line bg-card p-6 shadow-card sm:p-8">
      <h1 className="text-3xl font-bold">Join your neighborhood</h1>
      <p className="mt-1 text-muted">Borrow a drill, sell a bike, lend a hand.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-tag bg-marigold/15 px-3 py-2 text-sm text-marigold-dark">{error}</p>}
        <div>
          <label className="label">Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <p className="mt-1 text-xs text-muted">At least 6 characters.</p>
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted">
        Already a member?{' '}
        <Link href="/login" className="font-semibold text-pine">
          Sign in
        </Link>
      </p>
      </div>
    </div>
  );
}
