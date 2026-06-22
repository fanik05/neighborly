'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api, qs } from '@/lib/api';
import { getBrowserLocation, distanceMiles, formatDistance } from '@/lib/geo';
import type { Item, ListingType } from '@/lib/types';
import ItemCard from '@/components/ItemCard';

const NearbyMap = dynamic(() => import('@/components/NearbyMap'), { ssr: false });

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
// Default to a 10-mile feed so results stay local without feeling empty.
const DEFAULT_RADIUS_METERS = 16093;

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ListingType | 'all'>('all');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);

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
      radius: coords ? radius : undefined,
    });
    api<Item[]>(`/items${query}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter, coords, radius]);

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
        <div className="flex items-center gap-2">
          {coords && (
            <select
              className="field !w-auto !py-1.5 !text-xs"
              aria-label="Nearby radius"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {RADII.map((r) => (
                <option key={r.meters} value={r.meters}>
                  Within {r.label}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-muted">{items.length} listings</span>
        </div>
      </div>

      {!loading && items.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-tag border border-line bg-white p-2">
          <NearbyMap items={items} coords={coords} />
        </section>
      )}

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
