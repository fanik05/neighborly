'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function Navbar() {
  const { user, logout, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-tag bg-pine text-paper font-display text-lg">
            N
          </span>
          <span className="font-display text-xl font-bold tracking-tight">Neighborly</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link href="/" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:block">
            Browse
          </Link>
          {loading ? null : user ? (
            <>
              <Link href="/sell" className="btn-accent">
                + List an item
              </Link>
              <span className="hidden text-sm text-muted sm:inline">Hi, {user.name.split(' ')[0]}</span>
              <button onClick={logout} className="btn-ghost">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary">
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
