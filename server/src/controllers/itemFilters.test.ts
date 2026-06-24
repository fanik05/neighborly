import { describe, test, expect } from 'vitest';
import { parseItemFilters } from './itemFilters.js';

describe('parseItemFilters', () => {
  test('no params → non-geo, default radius, no filters', () => {
    expect(parseItemFilters({})).toEqual({ hasGeo: false, radius: 5000 });
  });

  test('valid lng/lat → geo with parsed coords', () => {
    const f = parseItemFilters({ lng: '-74.006', lat: '40.7128' });
    expect(f.hasGeo).toBe(true);
    expect(f.lng).toBeCloseTo(-74.006, 5);
    expect(f.lat).toBeCloseTo(40.7128, 5);
  });

  test('only one of lng/lat → non-geo', () => {
    expect(parseItemFilters({ lng: '-74.006' }).hasGeo).toBe(false);
  });

  test('custom radius is honored', () => {
    expect(parseItemFilters({ radius: '16093' }).radius).toBe(16093);
  });

  test('invalid radius falls back to default', () => {
    expect(parseItemFilters({ radius: 'abc' }).radius).toBe(5000);
    expect(parseItemFilters({ radius: '0' }).radius).toBe(5000);
    expect(parseItemFilters({ radius: '-5' }).radius).toBe(5000);
  });

  test('valid type kept, invalid type dropped', () => {
    expect(parseItemFilters({ type: 'loan' }).type).toBe('loan');
    expect(parseItemFilters({ type: 'banana' }).type).toBeUndefined();
  });

  test('empty category/q dropped, real values kept', () => {
    expect(parseItemFilters({ category: '  ', q: '' })).toEqual({ hasGeo: false, radius: 5000 });
    const f = parseItemFilters({ category: 'tools', q: 'drill' });
    expect(f.category).toBe('tools');
    expect(f.q).toBe('drill');
  });
});
