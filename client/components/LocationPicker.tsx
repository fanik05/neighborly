'use client';

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]; // NYC, Leaflet [lat, lng]

/** On-brand pin as an HTML divIcon — no image asset, so no Turbopack broken-marker issue. */
const pinIcon = L.divIcon({
  className: 'location-pin',
  html: '<span style="font-size:28px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">📍</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 26], // bottom-center: the tip of the pin
});

/**
 * Recenter the map when the selection changes EXTERNALLY (search / use-my-location).
 * Skips changes the picker itself emitted (pin drag/click), so the pin stays put.
 */
function Recenter({
  lat,
  lng,
  selfKey,
  emittedKey,
}: {
  lat?: number;
  lng?: number;
  selfKey: string;
  emittedKey: React.RefObject<string>;
}) {
  const map = useMap();
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    if (selfKey && selfKey === emittedKey.current) return; // our own move — leave the view
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, selfKey, emittedKey, map]);
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
  const center: [number, number] = value ? [value[1], value[0]] : DEFAULT_CENTER;
  // Remember the last coords WE emitted, so Recenter can skip pin-originated changes.
  const emittedKey = useRef('');

  function emit(coords: [number, number]) {
    emittedKey.current = `${coords[0]},${coords[1]}`;
    onChange(coords);
  }

  const selfKey = value ? `${value[0]},${value[1]}` : '';

  return (
    <MapContainer center={center} zoom={value ? 14 : 11} scrollWheelZoom className="h-64 w-full rounded-tag">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={value?.[1]} lng={value?.[0]} selfKey={selfKey} emittedKey={emittedKey} />
      <ClickCapture onPick={(ll) => emit([ll.lng, ll.lat])} />
      {value && (
        <Marker
          position={[value[1], value[0]]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              emit([ll.lng, ll.lat]);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
