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
