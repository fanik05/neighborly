import type { ListingType } from '@neighborly/shared';

const LISTING_TYPES: ListingType[] = ['sale', 'loan', 'free'];
const DEFAULT_RADIUS_METERS = 5000;

export interface ItemFilters {
  hasGeo: boolean;
  lng?: number;
  lat?: number;
  radius: number;
  category?: string;
  type?: ListingType;
  q?: string;
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/** Parse raw request query into a normalized, validated ItemFilters. Pure — no DB. */
export function parseItemFilters(query: Record<string, unknown>): ItemFilters {
  const lng = num(query.lng);
  const lat = num(query.lat);
  const hasGeo = lng !== undefined && lat !== undefined;

  const radiusRaw = num(query.radius);
  const radius = radiusRaw !== undefined && radiusRaw > 0 ? radiusRaw : DEFAULT_RADIUS_METERS;

  const typeRaw = str(query.type);
  const type =
    typeRaw && LISTING_TYPES.includes(typeRaw as ListingType) ? (typeRaw as ListingType) : undefined;

  const filters: ItemFilters = { hasGeo, radius };
  if (hasGeo) {
    filters.lng = lng;
    filters.lat = lat;
  }
  const category = str(query.category);
  if (category) filters.category = category;
  if (type) filters.type = type;
  const q = str(query.q);
  if (q) filters.q = q;
  return filters;
}
