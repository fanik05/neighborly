# Phase 2 — "Items Near Me" Browsing & Discovery (fresh rebuild)

**Date:** 2026-06-24
**Status:** Approved design, ready for implementation plan
**Context:** Clean, learning-oriented rebuild of Phase 2. The previously-committed Phase 2
implementation works end-to-end; we are rebuilding it from a clean design to the **same feature
scope**, removing the old browse-layer code first and rebuilding on the Phase 1 foundation. A
separate later cycle will redo Phase 3 (chat + loan workflow).

## Goal

Reproduce the current Phase 2 capabilities — geolocation, radius filter (1–50 mi), Leaflet map
with markers, distance labels, type filter, nearest-first ordering — with a cleaner, more testable
architecture: focused units that each do one job and can be understood/tested in isolation.

Non-goals: changing the visual design language, adding new browse capabilities (clustering,
list↔map hover sync, saved areas), or touching Phase 1 (auth, item CRUD, uploads) or Phase 3.

## Scope & boundary

**Phase 1 foundation — untouched:** auth, item CRUD (`createItem`/`getItem`/`updateItem`/
`deleteItem`), Cloudinary uploads, `ItemCard` (except its distance label), layout/nav,
login/register, DB schema, mappers, shared `ItemDTO`.

**Phase 2 — the discovery layer, rebuilt fresh:**
- **Server:** the geo-aware `GET /api/items` query — filter by `lng/lat/radius/category/type/q`,
  order nearest-first via PostGIS `ST_DWithin` + `<->`.
- **Client:** the home feed (`app/page.tsx`), the Leaflet map (`NearbyMap.tsx`), and the
  browse-distance helpers (`distanceMiles`, `formatDistance`) + the distance label on `ItemCard`.

**Shared geo infrastructure — stays (NOT Phase 2):** `getBrowserLocation` and `reverseGeocode` in
`lib/geo.ts`. The Sell page (listing creation, Phase 1) depends on these, so they remain. Only the
browse-specific helpers (`distanceMiles`, `formatDistance`) are rebuilt; `getBrowserLocation`/
`reverseGeocode` are preserved as-is.

## Architecture & components

Target structure — small units, one responsibility each.

### Server (`server/src/controllers/itemController.ts`)
- **`buildItemQuery(filters)`** — a focused helper that assembles WHERE conditions + ORDER BY from
  parsed filters (`{ lng?, lat?, radius, category?, type?, q? }`). Keeps the geo SQL in one
  testable place. Geo branch uses `ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography`,
  `ST_DWithin(location::geography, point, radius)`, and orders by `location::geography <-> point`;
  non-geo branch orders by `createdAt DESC`.
- **`listItems`** — thin handler: parse/validate query params → call `buildItemQuery` → run query →
  map rows through `toItemDTO`. Invalid params degrade gracefully (e.g. non-numeric `radius` →
  default 5000; missing `lng`/`lat` → non-geo path) rather than 500.

### Client
- **`lib/geo.ts`** (browse helpers) — `distanceMiles(a, b)` (Haversine, `[lng,lat]` inputs) and
  `formatDistance(miles)`. Pure, no DOM, unit-testable. `getBrowserLocation`/`reverseGeocode`
  remain in this file unchanged.
- **`useNearbyItems(filters)`** hook (`client/lib/useNearbyItems.ts`) — owns geolocation capture,
  the `/items` fetch, and `items/loading/coords` state. Returns `{ items, loading, coords }`. The
  page becomes pure layout.
- **`<FilterBar>`** (`client/components/FilterBar.tsx`) — presentational type filter + radius
  selector; receives current values + change handlers as props.
- **`<NearbyMap>`** (`client/components/NearbyMap.tsx`) — Leaflet `MapContainer`, dynamic
  `ssr: false` import, "you are here" marker + item markers with popups. Rebuilt clean; swaps
  GeoJSON `[lng,lat]` → Leaflet `[lat,lng]` internally only.
- **`app/page.tsx`** — composition only: hero + `<FilterBar>` + `<NearbyMap>` + item grid
  (`ItemCard` with `distanceMiles`/`formatDistance`). Calls `useNearbyItems`.

## Data flow

```
Browser geolocation ──[lng,lat]──┐
FilterBar (type/radius) ──────────┤
                                  ▼
                          useNearbyItems ──GET /api/items?lng&lat&radius&type──► listItems
                                  │                                                  │
                                  │                                         buildItemQuery
                                  │                                         ST_DWithin + <-> order
                                  ▼                                                  │
                          items[] ◄─────────── ItemDTO[] ◄── toItemDTO ◄─────────────┘
                                  │
                    ┌────────────┴────────────┐
                    ▼                         ▼
              <NearbyMap>              item grid (ItemCard + distanceMiles)
```

Coordinates are `[longitude, latitude]` (GeoJSON) everywhere at the API boundary, per CLAUDE.md.
The Leaflet `[lat, lng]` swap happens only inside `NearbyMap`.

## Error handling & edge cases

- **Geolocation denied/unavailable** → feed falls back to newest-first (request omits `lng/lat`),
  the radius selector hides, and distance labels are not shown.
- **No items in radius** → empty state with a "list the first item" CTA.
- **Fetch failure** → empty list, no crash (graceful; component stays mounted).
- **Invalid/out-of-range query params** server-side → ignored or defaulted, never a 500.

## Testing strategy

The rebuild adds the test rigor the original lacked. A test runner will be added: **Vitest**
(fits the TS/ESM/workspace setup), as a dev dependency.

- **Pure unit tests (TDD):**
  - `distanceMiles` / `formatDistance` — known coordinate pairs → known miles; threshold formatting
    ("right here", "x.x mi", "xx mi").
  - `buildItemQuery` — filter combinations produce the expected SQL fragments / ORDER BY
    (geo vs non-geo path, type/category/q presence).
- **Manual end-to-end (CLAUDE.md definition of done):** run both servers and verify the
  geolocation feed, radius changes, map markers, distance labels, type filtering, and the
  no-location fallback work end-to-end before claiming completion.

## Removal-then-rebuild order

1. Add Vitest to the relevant workspace(s) with a minimal config + script.
2. Remove the browse-layer code: `NearbyMap.tsx`, the browse body of `app/page.tsx`, the
   `distanceMiles`/`formatDistance` helpers, the geo query in `listItems`, and the distance label
   on `ItemCard`. (Leave `getBrowserLocation`/`reverseGeocode`, all Phase 1 code intact.)
3. Rebuild server-side: `buildItemQuery` + thin `listItems` (with unit tests first).
4. Rebuild client helpers (`distanceMiles`/`formatDistance`, with unit tests first).
5. Rebuild `useNearbyItems`, `<FilterBar>`, `<NearbyMap>`, then compose `app/page.tsx`; restore the
   `ItemCard` distance label.
6. Manual end-to-end verification.

## Conventions to honor (from CLAUDE.md)

- API success returns the resource/array directly; errors `{ error }` via the central middleware.
- Never return `password_hash`; map through `db/mappers.ts`.
- PostGIS `geometry(point, 4326)`, mode `xy`, `[lng, lat]` at the boundary; `::geography` casts for
  meters; GiST index already present on `items.location`.
- Server is ESM + NodeNext: relative imports use the `.js` extension from `.ts`.
- Shared API types live once in `@neighborly/shared`, imported with `import type`.
- Tailwind v4 CSS-first; reuse existing `@theme` tokens and component classes.
```
