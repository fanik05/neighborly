'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useNearbyItems } from '@/lib/useNearbyItems';
import { distanceMiles, formatDistance, type PlaceResult } from '@/lib/geo';
import type { ListingType } from '@/lib/types';
import ItemCard from '@/components/ItemCard';
import FilterBar from '@/components/FilterBar';
import LocationSearch from '@/components/LocationSearch';
import Reveal from '@/components/Reveal';

const NearbyMap = dynamic(() => import('@/components/NearbyMap'), { ssr: false });

// Default to a 10-mile feed so results stay local without feeling empty.
const DEFAULT_RADIUS_METERS = 16093;

export default function HomePage() {
  const [filter, setFilter] = useState<ListingType | 'all'>('all');
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
  const [override, setOverride] = useState<[number, number] | null>(null);
  const [overrideLabel, setOverrideLabel] = useState('');
  const { items, loading, coords } = useNearbyItems({ type: filter, radius, override });

  function pickPlace(place: PlaceResult) {
    setOverride(place.coords);
    setOverrideLabel(place.label);
  }

  function clearPlace() {
    setOverride(null);
    setOverrideLabel('');
  }

  return (
    <div>
      {/* Hero — a living map of your block */}
      <section className="relative mb-10 overflow-hidden rounded-tag border border-line bg-card p-6 shadow-card sm:p-12">
        {/* ambient wayfinding backdrop: drifting map grid + a self-drawing route to a pin */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -inset-10"
            style={{
              backgroundImage: 'radial-gradient(var(--color-pine) 1.4px, transparent 1.4px)',
              backgroundSize: '26px 26px',
              opacity: 0.1,
              animation: 'drift 22s linear infinite alternate',
            }}
          />
          <svg
            className="absolute right-0 top-0 hidden h-full w-2/3 lg:block"
            viewBox="0 0 420 320"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
          >
            <path
              d="M10 280 C 130 280, 120 110, 250 110 S 400 80, 414 70"
              stroke="var(--color-pine)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="720"
              strokeDashoffset="720"
              style={{ animation: 'route-draw 2.2s var(--ease-out-back) 0.5s forwards', opacity: 0.5 }}
            />
            <circle cx="10" cy="280" r="6" fill="var(--color-pine)" opacity="0.6" />
          </svg>
          <span
            className="animate-pin absolute right-[14%] top-[16%] hidden text-4xl lg:block"
            style={{ animationDelay: '2.5s' }}
          >
            📍
          </span>
        </div>

        <div className="relative">
          <p className="animate-rise tag-tab text-pine" style={{ animationDelay: '40ms' }}>
            ◍ {coords ? 'Near you' : 'Your neighborhood'}
          </p>
          <h1
            className="animate-rise mt-3 max-w-2xl text-4xl leading-[1.05] sm:text-6xl"
            style={{ animationDelay: '120ms' }}
          >
            Everything on your <span className="text-pine">block</span>,
            <br className="hidden sm:block" /> a short walk away.
          </h1>
          <p className="animate-rise mt-4 max-w-xl text-muted" style={{ animationDelay: '200ms' }}>
            Borrow the drill, sell the bike, lend a hand — Neighborly maps what the people on your
            street are sharing right now.
          </p>
          <div className="animate-rise mt-7 flex flex-wrap gap-3" style={{ animationDelay: '280ms' }}>
            <Link href="/sell" className="btn-accent">
              List an item
            </Link>
            <a href="#feed" className="btn-ghost">
              Browse nearby
            </a>
          </div>
        </div>
      </section>

      <div id="feed" className="mb-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:max-w-sm sm:flex-1">
            <LocationSearch onSelect={pickPlace} placeholder="Search a neighborhood or address" />
          </div>
          {override && (
            <p className="text-xs text-muted">
              📍 Showing near <span className="font-semibold text-ink">{overrideLabel}</span> ·{' '}
              <button type="button" onClick={clearPlace} className="text-pine underline">
                Clear
              </button>
            </p>
          )}
        </div>
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
        <section className="mb-5 overflow-hidden rounded-tag border border-line bg-card p-2">
          <NearbyMap items={items} coords={coords} />
        </section>
      )}

      {loading ? (
        <p className="py-16 text-center text-muted">Finding what's nearby…</p>
      ) : items.length === 0 ? (
        <div className="rounded-tag border border-dashed border-line bg-card py-16 text-center">
          <p className="font-display text-lg font-semibold">Nothing listed here yet</p>
          <p className="mt-1 text-muted">Be the first to share something with your neighbors.</p>
          <Link href="/sell" className="btn-primary mt-4">
            List the first item
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item, i) => (
            <Reveal key={item.id} delay={Math.min(i, 8) * 60}>
              <ItemCard
                item={item}
                distance={
                  coords && item.location?.coordinates
                    ? formatDistance(distanceMiles(coords, item.location.coordinates))
                    : undefined
                }
              />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
