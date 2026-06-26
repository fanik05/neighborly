'use client';

import type { ListingType } from '@/lib/types';

const FILTERS: { key: ListingType | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'loan', label: 'To borrow' },
  { key: 'sale', label: 'For sale' },
  { key: 'free', label: 'Free' },
];

const RADII = [
  { meters: 1609, label: '1 mi' },
  { meters: 8047, label: '5 mi' },
  { meters: 16093, label: '10 mi' },
  { meters: 40233, label: '25 mi' },
  { meters: 80467, label: '50 mi' },
];

export default function FilterBar({
  filter,
  onFilter,
  radius,
  onRadius,
  showRadius,
  count,
}: {
  filter: ListingType | 'all';
  onFilter: (f: ListingType | 'all') => void;
  radius: number;
  onRadius: (m: number) => void;
  showRadius: boolean;
  count: number;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            className={`rounded-full border px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-wider transition-all ${
              filter === f.key
                ? 'border-pine bg-pine text-onaccent shadow-[0_6px_14px_-8px_rgba(47,95,224,0.7)]'
                : 'border-line bg-card text-muted hover:-translate-y-px hover:border-pine hover:text-pine'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {showRadius && (
          <select
            className="w-auto rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/15"
            aria-label="Nearby radius"
            value={radius}
            onChange={(e) => onRadius(Number(e.target.value))}
          >
            {RADII.map((r) => (
              <option key={r.meters} value={r.meters}>
                Within {r.label}
              </option>
            ))}
          </select>
        )}
        <span className="font-mono text-xs uppercase tracking-wider text-muted">{count} listings</span>
      </div>
    </div>
  );
}
