'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import { getBrowserLocation, distanceMiles, formatDistance } from '@/lib/geo';
import type { Item, ListingType } from '@/lib/types';
import ItemCard from '@/components/ItemCard';

const FILTERS: { key: ListingType | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'loan', label: 'To borrow' },
  { key: 'sale', label: 'For sale' },
  { key: 'free', label: 'Free' },
];

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ListingType | 'all'>('all');
  const [coords, setCoords] = useState<[number, number] | null>(null);

  // Try to capture the visitor's location once so we can show distances.
  useEffect(() => {
    getBrowserLocation()
      .then(setCoords)
      .catch(() => setCoords(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = qs({
      type: filter === 'all' ? undefined : filter,
      lng: coords?.[0],
      lat: coords?.[1],
      radius: coords ? 50000 : undefined, // 50km while seeding; tighten in Phase 2 UI
    });
    api<Item[]>(`/items${query}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter, coords]);

  return (
    <div>
      {/* Hero — the thesis: what can I get from my street right now? */}
      <section className="mb-8 rounded-tag border border-line bg-white p-6 shadow-card sm:p-10">
        <p className="font-display text-sm font-semibold uppercase tracking-widest text-marigold-dark">
          {coords ? 'Near you' : 'Your neighborhood'}
        </p>
        <h1 className="mt-2 max-w-2xl text-4xl font-bold leading-[1.05] sm:text-5xl">
          Borrow the drill. Sell the bike. Lend a hand.
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Neighborly is the shared shed for your street — find tools and goods a short walk away.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/sell" className="btn-accent">
            List an item
          </Link>
          <a href="#feed" className="btn-ghost">
            Browse nearby
          </a>
        </div>
      </section>

      {/* Filter rail */}
      <div id="feed" className="mb-5 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`tag-tab border ${
                filter === f.key
                  ? 'border-pine bg-pine text-paper'
                  : 'border-line bg-white text-muted hover:border-pine'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{items.length} listings</span>
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted">Finding what’s nearby…</p>
      ) : items.length === 0 ? (
        <div className="rounded-tag border border-dashed border-line bg-white py-16 text-center">
          <p className="font-display text-lg font-semibold">Nothing listed here yet</p>
          <p className="mt-1 text-muted">Be the first to share something with your neighbors.</p>
          <Link href="/sell" className="btn-primary mt-4">
            List the first item
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              distance={
                coords && item.location?.coordinates
                  ? formatDistance(distanceMiles(coords, item.location.coordinates))
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
