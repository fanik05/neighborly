# Address / Place Search (Manual Location) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set location by typing an address/place (type & submit → pick a match) in both listing creation (Sell) and browsing (home feed), via one shared `<LocationSearch>` component.

**Architecture:** A pure `searchPlaces` helper (forward geocode via public Nominatim, reusing the existing `formatPlace` for labels) feeds a presentational `<LocationSearch>` component. The component reports a picked place up through `onSelect`; the Sell form uses it to set its existing coords+address state, and the home feed uses it as an optional override of the browser-geolocation center.

**Tech Stack:** Next.js 16 App Router + React 19 + TypeScript, public OpenStreetMap Nominatim (free, no key), Tailwind v4.

## Global Constraints

- Coordinates are ALWAYS `[longitude, latitude]` (GeoJSON order) at every boundary. The Leaflet `[lat, lng]` swap stays only inside `NearbyMap`.
- Interaction is **type & submit**, NOT autocomplete (public Nominatim usage policy forbids autocomplete request volume).
- Use the public Nominatim endpoint with `headers: { Accept: 'application/json' }`, exactly like the existing `reverseGeocode`. No API key.
- **No Vitest / no automated test framework** — it pulls in Vite→postcss and breaks the Next 16 Turbopack build. Each task's gate is `npm run typecheck -w client` passing (+ manual e2e and a production build in the final task).
- Reuse existing Tailwind component classes (`field`, `btn-ghost`, `btn-primary`, `rounded-tag`, `border-line`, `text-muted`, `text-ink`, `text-pine`, `text-marigold-dark`, `bg-paper`). No JS Tailwind config.
- `getBrowserLocation`/`reverseGeocode` keep their existing signatures; browser geolocation stays the on-load default. `PlaceResult` is a client-only view type (do NOT add it to `@neighborly/shared`).
- Each commit must leave `npm run typecheck -w client` clean.

---

### Task 1: `searchPlaces` forward-geocode helper

**Files:**
- Modify: `client/lib/geo.ts` (append `PlaceResult` + `searchPlaces`; do not change existing exports)

**Interfaces:**
- Consumes: the existing module-private `formatPlace(...)` and `NominatimAddress` in the same file.
- Produces:
  - `export interface PlaceResult { label: string; coords: [number, number] }` — `coords` are `[lng, lat]`.
  - `export async function searchPlaces(query: string): Promise<PlaceResult[]>` — `[]` for blank query (no request) and for zero matches; throws on non-OK / network error.

- [ ] **Step 1: Append the helper to `client/lib/geo.ts`**

Add at the end of the file (after `reverseGeocode`):
```ts

export interface PlaceResult {
  /** Concise "Area, City" label, consistent with reverseGeocode output. */
  label: string;
  /** [lng, lat] — GeoJSON order. */
  coords: [number, number];
}

interface NominatimSearchRow {
  lat: string;
  lon: string;
  address?: NominatimAddress;
  display_name?: string;
}

/**
 * Forward-geocode a typed query to up to 5 places via OpenStreetMap Nominatim
 * (free, no key). Returns [] for a blank query or no matches; throws on error.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not search for places');
  const rows = (await res.json()) as NominatimSearchRow[];
  return rows.map((row) => ({
    label: formatPlace(row),
    coords: [Number(row.lon), Number(row.lat)] as [number, number],
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS. (`formatPlace` and `NominatimAddress` are in the same file; `searchPlaces` passes each row — which has `address`/`display_name` — straight to `formatPlace`.)

- [ ] **Step 3: Commit**

```bash
git add client/lib/geo.ts
git commit -m "feat(client): searchPlaces forward-geocode helper"
```

---

### Task 2: `<LocationSearch>` shared component

**Files:**
- Create: `client/components/LocationSearch.tsx`

**Interfaces:**
- Consumes: `searchPlaces`, `PlaceResult` from `@/lib/geo`.
- Produces: default export `LocationSearch` with props `{ onSelect: (place: PlaceResult) => void; placeholder?: string }`.

- [ ] **Step 1: Create the component**

Create `client/components/LocationSearch.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { searchPlaces, type PlaceResult } from '@/lib/geo';

type Status = 'idle' | 'searching' | 'results' | 'empty' | 'error';

/**
 * Type-and-submit place search. Turns a typed query into a single picked place,
 * reported via onSelect. Owns only its own input/results/status state.
 */
export default function LocationSearch({
  onSelect,
  placeholder = 'Search an address or place',
}: {
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus('searching');
    try {
      const places = await searchPlaces(q);
      setResults(places);
      setStatus(places.length ? 'results' : 'empty');
    } catch {
      setResults([]);
      setStatus('error');
    }
  }

  function pick(place: PlaceResult) {
    onSelect(place);
    setResults([]);
    setStatus('idle');
    setQuery(place.label);
  }

  return (
    <div>
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Search for a place"
        />
        <button type="submit" className="btn-ghost shrink-0" disabled={status === 'searching'}>
          {status === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {status === 'results' && (
        <ul className="mt-2 overflow-hidden rounded-tag border border-line bg-card">
          {results.map((place, i) => (
            <li key={`${place.label}-${i}`}>
              <button
                type="button"
                onClick={() => pick(place)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
              >
                📍 {place.label || 'Unnamed place'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {status === 'empty' && <p className="mt-2 text-xs text-muted">No places found.</p>}
      {status === 'error' && (
        <p className="mt-2 text-xs text-marigold-dark">Couldn’t search, try again.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/components/LocationSearch.tsx
git commit -m "feat(client): LocationSearch type-and-submit place picker"
```

---

### Task 3: Home feed — override center + search + clear

This task changes the `useNearbyItems` signature AND its only caller (`app/page.tsx`) together, so the client type-checks at the end. Do both files before committing.

**Files:**
- Modify: `client/lib/useNearbyItems.ts` (add `override` input; effective center = `override ?? browserCoords`)
- Modify: `client/app/page.tsx` (override state, `<LocationSearch>`, "Showing near … · Clear" affordance)

**Interfaces:**
- Consumes: `LocationSearch`, `PlaceResult` from `@/lib/geo`; existing `api`/`qs`/`getBrowserLocation`.
- Produces: `useNearbyItems({ type, radius, override }: { type: ListingType | 'all'; radius: number; override: [number, number] | null }): { items: Item[]; loading: boolean; coords: [number, number] | null }` — returned `coords` is the **effective** center (`override ?? browserCoords`).

- [ ] **Step 1: Replace `client/lib/useNearbyItems.ts` entirely**

```ts
'use client';

import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { getBrowserLocation } from '@/lib/geo';
import type { Item, ListingType } from '@/lib/types';

interface NearbyOpts {
  type: ListingType | 'all';
  radius: number;
  /** Manual center override (e.g. a searched place); falls back to browser location when null. */
  override: [number, number] | null;
}

/**
 * Owns geolocation capture + the /items fetch for the home feed.
 * Effective center = override ?? browser location; falls back to a non-geo
 * (newest-first) request when neither is available.
 */
export function useNearbyItems({ type, radius, override }: NearbyOpts) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserCoords, setBrowserCoords] = useState<[number, number] | null>(null);

  // Capture the visitor's location once.
  useEffect(() => {
    getBrowserLocation()
      .then(setBrowserCoords)
      .catch(() => setBrowserCoords(null));
  }, []);

  const coords = override ?? browserCoords;

  useEffect(() => {
    setLoading(true);
    const query = qs({
      type: type === 'all' ? undefined : type,
      lng: coords?.[0],
      lat: coords?.[1],
      radius: coords ? radius : undefined,
    });
    api<Item[]>(`/items${query}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [type, radius, coords]);

  return { items, loading, coords };
}
```

- [ ] **Step 2: Update imports in `client/app/page.tsx`**

Replace the import block (lines 3-10) with:
```tsx
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useNearbyItems } from '@/lib/useNearbyItems';
import { distanceMiles, formatDistance, type PlaceResult } from '@/lib/geo';
import type { ListingType } from '@/lib/types';
import ItemCard from '@/components/ItemCard';
import FilterBar from '@/components/FilterBar';
import LocationSearch from '@/components/LocationSearch';
```

- [ ] **Step 3: Add override state and wire the hook**

Replace the component's state/hook lines (currently lines 18-20):
```tsx
  const [filter, setFilter] = useState<ListingType | 'all'>('all');
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
  const { items, loading, coords } = useNearbyItems({ type: filter, radius });
```
with:
```tsx
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
```

- [ ] **Step 4: Add the search + clear affordance above FilterBar**

Replace the `<div id="feed">…</div>` block (currently lines 45-54) with:
```tsx
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
```

- [ ] **Step 5: Typecheck (both files now consistent)**

Run: `npm run typecheck -w client`
Expected: PASS — the hook signature and call site agree.

- [ ] **Step 6: Commit**

```bash
git add client/lib/useNearbyItems.ts client/app/page.tsx
git commit -m "feat(client): home feed address search with override + clear"
```

---

### Task 4: Sell page integration

**Files:**
- Modify: `client/app/sell/page.tsx` (add `<LocationSearch>` in the Location section; selecting a place sets `coords` + `address`)

**Interfaces:**
- Consumes: `LocationSearch` from `@/components/LocationSearch`; existing `setCoords`, `setAddress` setters and `coords`/`address`/`locating` state.
- Produces: a Sell page where a searched place satisfies the existing `if (!coords)` submit guard.

- [ ] **Step 1: Add the import**

In `client/app/sell/page.tsx`, after the existing `import ImageUploader from '@/components/ImageUploader';` line, add:
```tsx
import LocationSearch from '@/components/LocationSearch';
```

- [ ] **Step 2: Add `<LocationSearch>` under the "Use my current location" button**

In the Location `<div>` (the block beginning `<label className="label">Location</label>`), immediately AFTER the closing `</button>` of the "Use my current location" button and BEFORE the `{coords && (` pinned-confirmation paragraph, insert:
```tsx
          <div className="mt-2">
            <p className="mb-1 text-xs text-muted">or search an address or place</p>
            <LocationSearch
              onSelect={(p) => {
                setCoords(p.coords);
                setAddress(p.label);
              }}
              placeholder="e.g. Williamsburg, Brooklyn"
            />
          </div>
```
(The existing `{coords && (…Pinned in {address}…)}` confirmation below will then reflect a searched place too, since it reads the same `coords`/`address` state.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/app/sell/page.tsx
git commit -m "feat(client): address search on Sell page as a geolocation alternative"
```

---

### Task 5: Full verification (typecheck + build + manual e2e)

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 2: Production build (guards against the Turbopack/postcss class of error)**

Run: `npm run build -w client`
Expected: "✓ Compiled successfully" and a route table — no "Module not found" errors.

- [ ] **Step 3: Start Postgres + both servers**

Run:
```bash
docker start neighborly-pg 2>/dev/null || docker run -d --name neighborly-pg -p 5432:5432 -e POSTGRES_USER=neighborly -e POSTGRES_PASSWORD=neighborly -e POSTGRES_DB=neighborly postgis/postgis:16-3.4
PORT=5001 npm run dev:server   # match client/.env.local NEXT_PUBLIC_API_URL if 5000 is taken by AirPlay
npm run dev:client
```

- [ ] **Step 4: Manual e2e checklist (CLAUDE.md definition of done)**

Open http://localhost:3000 and verify:
  - **Sell:** go to `/sell`, deny/skip browser location, type a place in the search, pick a result → the confirmation reads "Pinned in <place>" and the listing submits successfully (item appears at that location).
  - **Feed:** on the home page, search a neighborhood → the feed, map "you are here" marker, distance labels, and radius filter all recenter on the searched place; the "📍 Showing near <place> · Clear" affordance appears.
  - **Clear:** click Clear → the feed reverts to browser location (or to the non-geo newest-first feed if the browser never granted location).
  - **Errors:** search gibberish → "No places found"; (optionally, offline) → "Couldn’t search, try again". No crashes.

- [ ] **Step 5: Final commit (only if verification required fixups)**

```bash
git add -A
git commit -m "chore: verify address/place search end-to-end"
```
(Skip if nothing needed changing.)

---

## Self-Review notes

- **Spec coverage:** `searchPlaces` helper (Task 1), shared `<LocationSearch>` (Task 2), feed override via `useNearbyItems` + page wiring with clear affordance (Task 3), Sell integration (Task 4), typecheck/build/manual verification incl. no-Vitest posture (Task 5). All spec sections mapped.
- **Type consistency:** `PlaceResult { label; coords:[number,number] }` defined in Task 1, consumed unchanged in Tasks 2/3/4; `useNearbyItems({type,radius,override})` defined and called within Task 3 (same task, no cross-task signature gap); `onSelect: (place: PlaceResult) => void` consistent across Tasks 2/3/4.
- **Every task ends green:** the hook signature change and its only call site live in one task (Task 3), so no commit leaves the client failing typecheck.
- **Placeholder scan:** none — every code step is complete.
```
