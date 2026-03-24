import { describe, expect, it } from 'vitest';
import {
  normalizeBucketKey,
  getTariffBucketKeys,
  makeDefaultBucketShares,
  normalizeSharesToOne,
  generateSeasonalMonthlyKwh,
  buildConsumptionProfileFromSeasonalInputs
} from '../../src/utils/consumption';
import type { Tariff, TariffBucketKey } from '../../src/types';

// --- normalizeBucketKey ---
describe('normalizeBucketKey', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(normalizeBucketKey('Day Rate')).toBe('day-rate');
  });

  it('strips non-alphanumeric non-dash chars', () => {
    expect(normalizeBucketKey('Night (24h)')).toBe('night-24h');
  });

  it('trims whitespace', () => {
    expect(normalizeBucketKey('  peak  ')).toBe('peak');
  });
});

// --- getTariffBucketKeys ---
describe('getTariffBucketKeys', () => {
  it('returns unique bucket keys from tariff rates', () => {
    const tariff: Tariff = {
      name: 'Test',
      rates: [
        { period: 'Day', importRate: 0.2, exportRate: 0 },
        { period: 'Night', importRate: 0.1, exportRate: 0 },
        { period: 'Day', importRate: 0.2, exportRate: 0 }, // duplicate
      ]
    };
    const keys = getTariffBucketKeys(tariff);
    expect(keys).toEqual(['day', 'night']);
  });

  it('returns empty array for tariff with no rates', () => {
    const tariff: Tariff = { name: 'Empty', rates: [] };
    expect(getTariffBucketKeys(tariff)).toEqual([]);
  });

  it('returns empty array when rates is undefined', () => {
    const tariff = { name: 'No rates' } as Tariff;
    expect(getTariffBucketKeys(tariff)).toEqual([]);
  });
});

// --- makeDefaultBucketShares ---
describe('makeDefaultBucketShares', () => {
  it('returns empty object for empty keys', () => {
    expect(makeDefaultBucketShares([])).toEqual({});
  });

  it('uses preferred day/night/peak defaults', () => {
    const shares = makeDefaultBucketShares(['day', 'night', 'peak']);
    expect(shares.day).toBeCloseTo(0.55, 2);
    expect(shares.night).toBeCloseTo(0.35, 2);
    expect(shares.peak).toBeCloseTo(0.10, 2);
    // Sum should be 1
    const sum = Object.values(shares).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('distributes remainder to extra buckets when day/night/peak are present', () => {
    // Has 'day' + 'night' + 'boost' (non-standard)
    const shares = makeDefaultBucketShares(['day', 'night', 'boost']);
    expect(shares.day).toBeDefined();
    expect(shares.night).toBeDefined();
    expect(shares.boost).toBeDefined();
    // Sum should be 1
    const sum = Object.values(shares).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('uses equal split for buckets without day/night/peak', () => {
    const shares = makeDefaultBucketShares(['low', 'mid', 'high']);
    expect(shares.low).toBeCloseTo(1 / 3, 6);
    expect(shares.mid).toBeCloseTo(1 / 3, 6);
    expect(shares.high).toBeCloseTo(1 / 3, 6);
  });

  it('handles single day bucket', () => {
    const shares = makeDefaultBucketShares(['day']);
    expect(shares.day).toBeCloseTo(1.0, 6);
  });
});

// --- normalizeSharesToOne ---
describe('normalizeSharesToOne', () => {
  it('normalizes shares that sum to more than 1', () => {
    const shares = { a: 2, b: 3 } as Record<TariffBucketKey, number>;
    const result = normalizeSharesToOne(shares, ['a', 'b']);
    expect(result.a).toBeCloseTo(0.4, 6);
    expect(result.b).toBeCloseTo(0.6, 6);
  });

  it('falls back to equal split when all shares are 0', () => {
    const shares = { x: 0, y: 0 } as Record<TariffBucketKey, number>;
    const result = normalizeSharesToOne(shares, ['x', 'y']);
    expect(result.x).toBeCloseTo(0.5, 6);
    expect(result.y).toBeCloseTo(0.5, 6);
  });

  it('treats NaN and Infinity as 0', () => {
    const shares = { a: NaN, b: Infinity, c: 5 } as Record<TariffBucketKey, number>;
    const result = normalizeSharesToOne(shares, ['a', 'b', 'c']);
    expect(result.a).toBe(0);
    expect(result.b).toBe(0);
    expect(result.c).toBeCloseTo(1.0, 6);
  });

  it('clamps negative values to 0', () => {
    const shares = { a: -5, b: 10 } as Record<TariffBucketKey, number>;
    const result = normalizeSharesToOne(shares, ['a', 'b']);
    expect(result.a).toBe(0);
    expect(result.b).toBeCloseTo(1.0, 6);
  });

  it('handles missing keys in shares gracefully', () => {
    const shares = { a: 1 } as Record<TariffBucketKey, number>;
    const result = normalizeSharesToOne(shares, ['a', 'b']);
    // 'b' not in shares => treated as 0
    expect(result.a).toBeCloseTo(1.0, 6);
    expect(result.b).toBe(0);
  });

  it('returns 0 for equal when bucketKeys is empty (empty {} shares)', () => {
    // empty bucketKeys → equal = bucketKeys.length > 0 ? ... : 0
    const result = normalizeSharesToOne({} as Record<TariffBucketKey, number>, []);
    expect(result).toEqual({});
  });
});

// --- normalizeConsumptionProfile ---
import { normalizeConsumptionProfile } from '../../src/utils/consumption';

describe('normalizeConsumptionProfile', () => {
  const simpleTariff: Tariff = {
    name: 'Test',
    rates: [{ period: 'day', importRate: 0.2, exportRate: 0 }]
  };

  it('uses idx as monthIndex when month.monthIndex is not a number', () => {
    const profile = {
      months: Array.from({ length: 12 }, (_, idx) => ({
        monthIndex: undefined as unknown as number,
        totalKwh: 100,
        bucketShares: { day: 1 }
      }))
    };
    const result = normalizeConsumptionProfile(profile, simpleTariff);
    result.months.forEach((m, i) => {
      expect(m.monthIndex).toBe(i);
    });
  });
});

describe('makeDefaultBucketShares - night only', () => {
  it('handles only night key (no day, no peak) - assigns night full share via normalization', () => {
    const shares = makeDefaultBucketShares(['night']);
    // night=0.35 assigned, no peak or day → assigned=0.35, remainingKeys=[]
    // normalizeSharesToOne({night: 0.35}, ['night']) → night = 1
    expect(shares.night).toBeCloseTo(1.0, 6);
  });

  it('handles night + unknown key - distributes remainder to unknown', () => {
    const shares = makeDefaultBucketShares(['night', 'other']);
    // night=0.35, no peak/day assigned → assigned=0.35, remainingKeys=['other']
    // remaining = 1 - 0.35 = 0.65, each = 0.65
    // shares = {night: 0.35, other: 0.65} → normalizeSharesToOne → already sums to 1
    expect(shares.night).toBeCloseTo(0.35, 5);
    expect(shares.other).toBeCloseTo(0.65, 5);
    const sum = Object.values(shares).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

// --- generateSeasonalMonthlyKwh ---
describe('generateSeasonalMonthlyKwh', () => {
  it('produces higher values in winter and lower in summer', () => {
    const monthly = generateSeasonalMonthlyKwh(2000, 800);
    expect(monthly).toHaveLength(12);
    // Jan should be the peak (index 0 = cos(0) = 1)
    expect(monthly[0]).toBeCloseTo(2000, 0);
    // Jul should be the trough (index 6 = cos(π) = -1)
    expect(monthly[6]).toBeCloseTo(800, 0);
  });

  it('returns all zeros when both inputs are 0', () => {
    const monthly = generateSeasonalMonthlyKwh(0, 0);
    monthly.forEach(v => expect(v).toBe(0));
  });

  it('handles non-finite inputs as 0', () => {
    const monthly = generateSeasonalMonthlyKwh(NaN, Infinity);
    monthly.forEach(v => expect(v).toBe(0));
  });

  it('clamps negative inputs to 0', () => {
    const monthly = generateSeasonalMonthlyKwh(-100, -50);
    monthly.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
});

// --- buildConsumptionProfileFromSeasonalInputs ---
describe('buildConsumptionProfileFromSeasonalInputs', () => {
  const tariff: Tariff = {
    name: 'Test Tariff',
    rates: [
      { period: 'Day', importRate: 0.2, exportRate: 0 },
      { period: 'Night', importRate: 0.1, exportRate: 0 },
    ]
  };

  it('returns a profile with 12 months', () => {
    const profile = buildConsumptionProfileFromSeasonalInputs(2000, 800, tariff);
    expect(profile.months).toHaveLength(12);
  });

  it('each month has correct monthIndex and bucketShares', () => {
    const profile = buildConsumptionProfileFromSeasonalInputs(1500, 1000, tariff);
    profile.months.forEach((m, i) => {
      expect(m.monthIndex).toBe(i);
      expect(m.bucketShares).toBeDefined();
      const sum = Object.values(m.bucketShares).reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    });
  });

  it('monthly totalKwh follows seasonal pattern', () => {
    const profile = buildConsumptionProfileFromSeasonalInputs(2000, 800, tariff);
    // Jan > Jul
    expect(profile.months[0].totalKwh).toBeGreaterThan(profile.months[6].totalKwh);
  });
});
