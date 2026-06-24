import { describe, test, expect } from 'vitest';
import { distanceMiles, formatDistance, formatPlace } from './geo';

describe('distanceMiles', () => {
  test('same point is zero', () => {
    expect(distanceMiles([-74.006, 40.7128], [-74.006, 40.7128])).toBeCloseTo(0, 5);
  });

  test('NYC → LA is about 2445 miles', () => {
    const d = distanceMiles([-74.006, 40.7128], [-118.2437, 34.0522]);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });
});

describe('formatDistance', () => {
  test('very close reads "right here"', () => {
    expect(formatDistance(0.05)).toBe('right here');
  });
  test('under 10 miles keeps one decimal', () => {
    expect(formatDistance(5.234)).toBe('5.2 mi');
  });
  test('10+ miles rounds to whole', () => {
    expect(formatDistance(42.6)).toBe('43 mi');
  });
});

describe('formatPlace', () => {
  test('builds "Area, City" from neighbourhood + city', () => {
    expect(formatPlace({ address: { neighbourhood: 'Williamsburg', city: 'New York' } })).toBe(
      'Williamsburg, New York'
    );
  });
  test('skips junk administrative areas', () => {
    expect(formatPlace({ address: { suburb: 'Community Board 1', city: 'New York' } })).toBe(
      'New York'
    );
  });
  test('falls back to display_name when no structured address', () => {
    expect(formatPlace({ display_name: 'Main St, Springfield, USA' })).toBe('Main St, Springfield');
  });
});
