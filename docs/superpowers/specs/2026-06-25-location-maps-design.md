# Location Maps — pin picker + detail preview (and the search-form fix)

**Date:** 2026-06-25
**Status:** Approved design, ready for implementation plan
**Branch:** `location-ux-fixes` (off `main`). The nested-form search bug is already fixed on this
branch (commit: LocationSearch drops its inner `<form>`); this spec covers the two map features that
ship in the same PR.

## Context

The app already has a Leaflet setup: `client/components/NearbyMap.tsx` (feed map — multiple item
markers + a "you are here" `CircleMarker`, dynamic-imported `ssr:false`), the `lib/geo.ts` helpers
(`getBrowserLocation`, `reverseGeocode`, `searchPlaces`), and the `LocationSearch` component. The
Sell page sets location via "Use my current location" + the address search but has **no map**, so a
seller can't see or fine-tune where the pin lands. The item detail page shows a text location card
with an external "View on map ↗" link but **no embedded map**.

## Goals

- **Sell page:** a single interactive map is the location control — drop/drag a pin, with
  "use my location" and address search re-centering it; the picked point is reverse-geocoded for the
  address label.
- **Item detail page:** an embedded read-only map preview centered on the item, which opens a larger
  map in a modal on click.

Non-goals: routing/directions, address autocomplete (Nominatim policy), drawing radius circles on
these maps, any server/API change, changing how coordinates are stored.

## Components (client-only)

Both reuse the existing pattern: components live under `client/components/`, are dynamic-imported
with `{ ssr: false }` by their pages (Leaflet needs `window`), use OSM tiles, and keep the GeoJSON
`[lng, lat]` ↔ Leaflet `[lat, lng]` swap **inside** the component.

- **`LocationPicker`** (interactive) — props `{ value: [number, number] | null; onChange: (coords: [number, number]) => void }`.
  - Renders a `MapContainer` centered on `value` (or a default center when null).
  - A **draggable pin** at `value`; dragging fires `onChange` with the new `[lng, lat]`.
  - Clicking anywhere on the map moves the pin there and fires `onChange` (via a small child
    component using react-leaflet's `useMapEvents({ click })`).
  - The pin is an **`L.divIcon`** (a styled 📍/stamp marker, on brand) — NOT Leaflet's default PNG
    marker, which has known broken-image issues under bundlers/Turbopack. `divIcon` markers are
    fully draggable and need no image asset.
  - When `value` changes from the parent (e.g. via search / use-my-location), the map recenters to
    it (a child component calling `useMap().setView`).
- **`LocationMap`** (read-only preview) — props `{ coords: [number, number] }`.
  - A small `MapContainer` with a single `CircleMarker` (or the same `divIcon`) at `coords`,
    pan/zoom only, no callbacks.

## Sell page — unified map (`client/app/sell/page.tsx`)

The map becomes the primary location control. Introduce one helper that all three inputs call:

```ts
async function setLocation(c: [number, number]) {
  setCoords(c);
  try {
    setAddress(await reverseGeocode(c[0], c[1]));
  } catch {
    setAddress('');
  }
}
```

- **"Use my current location"** → `getBrowserLocation()` → `setLocation(c)` (replaces the inline
  reverse-geocode in `useMyLocation`).
- **Address search** `<LocationSearch onSelect={(p) => setLocation(p.coords)} />`.
- **`<LocationPicker value={coords} onChange={setLocation} />`** rendered (dynamic `ssr:false`) in
  the Location section, below the button + search; dragging/clicking the pin calls `setLocation`.

`coords`/`address`/the existing submit logic and the "Pinned in …" confirmation are unchanged — all
three paths funnel through `setLocation`. If geolocation is denied, the map is a manual fallback
(pin still settable), so listing creation no longer hard-depends on the browser granting location.

## Item detail page — preview + modal (`client/app/items/[id]/page.tsx`)

In the existing location card (only when `item.location?.coordinates` exists):

- Render `<LocationMap coords={item.location.coordinates} />` (dynamic `ssr:false`) as a preview.
- Clicking the preview opens a **modal** (a simple fixed overlay, closed on backdrop/Esc/✕) holding
  a larger `LocationMap`. The existing "View on map ↗" external OSM link moves into the modal.
- The text address line ("📍 {address}") stays.

The modal is a small local piece of the page (open/close `useState`); no new global component needed
beyond the maps.

## Data flow

```
Sell:   [use-my-location | address search | pin drag/click] → setLocation([lng,lat])
                                                                 ├─ setCoords
                                                                 └─ reverseGeocode → setAddress
        LocationPicker is driven by `coords` (recenters) and emits via onChange.

Detail: item.location.coordinates → LocationMap (preview) ──click──▶ modal(LocationMap larger + OSM link)
```

Coordinates are `[longitude, latitude]` at every boundary; the Leaflet `[lat, lng]` swap stays inside
each map component. No server/API/contract change.

## Error handling & edge cases

- **Geolocation denied/unavailable:** the picker stays at a default center (NYC, matching
  `NearbyMap`); the user pins manually. (This also fixes the prior hard dependency on geolocation for
  listing.)
- **Reverse-geocode failure:** keep `coords`; address falls back to the `lat, lng` readout (existing
  Sell-page behavior).
- **No coordinates on an item:** the detail page shows no map (guarded on
  `item.location?.coordinates`), same as today.
- **SSR:** all map components are dynamic-imported `ssr:false`; nothing Leaflet runs on the server.

## Testing strategy

- **No Vitest** (breaks the Turbopack build). Gate on `npm run typecheck` + `npm run build -w client`
  and manual verification:
  - Sell: pin drag/click updates the "Pinned in …" label; "use my location" and a search recenter
    the map + move the pin; submit still posts the chosen coords.
  - Detail: preview centers on the item with a marker; clicking opens the larger modal; close works.
- The search-form regression is covered by the existing fix on this branch (Search no longer
  submits the listing form).

## Conventions honored (CLAUDE.md)

- Coordinates `[lng, lat]` at the boundary; Leaflet swap only inside map components.
- Reuse `lib/geo.ts` for reverse-geocoding; no new geocoding paths.
- Tailwind v4 Lending Desk tokens/classes; never `bg-white` (use `bg-card`); the modal overlay uses
  an ink scrim.
- Map components dynamic-imported `ssr:false`, matching `NearbyMap`.
