/** Ask the browser for the user's current position as [lng, lat]. */
export function getBrowserLocation(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return reject(new Error('Geolocation is not available in this browser'));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      (err) => reject(new Error(err.message || 'Could not get your location')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/** Haversine distance in miles between two [lng, lat] points. */
export function distanceMiles(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 3958.8; // earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Friendly distance label for the feed. */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'right here';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  road?: string;
}

/** Administrative labels that read as bureaucratic, not as a place name. */
const isJunkArea = (s?: string): boolean =>
  !s || /community board|electoral|census|district \d|ward \d/i.test(s);

/** Build a concise "Area, City" label from a Nominatim address object. */
export function formatPlace(data: { address?: NominatimAddress; display_name?: string }): string {
  const a = data.address ?? {};
  const area = [a.neighbourhood, a.suburb, a.quarter, a.city_district, a.road].find(
    (v) => !isJunkArea(v)
  );
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const parts = [area, city].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i
  );
  if (parts.length) return parts.join(', ');
  return data.display_name?.split(',').slice(0, 2).map((s) => s.trim()).join(', ') ?? '';
}

/**
 * Reverse-geocode [lng, lat] to a human-readable place name via OpenStreetMap
 * Nominatim (free, no key). Returns '' if it can't resolve a name.
 */
export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not look up place name');
  return formatPlace(await res.json());
}
