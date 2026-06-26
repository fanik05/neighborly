'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useConversations } from '@/lib/useConversations';
import { useLoans } from '@/lib/useLoans';
import ThemeToggle from '@/components/ThemeToggle';
import AccountMenu from '@/components/AccountMenu';

function NavLink({
  href,
  label,
  badge,
  active,
}: {
  href: string;
  label: string;
  badge?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-pine/10 text-pine' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      {badge && badge > 0 ? (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-marigold px-1 font-mono text-[0.6rem] font-bold text-onaccent">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function Navbar() {
  const { user, loading } = useAuth();
  const { totalUnread } = useConversations();
  const { pendingIncoming } = useLoans();
  const pathname = usePathname();
  const is = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-tag bg-pine font-display text-lg font-bold text-onaccent">
            N
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="font-display text-lg font-bold tracking-tight">Neighborly</span>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              your block, shared
            </span>
          </span>
        </Link>

        {/* Navigate */}
        <nav className="flex flex-1 items-center justify-center gap-1">
          <NavLink href="/" label="Browse" active={is('/')} />
          {user && (
            <NavLink href="/messages" label="Messages" badge={totalUnread} active={is('/messages')} />
          )}
          {user && <NavLink href="/loans" label="Loans" badge={pendingIncoming} active={is('/loans')} />}
        </nav>

        {/* Act + account */}
        <div className="flex shrink-0 items-center gap-2">
          {loading ? null : user ? (
            <>
              <Link href="/sell" className="btn-accent">
                <span className="hidden sm:inline">List an item</span>
                <span className="sm:hidden">+ List</span>
              </Link>
              <span className="hidden h-6 w-px bg-line sm:block" />
              <AccountMenu />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary">
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
