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
