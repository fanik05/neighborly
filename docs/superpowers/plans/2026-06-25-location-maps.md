# Location Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive pin-picker map to the Sell page (drop/drag a pin, recentered by use-my-location and address search, reverse-geocoded) and a read-only map preview (with a larger modal) to the item detail page.

**Architecture:** Two focused client-only Leaflet components — `LocationPicker` (interactive, draggable `divIcon` pin + click-to-move + recenter) and `LocationMap` (read-only single marker) — both dynamic-imported `ssr:false` like the existing `NearbyMap`. The Sell page funnels use-my-location, address search, and pin moves through one `setLocation()` helper. The detail page shows a `LocationMap` preview that opens a larger map in a modal.

**Tech Stack:** Next.js 16 + React 19, `leaflet` ^1.9.4 + `react-leaflet` ^5, TypeScript. No server/API change. No test framework (Vitest breaks the Turbopack build).

## Global Constraints

- Coordinates are ALWAYS `[longitude, latitude]` (GeoJSON) at component boundaries; the Leaflet `[lat, lng]` swap stays INSIDE each map component.
- Map components are dynamic-imported with `{ ssr: false }` by their pages (Leaflet needs `window`), matching `NearbyMap`.
- The `LocationPicker` pin is an `L.divIcon` (an HTML 📍), NOT Leaflet's default PNG marker — the default marker's image assets break under Turbopack. `divIcon` markers are draggable and need no asset.
- Reverse-geocoding uses the existing `reverseGeocode(lng, lat)` from `@/lib/geo`. No new geocoding paths.
- Tailwind v4 Lending Desk classes; never `bg-white` (use `bg-card`); the detail modal overlay uses an ink scrim (`bg-ink/60`).
- Default map center when no location: NYC `[40.7128, -74.006]` in Leaflet `[lat, lng]` order (matches `NearbyMap`).
- Each commit must leave `npm run typecheck -w client` clean; UI tasks also build.

---

### Task 1: `LocationMap` — read-only preview

**Files:**
- Create: `client/components/LocationMap.tsx`

**Interfaces:**
- Consumes: nothing (react-leaflet only).
- Produces: default export `LocationMap` with props `{ coords: [number, number]; className?: string; zoom?: number }`.

- [ ] **Step 1: Create `client/components/LocationMap.tsx`**

```tsx
'use client';

import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';

/** Read-only single-point map. coords are [lng, lat]; Leaflet wants [lat, lng]. */
export default function LocationMap({
  coords,
  className = 'h-48 w-full rounded-tag',
  zoom = 14,
}: {
  coords: [number, number];
  className?: string;
  zoom?: number;
}) {
  const center: [number, number] = [coords[1], coords[0]];
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker center={center} radius={8} pathOptions={{ color: '#b23a2e', weight: 3 }} />
    </MapContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/components/LocationMap.tsx
git commit -m "feat(client): LocationMap read-only preview component"
```

---

### Task 2: `LocationPicker` — interactive draggable pin

**Files:**
- Create: `client/components/LocationPicker.tsx`
- Modify: `client/app/globals.css` (one rule to un-box the divIcon pin)

**Interfaces:**
- Consumes: `leaflet` (`L.divIcon`, `L.LatLng`), react-leaflet (`MapContainer`, `Marker`, `TileLayer`, `useMap`, `useMapEvents`).
- Produces: default export `LocationPicker` with props `{ value: [number, number] | null; onChange: (coords: [number, number]) => void }` (coords `[lng, lat]`).

- [ ] **Step 1: Create `client/components/LocationPicker.tsx`**

```tsx
'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]; // NYC, Leaflet [lat, lng]

/** On-brand pin as an HTML divIcon — no image asset, so no Turbopack broken-marker issue. */
function pinIcon() {
  return L.divIcon({
    className: 'location-pin',
    html: '<span style="font-size:28px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">📍</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 26], // bottom-center: the tip of the pin
  });
}

/** Recenter the map when the selected coordinates change (search / use-my-location). */
function Recenter({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

/** Report the point the user clicks on the map. */
function ClickCapture({ onPick }: { onPick: (latlng: L.LatLng) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

export default function LocationPicker({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (coords: [number, number]) => void;
}) {
  const icon = useMemo(() => pinIcon(), []);
  const center: [number, number] = value ? [value[1], value[0]] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={value ? 14 : 11} scrollWheelZoom className="h-64 w-full rounded-tag">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={value?.[1]} lng={value?.[0]} />
      <ClickCapture onPick={(ll) => onChange([ll.lng, ll.lat])} />
      {value && (
        <Marker
          position={[value[1], value[0]]}
          icon={icon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange([ll.lng, ll.lat]);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
```

- [ ] **Step 2: Un-box the pin in `client/app/globals.css`**

Append (Leaflet gives every `divIcon` a white box + border via `.leaflet-div-icon`; this strips it for our pin):
```css
/* Location picker pin: show only the emoji, not Leaflet's default white box. */
.leaflet-div-icon.location-pin {
  background: transparent;
  border: none;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS; compiles. (If a stale `.next` cache error about a missing module/CSS appears, run `rm -rf client/.next` and rebuild.)

- [ ] **Step 4: Commit**

```bash
git add client/components/LocationPicker.tsx client/app/globals.css
git commit -m "feat(client): LocationPicker — draggable divIcon pin + click-to-set + recenter"
```

---

### Task 3: Sell page — unified map (setLocation funnel)

**Files:**
- Modify: `client/app/sell/page.tsx`

**Interfaces:**
- Consumes: `LocationPicker` (Task 2), existing `getBrowserLocation`/`reverseGeocode`, `LocationSearch`.
- Produces: the Sell page where all three inputs set the location through one helper, with a live map.

- [ ] **Step 1: Add the dynamic import + `next/dynamic`**

In `client/app/sell/page.tsx`, change the React import line and add `dynamic`, plus the LocationPicker dynamic import. Replace:
```ts
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
```
with:
```ts
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
```
And after the existing `import LocationSearch from '@/components/LocationSearch';` line, add:
```ts
const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false });
```

- [ ] **Step 2: Replace `useMyLocation` with a shared `setLocation` helper**

Replace the existing `useMyLocation` function (the `async function useMyLocation() { … }` block) with:
```ts
  // Single funnel for every way to set the listing's location.
  async function setLocation(c: [number, number], label?: string) {
    setCoords(c);
    if (label !== undefined) {
      setAddress(label);
      return;
    }
    try {
      setAddress(await reverseGeocode(c[0], c[1]));
    } catch {
      setAddress('');
    }
  }

  async function useMyLocation() {
    setError('');
    setLocating(true);
    try {
      await setLocation(await getBrowserLocation());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location unavailable');
    } finally {
      setLocating(false);
    }
  }
```

- [ ] **Step 3: Wire the address search through `setLocation` and add the map**

In the Location section, change the `LocationSearch` `onSelect` and add the `<LocationPicker>` below the search. Replace this block:
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
with:
```tsx
          <div className="mt-2">
            <p className="mb-1 text-xs text-muted">or search an address or place</p>
            <LocationSearch
              onSelect={(p) => setLocation(p.coords, p.label)}
              placeholder="e.g. Williamsburg, Brooklyn"
            />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs text-muted">Drop or drag the pin to set the exact spot</p>
            <LocationPicker value={coords} onChange={(c) => setLocation(c)} />
          </div>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS; compiles.

- [ ] **Step 5: Commit**

```bash
git add client/app/sell/page.tsx
git commit -m "feat(client): Sell page unified location map (pin + search + use-my-location)"
```

---

### Task 4: Item detail page — preview + modal

**Files:**
- Modify: `client/app/items/[id]/page.tsx`

**Interfaces:**
- Consumes: `LocationMap` (Task 1).
- Produces: a map preview in the location card that opens a larger modal.

- [ ] **Step 1: Add the dynamic import + modal state**

In `client/app/items/[id]/page.tsx`, after the existing `import LoanStatusPanel from '@/components/LoanStatusPanel';` line add:
```ts
import dynamic from 'next/dynamic';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });
```
Inside the component, alongside the other `useState` calls, add:
```ts
  const [mapOpen, setMapOpen] = useState(false);
```
Add an Esc-to-close effect near the other effects:
```ts
  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMapOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapOpen]);
```

- [ ] **Step 2: Replace the location card with preview + modal**

Replace the existing location card block:
```tsx
        {item.location?.coordinates && (
          <div className="mt-4 rounded-tag border border-line bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">📍 Location</p>
            <p className="mt-0.5 font-semibold">
              {item.address || placeName || 'Looking up area…'}
            </p>
            <a
              href={`https://www.openstreetmap.org/?mlat=${item.location.coordinates[1]}&mlon=${item.location.coordinates[0]}#map=16/${item.location.coordinates[1]}/${item.location.coordinates[0]}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm font-semibold text-pine hover:text-pine-dark"
            >
              View on map ↗
            </a>
          </div>
        )}
```
with:
```tsx
        {item.location?.coordinates && (
          <div className="mt-4 rounded-tag border border-line bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">📍 Location</p>
            <p className="mt-0.5 font-semibold">{item.address || placeName || 'Looking up area…'}</p>
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="mt-2 block w-full overflow-hidden rounded-tag border border-line"
              aria-label="Open larger map"
            >
              <LocationMap coords={item.location.coordinates} className="h-40 w-full" />
            </button>
          </div>
        )}

        {mapOpen && item.location?.coordinates && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
            onClick={() => setMapOpen(false)}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-tag border border-line bg-card shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <p className="font-semibold">{item.address || placeName || 'Location'}</p>
                <button type="button" onClick={() => setMapOpen(false)} aria-label="Close" className="text-muted hover:text-ink">
                  ✕
                </button>
              </div>
              <LocationMap coords={item.location.coordinates} className="h-[60vh] w-full" zoom={15} />
              <div className="border-t border-line px-4 py-2 text-right">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${item.location.coordinates[1]}&mlon=${item.location.coordinates[0]}#map=16/${item.location.coordinates[1]}/${item.location.coordinates[0]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-pine hover:text-pine-dark"
                >
                  View on OpenStreetMap ↗
                </a>
              </div>
            </div>
          </div>
        )}
```

Note on the modal map: it mounts fresh when opened (`mapOpen`), so Leaflet sizes correctly to the modal; a `LocationMap` is read-only so no extra wiring is needed.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS; compiles.

- [ ] **Step 4: Commit**

```bash
git add "client/app/items/[id]/page.tsx"
git commit -m "feat(client): item detail map preview + larger map modal"
```

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Typecheck + build**

Run: `npm run typecheck -w client && npm run build -w client`
Expected: PASS; "✓ Compiled successfully".

- [ ] **Step 2: Start the app**

```bash
docker start neighborly-pg 2>/dev/null || true
PORT=5001 npm run dev:server
npm run dev:client
```
(Match `client/.env.local` `NEXT_PUBLIC_API_URL` to the port.)

- [ ] **Step 3: Manual checks**

  - **Sell page** (`/sell`, logged in):
    - The "Search" button runs the place search (does NOT submit/reload the form — the prior fix).
    - A map shows; clicking it drops the pin and the "Pinned in …" label updates to the reverse-geocoded place; dragging the pin updates it again.
    - "Use my current location" and picking a search result both recenter the map and move the pin.
    - Submitting the form still posts the chosen coordinates (item lands at the pinned spot).
    - With geolocation denied, you can still set a location by clicking the map.
  - **Item detail page** (a listing with a location): a map preview is centered on the item with a red marker; clicking it opens a larger modal map; close via ✕, backdrop click, and Esc; the OpenStreetMap link works.

- [ ] **Step 4: Final commit (only if fixups were needed)**

```bash
git add -A
git commit -m "chore: verify location maps end-to-end"
```

---

## Self-Review notes

- **Spec coverage:** `LocationPicker` interactive draggable `divIcon` pin + click + recenter (Task 2); `LocationMap` read-only preview (Task 1); Sell-page `setLocation` funnel for use-my-location/search/pin with reverse-geocode (Task 3); detail-page preview + modal with the OSM link moved inside (Task 4); `ssr:false` dynamic imports throughout; verification incl. the already-fixed search regression (Task 5). The nested-`<form>` search fix already shipped on this branch (prior commit).
- **Type consistency:** both components take/emit `[lng, lat]`; `LocationPicker`'s `onChange: (coords:[number,number])=>void` matches the Sell page's `setLocation(c)`; `LocationMap`'s `{coords, className?, zoom?}` matches both detail-page usages.
- **Coordinate order:** `[lng, lat]` at every prop boundary; the `[lat, lng]` swap is contained inside each map component (verified in both).
- **Placeholder scan:** none — every code step is complete.
```
