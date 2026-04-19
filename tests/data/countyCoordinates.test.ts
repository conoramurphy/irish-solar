import { describe, it, expect } from 'vitest';
import { COUNTY_COORDINATES, findNearestCounty } from '../../src/data/countyCoordinates';

describe('COUNTY_COORDINATES', () => {
  it('contains all 32 Irish counties', () => {
    expect(COUNTY_COORDINATES).toHaveLength(32);
  });

  it('has unique slugs', () => {
    const slugs = COUNTY_COORDINATES.map(c => c.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('has unique names', () => {
    const names = COUNTY_COORDINATES.map(c => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('all coordinates are within Ireland bounding box', () => {
    for (const c of COUNTY_COORDINATES) {
      // Ireland: ~51.4° to 55.4°N, -10.5° to -5.4°W
      expect(c.lat).toBeGreaterThanOrEqual(51.0);
      expect(c.lat).toBeLessThanOrEqual(55.5);
      expect(c.lon).toBeGreaterThanOrEqual(-10.5);
      expect(c.lon).toBeLessThanOrEqual(-5.0);
    }
  });

  it('all slugs are lowercase with no spaces', () => {
    for (const c of COUNTY_COORDINATES) {
      expect(c.slug).toMatch(/^[a-z][a-z-]*$/);
    }
  });
});

describe('findNearestCounty', () => {
  it('returns Dublin for Dublin centroid', () => {
    const result = findNearestCounty(53.35, -6.26);
    expect(result.slug).toBe('dublin');
  });

  it('returns Cork for Cork centroid', () => {
    const result = findNearestCounty(51.90, -8.49);
    expect(result.slug).toBe('cork');
  });

  it('returns nearest county for arbitrary coordinates', () => {
    // Phoenix Park, Dublin
    const result = findNearestCounty(53.355, -6.327);
    expect(result.slug).toBe('dublin');
  });

  it('returns Donegal for far north-west point', () => {
    const result = findNearestCounty(55.0, -8.0);
    expect(result.slug).toBe('donegal');
  });

  it('returns Kerry for south-west tip', () => {
    const result = findNearestCounty(52.0, -10.0);
    expect(result.slug).toBe('kerry');
  });

  it('handles coordinates outside Ireland by returning nearest', () => {
    // Mid-Atlantic — should still return a valid county
    const result = findNearestCounty(53.0, -15.0);
    expect(COUNTY_COORDINATES).toContainEqual(result);
  });

  it('returns a CountyCoordinate object with all required fields', () => {
    const result = findNearestCounty(53.35, -6.26);
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('slug');
    expect(result).toHaveProperty('lat');
    expect(result).toHaveProperty('lon');
  });
});
