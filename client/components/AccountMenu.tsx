'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';

/** The "you" cluster: an initials chip that opens a small account card. */
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const initials = user.name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-1 pr-2 transition-colors hover:border-pine"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-pine font-display text-xs font-bold text-onaccent">
          {initials}
        </span>
        <span className="font-mono text-[0.7rem] text-muted">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-rise absolute right-0 top-[calc(100%+0.5rem)] w-56 overflow-hidden rounded-tag border border-line bg-card shadow-card"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="font-mono text-[0.6rem] uppercase tracking-wider text-muted">Signed in as</p>
            <p className="truncate font-semibold">{user.name}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-muted">Appearance</span>
            <ThemeToggle />
          </div>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="block w-full border-t border-line px-4 py-2.5 text-left text-sm font-medium hover:bg-paper"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
