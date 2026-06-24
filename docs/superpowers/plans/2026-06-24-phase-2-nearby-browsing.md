# Phase 2 — Nearby Browsing & Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Phase 2 (geolocation-aware "items near me" browsing — radius filter, Leaflet map, distance labels, type filter, nearest-first ordering) from a clean, testable architecture, matching the existing feature scope.

**Architecture:** Server extracts pure query-filter parsing (`parseItemFilters`) from the route handler, then assembles PostGIS SQL from it. Client splits the monolithic home page into a `useNearbyItems` data hook, a presentational `<FilterBar>`, a rebuilt `<NearbyMap>`, and a thin composition page. The entire `lib/geo.ts` module is rebuilt, with pure helpers covered by Vitest unit tests.

**Tech Stack:** Express 5 + Drizzle ORM + PostGIS (server), Next.js 16 App Router + React 19 + react-leaflet (client), Vitest (new, unit tests for pure helpers), TypeScript throughout, npm workspaces.

## Global Constraints

- Coordinates are ALWAYS `[longitude, latitude]` (GeoJSON order) at the API boundary; the Leaflet `[lat, lng]` swap happens only inside `NearbyMap`.
- PostGIS: `geometry(point, 4326)` mode `xy`; distance/radius use `::geography` casts so units are meters (`ST_DWithin`, `<->`). GiST index `items_location_idx` already exists.
- API success returns the resource/array directly; errors return `{ error }` with correct status via the central error middleware (use `httpError`/`asyncHandler`). Never `res.send` ad-hoc errors. Never return `password_hash` — map through `db/mappers.ts`.
- Server is ESM + NodeNext: relative imports use the `.js` extension even from `.ts` files.
- Shared API types live once in `@neighborly/shared`, imported with `import type`.
- Tailwind v4 CSS-first: reuse existing `@theme` tokens and component classes (`btn-accent`, `tag-tab`, `rounded-tag`, `text-muted`, `text-pine`, `border-line`, etc.). Do not add a JS Tailwind config.
- `getBrowserLocation(): Promise<[lng, lat]>` and `reverseGeocode(lng, lat): Promise<string>` MUST keep these exact signatures — the Phase 1 Sell page (`client/app/sell/page.tsx`) imports them.
- Each commit must leave the repo type-checking (`npm run typecheck`) — rebuild file contents in place; do not commit a broken intermediate.

---

### Task 1: Add Vitest tooling to client and server workspaces

**Files:**
- Modify: `client/package.json` (add devDependency + `test` script)
- Modify: `server/package.json` (add devDependency + `test` script)
- Modify: `package.json` (root — add aggregate `test` script)
- Test: `client/lib/smoke.test.ts` (temporary smoke test, deleted at end of task)
- Test: `server/src/smoke.test.ts` (temporary smoke test, deleted at end of task)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run test -w client` and `npm run test -w server` both run Vitest; `npm test` from root runs both.

- [ ] **Step 1: Install Vitest in both workspaces**

Run:
```bash
npm install -D -w client vitest
npm install -D -w server vitest
```
Expected: both workspaces gain `vitest` under devDependencies; root `package-lock.json` updates.

- [ ] **Step 2: Add `test` scripts**

In `client/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```
In `server/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```
In root `package.json`, add to `"scripts"`:
```json
"test": "npm run test -w client && npm run test -w server"
```

- [ ] **Step 3: Write smoke tests to prove each runner works**

Create `client/lib/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';

test('client vitest runs', () => {
  expect(1 + 1).toBe(2);
});
```
Create `server/src/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';

test('server vitest runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Run both test runners**

Run: `npm test`
Expected: both workspaces report 1 passing test each.

- [ ] **Step 5: Delete the smoke tests**

Run:
```bash
rm client/lib/smoke.test.ts server/src/smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json client/package.json server/package.json
git commit -m "build: add Vitest to client and server workspaces"
```

---

### Task 2: Server — pure `parseItemFilters` query parser (TDD)

**Files:**
- Create: `server/src/controllers/itemFilters.ts`
- Test: `server/src/controllers/itemFilters.test.ts`

**Interfaces:**
- Consumes: `ListingType` from `@neighborly/shared`.
- Produces:
  - `interface ItemFilters { hasGeo: boolean; lng?: number; lat?: number; radius: number; category?: string; type?: ListingType; q?: string }`
  - `function parseItemFilters(query: Record<string, unknown>): ItemFilters` — pure, no DB. Defaults `radius` to `5000`; `hasGeo` true only when both `lng` and `lat` parse to finite numbers; `type` kept only if it is a valid `ListingType`; empty/whitespace `category`/`q` dropped; non-finite/≤0 `radius` falls back to `5000`.

- [ ] **Step 1: Write the failing test**

Create `server/src/controllers/itemFilters.test.ts`:
```ts
import { describe, test, expect } from 'vitest';
import { parseItemFilters } from './itemFilters.js';

describe('parseItemFilters', () => {
  test('no params → non-geo, default radius, no filters', () => {
    expect(parseItemFilters({})).toEqual({ hasGeo: false, radius: 5000 });
  });

  test('valid lng/lat → geo with parsed coords', () => {
    const f = parseItemFilters({ lng: '-74.006', lat: '40.7128' });
    expect(f.hasGeo).toBe(true);
    expect(f.lng).toBeCloseTo(-74.006, 5);
    expect(f.lat).toBeCloseTo(40.7128, 5);
  });

  test('only one of lng/lat → non-geo', () => {
    expect(parseItemFilters({ lng: '-74.006' }).hasGeo).toBe(false);
  });

  test('custom radius is honored', () => {
    expect(parseItemFilters({ radius: '16093' }).radius).toBe(16093);
  });

  test('invalid radius falls back to default', () => {
    expect(parseItemFilters({ radius: 'abc' }).radius).toBe(5000);
    expect(parseItemFilters({ radius: '0' }).radius).toBe(5000);
    expect(parseItemFilters({ radius: '-5' }).radius).toBe(5000);
  });

  test('valid type kept, invalid type dropped', () => {
    expect(parseItemFilters({ type: 'loan' }).type).toBe('loan');
    expect(parseItemFilters({ type: 'banana' }).type).toBeUndefined();
  });

  test('empty category/q dropped, real values kept', () => {
    expect(parseItemFilters({ category: '  ', q: '' })).toEqual({ hasGeo: false, radius: 5000 });
    const f = parseItemFilters({ category: 'tools', q: 'drill' });
    expect(f.category).toBe('tools');
    expect(f.q).toBe('drill');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w server`
Expected: FAIL — cannot resolve `./itemFilters.js` / `parseItemFilters` not defined.

- [ ] **Step 3: Write the implementation**

Create `server/src/controllers/itemFilters.ts`:
```ts
import type { ListingType } from '@neighborly/shared';

const LISTING_TYPES: ListingType[] = ['sale', 'loan', 'free'];
const DEFAULT_RADIUS_METERS = 5000;

export interface ItemFilters {
  hasGeo: boolean;
  lng?: number;
  lat?: number;
  radius: number;
  category?: string;
  type?: ListingType;
  q?: string;
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/** Parse raw request query into a normalized, validated ItemFilters. Pure — no DB. */
export function parseItemFilters(query: Record<string, unknown>): ItemFilters {
  const lng = num(query.lng);
  const lat = num(query.lat);
  const hasGeo = lng !== undefined && lat !== undefined;

  const radiusRaw = num(query.radius);
  const radius = radiusRaw !== undefined && radiusRaw > 0 ? radiusRaw : DEFAULT_RADIUS_METERS;

  const typeRaw = str(query.type);
  const type =
    typeRaw && LISTING_TYPES.includes(typeRaw as ListingType) ? (typeRaw as ListingType) : undefined;

  const filters: ItemFilters = { hasGeo, radius };
  if (hasGeo) {
    filters.lng = lng;
    filters.lat = lat;
  }
  const category = str(query.category);
  if (category) filters.category = category;
  if (type) filters.type = type;
  const q = str(query.q);
  if (q) filters.q = q;
  return filters;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w server`
Expected: PASS — all `parseItemFilters` tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/itemFilters.ts server/src/controllers/itemFilters.test.ts
git commit -m "feat(server): pure parseItemFilters query parser with tests"
```

---

### Task 3: Server — rebuild `listItems` to use `parseItemFilters` + PostGIS query

**Files:**
- Modify: `server/src/controllers/itemController.ts:25-53` (replace the `listItems` handler and its inline filter logic)
- Verify: `server/src/routes/itemRoutes.ts` (no change — `router.get('/', listItems)` already wired)

**Interfaces:**
- Consumes: `parseItemFilters`, `ItemFilters` from `./itemFilters.js`; existing `toItemDTO`, `ownerCols`, `db`, `items`, `users`.
- Produces: `listItems` handler — `GET /api/items` returns `ItemDTO[]`, geo-filtered + nearest-first when `hasGeo`, else newest-first.

- [ ] **Step 1: Replace the `listItems` handler**

In `server/src/controllers/itemController.ts`, update the import block near the top to add:
```ts
import { parseItemFilters } from './itemFilters.js';
```
Then replace the entire `listItems` export (currently lines 20-53, the JSDoc block + handler) with:
```ts
/**
 * GET /api/items
 * Optional query: lng, lat, radius (meters, default 5000), category, type, q.
 * When lng+lat are present, results are filtered to the radius and ordered nearest-first.
 */
export const listItems = asyncHandler(async (req, res) => {
  const f = parseItemFilters(req.query as Record<string, unknown>);
  const conds: SQL[] = [];

  if (f.category) conds.push(eq(items.category, f.category));
  if (f.type) conds.push(eq(items.listingType, f.type));
  if (f.q) {
    conds.push(
      sql`to_tsvector('english', ${items.title} || ' ' || ${items.description}) @@ plainto_tsquery('english', ${f.q})`
    );
  }

  const point =
    f.hasGeo && f.lng !== undefined && f.lat !== undefined
      ? sql`ST_SetSRID(ST_MakePoint(${f.lng}, ${f.lat}), 4326)::geography`
      : null;
  if (point) {
    conds.push(sql`ST_DWithin(${items.location}::geography, ${point}, ${f.radius})`);
  }

  const rows = await db
    .select({ item: items, owner: ownerCols })
    .from(items)
    .innerJoin(users, eq(items.ownerId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(point ? sql`${items.location}::geography <-> ${point}` : desc(items.createdAt))
    .limit(100);

  res.json(rows.map((r) => toItemDTO(r.item, r.owner)));
});
```
Leave `getItem`, `createItem`, `updateItem`, `deleteItem` unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w server`
Expected: PASS — no type errors. (`SQL`, `and`, `desc`, `eq`, `sql` are already imported at the top of the file.)

- [ ] **Step 3: Server-existing unit tests still pass**

Run: `npm run test -w server`
Expected: PASS — `parseItemFilters` tests still green (handler itself is verified manually in Task 9).

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/itemController.ts
git commit -m "feat(server): rebuild listItems on parseItemFilters + PostGIS radius query"
```

---

### Task 4: Client — rebuild `lib/geo.ts` in full (TDD for pure helpers)

**Files:**
- Modify: `client/lib/geo.ts` (rebuild the entire module from scratch)
- Test: `client/lib/geo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `client/lib/geo.ts`):
  - `getBrowserLocation(): Promise<[number, number]>` — `[lng, lat]` (unchanged signature)
  - `distanceMiles(a: [number, number], b: [number, number]): number` — Haversine, `[lng, lat]` inputs
  - `formatDistance(miles: number): string`
  - `reverseGeocode(lng: number, lat: number): Promise<string>` (unchanged signature)
  - `formatPlace(data: { address?: NominatimAddress; display_name?: string }): string` — exported for testing

- [ ] **Step 1: Write the failing test**

Create `client/lib/geo.test.ts`:
```ts
import { describe, test, expect } from 'vitest';
import { distanceMiles, formatDistance, formatPlace } from './geo';

describe('distanceMiles', () => {
  test('same point is zero', () => {
    expect(distanceMiles([-74.006, 40.7128], [-74.006, 40.7128])).toBeCloseTo(0, 5);
  });

  test('NYC → LA is about 2445 miles', () => {
    const d = distanceMiles([-74.006, 40.7128], [-118.2437, 34.0522]);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });
});

describe('formatDistance', () => {
  test('very close reads "right here"', () => {
    expect(formatDistance(0.05)).toBe('right here');
  });
  test('under 10 miles keeps one decimal', () => {
    expect(formatDistance(5.234)).toBe('5.2 mi');
  });
  test('10+ miles rounds to whole', () => {
    expect(formatDistance(42.6)).toBe('43 mi');
  });
});

describe('formatPlace', () => {
  test('builds "Area, City" from neighbourhood + city', () => {
    expect(formatPlace({ address: { neighbourhood: 'Williamsburg', city: 'New York' } })).toBe(
      'Williamsburg, New York'
    );
  });
  test('skips junk administrative areas', () => {
    expect(formatPlace({ address: { suburb: 'Community Board 1', city: 'New York' } })).toBe(
      'New York'
    );
  });
  test('falls back to display_name when no structured address', () => {
    expect(formatPlace({ display_name: 'Main St, Springfield, USA' })).toBe('Main St, Springfield');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w client`
Expected: FAIL — `formatPlace` not exported / functions not defined (the current `geo.ts` does not export `formatPlace`).

- [ ] **Step 3: Rebuild `client/lib/geo.ts`**

Replace the entire contents of `client/lib/geo.ts` with:
```ts
/** Ask the browser for the user's current position as [lng, lat]. */
export function getBrowserLocation(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject(new Error('Geolocation is not available in this browser'));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      (err) => reject(new Error(err.message || 'Could not get your location')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/** Haversine distance in miles between two [lng, lat] points. */
export function distanceMiles(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 3958.8; // earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Friendly distance label for the feed. */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'right here';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  road?: string;
}

/** Administrative labels that read as bureaucratic, not as a place name. */
const isJunkArea = (s?: string): boolean =>
  !s || /community board|electoral|census|district \d|ward \d/i.test(s);

/** Build a concise "Area, City" label from a Nominatim address object. */
export function formatPlace(data: { address?: NominatimAddress; display_name?: string }): string {
  const a = data.address ?? {};
  const area = [a.neighbourhood, a.suburb, a.quarter, a.city_district, a.road].find(
    (v) => !isJunkArea(v)
  );
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const parts = [area, city].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i
  );
  if (parts.length) return parts.join(', ');
  return data.display_name?.split(',').slice(0, 2).join(', ').trim() ?? '';
}

/**
 * Reverse-geocode [lng, lat] to a human-readable place name via OpenStreetMap
 * Nominatim (free, no key). Returns '' if it can't resolve a name.
 */
export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not look up place name');
  return formatPlace(await res.json());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w client`
Expected: PASS — all `geo.test.ts` cases green.

- [ ] **Step 5: Typecheck (Sell page still compiles against rebuilt module)**

Run: `npm run typecheck -w client`
Expected: PASS — `client/app/sell/page.tsx` still imports `getBrowserLocation`/`reverseGeocode` with unchanged signatures.

- [ ] **Step 6: Commit**

```bash
git add client/lib/geo.ts client/lib/geo.test.ts
git commit -m "feat(client): rebuild lib/geo.ts with unit-tested pure helpers"
```

---

### Task 5: Client — `useNearbyItems` data hook

**Files:**
- Create: `client/lib/useNearbyItems.ts`

**Interfaces:**
- Consumes: `api`, `qs` from `@/lib/api`; `getBrowserLocation` from `@/lib/geo`; `Item`, `ListingType` from `@/lib/types`.
- Produces: `useNearbyItems(opts: { type: ListingType | 'all'; radius: number }): { items: Item[]; loading: boolean; coords: [number, number] | null }`.

- [ ] **Step 1: Create the hook**

Create `client/lib/useNearbyItems.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { getBrowserLocation } from '@/lib/geo';
import type { Item, ListingType } from '@/lib/types';

interface NearbyOpts {
  type: ListingType | 'all';
  radius: number;
}

/**
 * Owns geolocation capture + the /items fetch for the home feed.
 * Falls back to a non-geo (newest-first) request when location is unavailable.
 */
export function useNearbyItems({ type, radius }: NearbyOpts) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<[number, number] | null>(null);

  // Capture the visitor's location once.
  useEffect(() => {
    getBrowserLocation()
      .then(setCoords)
      .catch(() => setCoords(null));
  }, []);

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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/lib/useNearbyItems.ts
git commit -m "feat(client): useNearbyItems hook for geo feed fetching"
```

---

### Task 6: Client — `<FilterBar>` component

**Files:**
- Create: `client/components/FilterBar.tsx`

**Interfaces:**
- Consumes: `ListingType` from `@/lib/types`.
- Produces: default export `FilterBar` with props `{ filter: ListingType | 'all'; onFilter: (f: ListingType | 'all') => void; radius: number; onRadius: (m: number) => void; showRadius: boolean; count: number }`.

- [ ] **Step 1: Create the component**

Create `client/components/FilterBar.tsx`:
```tsx
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
        {showRadius && (
          <select
            className="w-auto rounded-tag border border-line bg-white px-3 py-1.5 text-xs outline-none focus:border-pine focus:ring-2 focus:ring-pine/15"
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
        <span className="text-xs text-muted">{count} listings</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/components/FilterBar.tsx
git commit -m "feat(client): presentational FilterBar (type + radius)"
```

---

### Task 7: Client — rebuild `<NearbyMap>`

**Files:**
- Modify: `client/components/NearbyMap.tsx` (rebuild from scratch)

**Interfaces:**
- Consumes: `Item` from `@/lib/types`.
- Produces: default export `NearbyMap` with props `{ items: Item[]; coords: [number, number] | null }`. Loaded via `next/dynamic` with `ssr: false` by the page (Task 8).

- [ ] **Step 1: Rebuild the component**

Replace the entire contents of `client/components/NearbyMap.tsx` with:
```tsx
'use client';

import Link from 'next/link';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { Item } from '@/lib/types';

// Fallback map center (New York City) in Leaflet's [lat, lng] order.
const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];

export default function NearbyMap({
  items,
  coords,
}: {
  items: Item[];
  coords: [number, number] | null;
}) {
  // Our API/DB use GeoJSON [lng, lat]; Leaflet wants [lat, lng] — swap here only.
  const center = coords ? ([coords[1], coords[0]] as [number, number]) : DEFAULT_CENTER;

  return (
    <div aria-label="Nearby listings map">
      <MapContainer
        center={center}
        zoom={coords ? 12 : 10}
        scrollWheelZoom
        className="h-80 w-full rounded-tag"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {coords && (
          <CircleMarker
            center={[coords[1], coords[0]]}
            radius={8}
            pathOptions={{ color: '#1f4d3b', weight: 3 }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}

        {items.map((item) => (
          <CircleMarker
            key={item.id}
            center={[item.location.coordinates[1], item.location.coordinates[0]]}
            radius={7}
            pathOptions={{ color: '#e8a33d', weight: 2 }}
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{item.title}</p>
                <Link className="text-sm text-pine underline" href={`/items/${item.id}`}>
                  View details
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/components/NearbyMap.tsx
git commit -m "feat(client): rebuild NearbyMap with you-are-here + item markers"
```

---

### Task 8: Client — compose `app/page.tsx` + restore `ItemCard` distance label

**Files:**
- Modify: `client/app/page.tsx` (rebuild as thin composition)
- Verify: `client/components/ItemCard.tsx` (already renders `distance` prop — confirm, no change needed)

**Interfaces:**
- Consumes: `useNearbyItems`, `FilterBar`, `NearbyMap` (dynamic), `ItemCard`, `distanceMiles`, `formatDistance`, `Item`, `ListingType`.
- Produces: the home page UI.

- [ ] **Step 1: Rebuild the home page**

Replace the entire contents of `client/app/page.tsx` with:
```tsx
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
```

- [ ] **Step 2: Confirm `ItemCard` renders the distance label**

Read `client/components/ItemCard.tsx` — confirm it accepts `distance?: string` and renders `📍 {distance}`. It does (no change needed).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/app/page.tsx
git commit -m "feat(client): compose home feed from useNearbyItems + FilterBar + NearbyMap"
```

---

### Task 9: Full verification (automated + manual end-to-end)

**Files:** none (verification only).

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: PASS — server `parseItemFilters` + client `geo` suites all green.

- [ ] **Step 2: Typecheck the whole repo**

Run: `npm run typecheck`
Expected: PASS — server and client both clean.

- [ ] **Step 3: Start Postgres (if not already running)**

Run:
```bash
docker start neighborly-pg 2>/dev/null || docker run -d --name neighborly-pg -p 5432:5432 -e POSTGRES_USER=neighborly -e POSTGRES_PASSWORD=neighborly -e POSTGRES_DB=neighborly postgis/postgis:16-3.4
```
Expected: container running on :5432.

- [ ] **Step 4: Start both servers**

Run (two terminals, server first):
```bash
PORT=5001 npm run dev:server
npm run dev:client
```
Note: ensure `client/.env.local` `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SOCKET_URL` match the chosen port (5001 if AirPlay holds 5000).

- [ ] **Step 5: Manual end-to-end checklist (CLAUDE.md definition of done)**

Open http://localhost:3000 and verify:
  - Allow location → hero reads "Near you", radius selector visible, distance labels (📍) on cards, map shows a green "you are here" marker + amber item markers.
  - Change radius (1 → 50 mi) → listing count and markers update.
  - Switch type filters (Everything / To borrow / For sale / Free) → feed updates.
  - Click a map marker popup "View details" → navigates to the item page.
  - Block/deny location (or use a private window and dismiss the prompt) → hero reads "Your neighborhood", radius selector hidden, no distance labels, feed still shows newest-first.
  - Visit `/sell`, confirm "Use my current location" + place-name resolution still work (Sell page unaffected by the geo.ts rebuild).

- [ ] **Step 6: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore: Phase 2 nearby browsing verified end-to-end"
```
(If no fixups were required, skip this step.)

---

## Self-Review notes

- **Spec coverage:** geo query (Tasks 2–3), full `lib/geo.ts` rebuild incl. unchanged `getBrowserLocation`/`reverseGeocode` signatures (Task 4), `useNearbyItems` hook (Task 5), `FilterBar` (Task 6), `NearbyMap` (Task 7), composed page + `ItemCard` distance label (Task 8), Vitest tooling (Task 1), manual + automated verification (Task 9). All spec sections mapped.
- **Refinement vs. spec:** the spec proposed unit-testing `buildItemQuery` SQL fragments; this plan tests the pure `parseItemFilters` parser instead (where the real branching/validation lives) and verifies the thin SQL assembly via manual e2e — Drizzle `SQL` objects are not meaningfully assertable without a DB. Same coverage intent, more robust tests.
- **Type consistency:** `ItemFilters`/`parseItemFilters` (Task 2) consumed unchanged in Task 3; `useNearbyItems` return shape (Task 5) matches the page's usage (Task 8); `FilterBar` props (Task 6) match the page's call site (Task 8); `NearbyMap` props (Task 7) match Task 8.
- **Placeholder scan:** none — every code step contains complete content.
