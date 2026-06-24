'use client';

import { useEffect, useState } from 'react';

/**
 * Toggles "after-hours" dark mode by flipping `.dark` on <html>.
 * Defaults to the OS preference (handled by the inline script in layout.tsx);
 * a manual choice is persisted to localStorage and wins thereafter.
 */
export default function ThemeToggle() {
  // null until mounted so server and first client render match (no hydration flash).
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* private mode / storage disabled — fall back to in-session only */
    }
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to day mode' : 'Switch to after-hours mode'}
      title={dark ? 'Day mode' : 'After-hours mode'}
      className="grid h-9 w-9 place-items-center rounded-tag border border-line bg-card text-base text-muted transition-colors hover:border-pine hover:text-ink"
    >
      <span aria-hidden>{dark == null ? '' : dark ? '☀' : '☾'}</span>
    </button>
  );
}
