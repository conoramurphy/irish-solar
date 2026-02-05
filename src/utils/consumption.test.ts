import { describe, expect, test } from 'vitest';
import { generateSeasonalMonthlyKwh, getTariffBucketKeys, makeDefaultBucketShares, normalizeBucketKey, normalizeSharesToOne } from './consumption';

describe('consumption utils', () => {
  test('normalizeBucketKey normalizes strings', () => {
    expect(normalizeBucketKey(' Night ')).toBe('night');
    expect(normalizeBucketKey('Day Rate')).toBe('day-rate');
    expect(normalizeBucketKey('Peak(€)')).toBe('peak');
  });

  test('getTariffBucketKeys returns unique normalized keys', () => {
    const keys = getTariffBucketKeys({
      id: 't',
      supplier: 's',
      product: 'p',
      type: 'time-of-use',
      standingCharge: 0,
      exportRate: 0,
      rates: [
        { period: 'Night', rate: 0.1 },
        { period: 'Day', rate: 0.2 },
        { period: 'Night', rate: 0.1 }
      ]
    });

    expect(keys).toEqual(['night', 'day']);
  });

  test('generateSeasonalMonthlyKwh uses winter as Jan max and summer as Jul min', () => {
    const m = generateSeasonalMonthlyKwh(1000, 500);
    expect(m).toHaveLength(12);
    expect(m[0]).toBeCloseTo(1000, 3);
    expect(m[6]).toBeCloseTo(500, 3);
  });

  test('makeDefaultBucketShares prefers day/night/peak and normalizes to 1', () => {
    const shares = makeDefaultBucketShares(['night', 'day', 'peak']);
    const sum = Object.values(shares).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(shares.night).toBeGreaterThan(0);
    expect(shares.day).toBeGreaterThan(0);
    expect(shares.peak).toBeGreaterThan(0);
  });

  test('normalizeSharesToOne falls back to equal split', () => {
    const s = normalizeSharesToOne({}, ['a', 'b']);
    expect(s.a).toBeCloseTo(0.5, 6);
    expect(s.b).toBeCloseTo(0.5, 6);
  });
});
