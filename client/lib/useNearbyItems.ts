'use client';

import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { getBrowserLocation } from '@/lib/geo';
import type { Item, ListingType } from '@/lib/types';

interface NearbyOpts {
  type: ListingType | 'all';
  radius: number;
  /** Manual center override (e.g. a searched place); falls back to browser location when null. */
  override: [number, number] | null;
}

/**
 * Owns geolocation capture + the /items fetch for the home feed.
 * Effective center = override ?? browser location; falls back to a non-geo
 * (newest-first) request when neither is available.
 */
export function useNearbyItems({ type, radius, override }: NearbyOpts) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserCoords, setBrowserCoords] = useState<[number, number] | null>(null);

  // Capture the visitor's location once.
  useEffect(() => {
    getBrowserLocation()
      .then(setBrowserCoords)
      .catch(() => setBrowserCoords(null));
  }, []);

  const coords = override ?? browserCoords;

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
