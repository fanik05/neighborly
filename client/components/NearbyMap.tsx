'use client';

import Link from 'next/link';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { Item } from '@/lib/types';

// Fallback map center (New York City) in Leaflet's [lat, lng] format.
const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];

export default function NearbyMap({
  items,
  coords,
}: {
  items: Item[];
  coords: [number, number] | null;
}) {
  // Leaflet uses [lat, lng], while our API and DB use GeoJSON [lng, lat].
  const center = coords ? ([coords[1], coords[0]] as [number, number]) : DEFAULT_CENTER;

  return (
    <div tabIndex={0} aria-label="Nearby listings map">
      <MapContainer center={center} zoom={coords ? 12 : 10} scrollWheelZoom className="h-80 w-full rounded-tag">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {coords && (
          <CircleMarker center={[coords[1], coords[0]]} radius={8} pathOptions={{ color: '#1f4d3b', weight: 3 }}>
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
                  View {item.title}
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
