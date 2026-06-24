# Address / Place Search — Manual Location

**Date:** 2026-06-25
**Status:** Approved design, ready for implementation plan
**Context:** Today both location flows are browser-geolocation only. The home feed
(`useNearbyItems`) calls `getBrowserLocation()` and silently falls back to a non-geo feed if
denied; the Sell page hard-requires browser coordinates to list an item. There is no way to set a
location manually. This feature adds **address/place search** (type a place → pick from matches →
use its coordinates), reused in both flows.

## Goal

Let a user set their location by typing an address/place name instead of relying on the browser's
geolocation, in both listing creation (Sell) and browsing (home feed).

Non-goals: autocomplete-as-you-type (prohibited by the public Nominatim usage policy); a
click-on-map pin picker; manual raw lat/lng entry; changing the existing browser-geolocation paths
(they remain the default).

## Decisions

- **Interaction = type & submit** (not autocomplete). The project uses the **public** Nominatim
  instance (free, no key), whose usage policy forbids autocomplete-style request volume. Type &
  submit respects the policy, needs no debounce/cancellation machinery, and is good UX for "find my
  area". (Autocomplete becomes viable only on a self-hosted/paid geocoder — out of scope.)
- **Scope = both** Sell and home feed, via one shared `<LocationSearch>` component.
- **Testing = typecheck + manual e2e, no Vitest.** Vitest pulls in Vite→postcss and breaks the Next
  16 Turbopack build (see the prior Phase 2 fix). Pure helpers could get `node:test`+`tsx` coverage
  later; not in this change.

## Architecture & components

### 1. `searchPlaces` — forward geocoding helper (`client/lib/geo.ts`)

Mirror of the existing `reverseGeocode`, forward direction.

- Signature: `searchPlaces(query: string): Promise<PlaceResult[]>`
- `interface PlaceResult { label: string; coords: [number, number] }` — `coords` are `[lng, lat]`
  (GeoJSON order). `label` is built by reusing the existing `formatPlace(...)` so typed-search
  labels read identically to reverse-geocoded ones already shown in the app.
- Endpoint: `https://nominatim.openstreetmap.org/search?format=jsonv2&q=<encoded>&addressdetails=1&limit=5`,
  with `headers: { Accept: 'application/json' }` (same as `reverseGeocode`).
- Returns `[]` for a blank query (no request) and for zero matches; **throws** on a non-OK response
  / network error so the caller can show a message.
- Each Nominatim result row carries `lon`/`lat` (strings) → `coords: [Number(lon), Number(lat)]`.

### 2. `<LocationSearch>` — shared presentational component (`client/components/LocationSearch.tsx`)

One job: turn a typed query into a single picked place. Owns only its own input/results/status
state; the chosen location lives in the parent via a callback.

- Props: `{ onSelect: (place: PlaceResult) => void; placeholder?: string }`.
- UI: a text input + a "Search" button; submitting the form (button click or Enter) runs the
  search. Results render as a list of up to 5 buttons; clicking one calls `onSelect(place)` and
  collapses the list.
- Status states: `idle`, `searching` ("Searching…"), `results`, `empty` ("No places found"),
  `error` ("Couldn't search, try again").
- `'use client'`. Reuses existing Tailwind component classes (`field`, `btn-ghost`/`btn-primary`,
  `rounded-tag`, `border-line`, `text-muted`, `text-pine`).

### 3. Sell page integration (`client/app/sell/page.tsx`)

Add `<LocationSearch onSelect={...} />` beside the existing "Use my current location" button, under
the Location label. Selecting a place sets the same `coords` and `address` state the form already
submits (`onSelect` → `setCoords(place.coords)`, `setAddress(place.label)`). Either path satisfies
the existing `if (!coords)` guard, so listing no longer hard-requires browser geolocation.

### 4. Home feed integration (`client/lib/useNearbyItems.ts` + `client/app/page.tsx`)

Add an optional **manual override** of the feed center:

- `useNearbyItems` gains an `override: [number, number] | null` input. Effective center =
  `override ?? browserCoords`. The fetch effect, distance labels, and `showRadius` all key off the
  effective center; deps include `override`.
- `app/page.tsx` owns `const [override, setOverride] = useState<[number,number] | null>(null)` plus
  the chosen label. It renders `<LocationSearch onSelect={p => { setOverride(p.coords); setLabel(p.label) }} />`
  near the FilterBar.
- When an override is active, show a small affordance: "📍 Showing near *{label}* · Clear", where
  Clear calls `setOverride(null)` and returns to browser location.
- Browser geolocation remains the on-load default (override starts `null`).

## Data flow

```
LocationSearch (query) ──submit──► searchPlaces(query) ──► Nominatim /search
        ▲                                                        │
        │                                             PlaceResult[] (label + [lng,lat])
   user picks one                                                │
        │                                                        ▼
   onSelect(place) ──► parent state:  Sell → coords + address (form submit)
                                       Feed → override center (fetch + distances + radius)
```

Coordinates are `[longitude, latitude]` at every boundary (per CLAUDE.md). The Leaflet `[lat, lng]`
swap stays only inside `NearbyMap`. The map's "you are here" marker reflects the effective center.

## Error handling & edge cases

- **Blank/whitespace query:** no request; button is a no-op (or disabled).
- **Network/HTTP error:** `searchPlaces` throws → component shows "Couldn't search, try again"; page
  never crashes.
- **Zero matches:** component shows "No places found".
- **Sell:** a searched place behaves exactly like a geolocated one for the existing submit path.
- **Feed:** picking a place sets the override and refetches; Clear reverts to browser location (or
  to non-geo if the browser never provided one).

## Testing strategy

- **No Vitest** (breaks the Turbopack build). Verification: `npm run typecheck` (client) passing and
  manual end-to-end per CLAUDE.md's definition of done.
- **Manual e2e:** on Sell, deny geolocation, search a place, confirm the item pins there and lists.
  On the feed, search a place, confirm the feed/map/distances recenter and the radius filter
  applies, then Clear and confirm it returns to browser location.
- `searchPlaces`/`formatPlace` are pure and unit-testable with a Vite-free runner
  (`node:test` + `tsx`) if tests are revisited later; not included here.

## Conventions to honor (from CLAUDE.md)

- Coordinates `[lng, lat]` at the boundary; `::geography`/Leaflet swaps unchanged.
- Reuse `lib/api.ts` patterns; keep `lib/geo.ts` the single home for geocoding helpers.
- Tailwind v4 CSS-first: reuse existing `@theme` tokens / component classes; no JS Tailwind config.
- Shared API types via `@neighborly/shared` with `import type` (no new shared types needed here —
  `PlaceResult` is a client-only view type).
