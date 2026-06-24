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
