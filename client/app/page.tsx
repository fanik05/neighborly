'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useNearbyItems } from '@/lib/useNearbyItems';
import { distanceMiles, formatDistance } from '@/lib/geo';
import type { ListingType } from '@/lib/types';
import ItemCard from '@/components/ItemCard';
import FilterBar from '@/components/FilterBar';

const NearbyMap = dynamic(() => import('@/components/NearbyMap'), { ssr: false });

// Default to a 10-mile feed so results stay local without feeling empty.
const DEFAULT_RADIUS_METERS = 16093;

export default function HomePage() {
  const [filter, setFilter] = useState<ListingType | 'all'>('all');
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
  const { items, loading, coords } = useNearbyItems({ type: filter, radius });

  return (
    <div>
      {/* Hero — the lending desk: what can I check out from my street right now? */}
      <section className="relative mb-8 overflow-hidden rounded-tag border border-line bg-card p-6 shadow-card sm:p-10">
        {/* corner rubber stamp — the signature */}
        <span className="pointer-events-none absolute right-4 top-4 hidden rotate-[7deg] items-center rounded-[3px] border-2 border-stamp px-2 py-1 font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-stamp sm:inline-flex">
          Lend · Borrow · Trade
        </span>

        <p className="tag-tab text-pine">The lending desk · {coords ? 'near you' : 'your neighborhood'}</p>
        <h1 className="mt-3 max-w-2xl text-4xl leading-none sm:text-6xl">
          Borrow the drill.
          <br />
          Sell the bike.
          <br />
          Lend a hand.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Neighborly is the shared shed for your street — check out tools and goods a short walk
          away.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/sell" className="btn-accent">
            List an item
          </Link>
          <a href="#feed" className="btn-ghost">
            Browse the catalog
          </a>
        </div>
      </section>

      <div id="feed">
        <FilterBar
          filter={filter}
          onFilter={setFilter}
          radius={radius}
          onRadius={setRadius}
          showRadius={Boolean(coords)}
          count={items.length}
        />
      </div>

      {!loading && items.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-tag border border-line bg-white p-2">
          <NearbyMap items={items} coords={coords} />
        </section>
      )}

      {loading ? (
        <p className="py-16 text-center text-muted">Finding what's nearby…</p>
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
