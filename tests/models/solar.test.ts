import { describe, expect, it } from 'vitest';
import {
  applyDegradation,
  calculateAnnualGeneration,
  calculateMonthlyGeneration,
  calculatePercentile
} from '../../src/models/solar';
import type { HistoricalSolarData } from '../../src/types';

describe('solar model', () => {
  const historical: Record<string, HistoricalSolarData> = {
    Dublin: {
      location: 'Dublin',
      lat: 0,
      lon: 0,
      source: 'test',
      period: 'test',
      yearlyTotals: [
        { year: 2020, totalKwhKwp: 900 },
        { year: 2021, totalKwhKwp: 1000 },
        { year: 2022, totalKwhKwp: 950 }
      ],
      monthlyAverages: {
        Jan: { irradiance: 0, pvYield: 10 },
        Feb: { irradiance: 0, pvYield: 20 },
        Mar: { irradiance: 0, pvYield: 30 },
        Apr: { irradiance: 0, pvYield: 40 },
        May: { irradiance: 0, pvYield: 50 },
        Jun: { irradiance: 0, pvYield: 60 },
        Jul: { irradiance: 0, pvYield: 70 },
        Aug: { irradiance: 0, pvYield: 80 },
        Sep: { irradiance: 0, pvYield: 90 },
        Oct: { irradiance: 0, pvYield: 100 },
        Nov: { irradiance: 0, pvYield: 110 },
        Dec: { irradiance: 0, pvYield: 120 }
      }
    }
  };

  it('uses historical median yield when available', () => {
    // Median of [900, 950, 1000] = 950
    expect(calculateAnnualGeneration(10, 'Dublin', historical, true)).toBe(9500);
  });

  it('uses fallback yield when location missing', () => {
    expect(calculateAnnualGeneration(10, 'Missing', historical, true)).toBe(9500);
  });

  it('uses fallback yield when useHistorical=false', () => {
    expect(calculateAnnualGeneration(10, 'Dublin', historical, false)).toBe(9500);
  });

  it('computes monthly generation (12 months)', () => {
    const months = calculateMonthlyGeneration(2, 'Dublin', historical);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe(20); // 2kWp * 10 kWh/kWp
    expect(months[11]).toBe(240); // 2kWp * 120 kWh/kWp
  });

  it('falls back to default monthly distribution if monthly averages missing', () => {
    const historicalNoMonths: Record<string, HistoricalSolarData> = {
      Cork: {
        location: 'Cork',
        lat: 0,
        lon: 0,
        source: 'test',
        period: 'test',
        yearlyTotals: [{ year: 2020, totalKwhKwp: 1000 }]
      }
    };

    const months = calculateMonthlyGeneration(1, 'Cork', historicalNoMonths);
    expect(months).toHaveLength(12);
    expect(months.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('applies degradation with yearIndex 0 meaning no degradation', () => {
    expect(applyDegradation(1000, 0, 0.01)).toBe(1000);
  });

  it('applies degradation over time', () => {
    expect(applyDegradation(1000, 2, 0.01)).toBeCloseTo(1000 * 0.99 * 0.99, 10);
    expect(applyDegradation(1000, -1, 0.01)).toBe(1000);
  });

  it('calculates percentile', () => {
    expect(calculatePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(calculatePercentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(calculatePercentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  // --- Coverage for line 26: NaN / 0 systemSizeKwp ---

  it('returns 0 when systemSizeKwp is NaN', () => {
    expect(calculateAnnualGeneration(NaN, 'Dublin', historical)).toBe(0);
  });

  it('returns 0 when systemSizeKwp is 0', () => {
    expect(calculateAnnualGeneration(0, 'Dublin', historical)).toBe(0);
  });

  // --- Coverage for lines 67-68: missing pvYield in some months ---

  it('falls back to fallbackKwhPerKwp when pvYield is missing for some months', () => {
    const fallbackKwhPerKwp = [25, 45, 88, 125, 155, 160, 152, 130, 95, 58, 30, 20];
    const partialMonths: Record<string, HistoricalSolarData> = {
      Galway: {
        location: 'Galway',
        lat: 0,
        lon: 0,
        source: 'test',
        period: 'test',
        yearlyTotals: [{ year: 2020, totalKwhKwp: 900 }],
        monthlyAverages: {
          Jan: { irradiance: 0, pvYield: 15 },
          Feb: { irradiance: 0, pvYield: NaN },         // non-finite → fallback
          Mar: { irradiance: 0, pvYield: 30 },
          Apr: { irradiance: 0, pvYield: undefined as unknown as number }, // missing → fallback
          May: { irradiance: 0, pvYield: 50 },
          Jun: { irradiance: 0, pvYield: Infinity },     // non-finite → fallback
          Jul: { irradiance: 0, pvYield: 70 },
          Aug: { irradiance: 0, pvYield: 80 },
          Sep: { irradiance: 0, pvYield: 90 },
          Oct: { irradiance: 0, pvYield: 100 },
          Nov: { irradiance: 0, pvYield: 110 },
          Dec: { irradiance: 0, pvYield: 120 }
        }
      }
    };

    const months = calculateMonthlyGeneration(2, 'Galway', partialMonths);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe(30);  // 2 * 15 (valid pvYield)
    expect(months[1]).toBe(fallbackKwhPerKwp[1] * 2);  // NaN → fallback 45 * 2
    expect(months[2]).toBe(60);  // 2 * 30 (valid)
    expect(months[3]).toBe(fallbackKwhPerKwp[3] * 2);  // undefined → fallback 125 * 2
    expect(months[5]).toBe(fallbackKwhPerKwp[5] * 2);  // Infinity → fallback 160 * 2
  });

  // --- Coverage for line 80: applyDegradation with non-finite / non-positive ---

  it('returns 0 when generation is NaN', () => {
    expect(applyDegradation(NaN, 5)).toBe(0);
  });

  it('returns 0 when generation is Infinity', () => {
    expect(applyDegradation(Infinity, 5)).toBe(0);
  });

  it('returns 0 when generation is negative', () => {
    expect(applyDegradation(-5, 5)).toBe(0);
  });

  it('returns 0 when generation is 0', () => {
    expect(applyDegradation(0, 5)).toBe(0);
  });

  // --- Coverage for line 88: calculateMedian with even-length array ---

  it('uses historical median with even number of yearly totals', () => {
    const evenYears: Record<string, HistoricalSolarData> = {
      Dublin: {
        location: 'Dublin',
        lat: 0,
        lon: 0,
        source: 'test',
        period: 'test',
        yearlyTotals: [
          { year: 2020, totalKwhKwp: 900 },
          { year: 2021, totalKwhKwp: 1000 },
          { year: 2022, totalKwhKwp: 950 },
          { year: 2023, totalKwhKwp: 1050 }
        ]
      }
    };
    // Sorted: [900, 950, 1000, 1050] → median = (950 + 1000) / 2 = 975
    expect(calculateAnnualGeneration(10, 'Dublin', evenYears)).toBe(9750);
  });

  // --- Coverage for lines 91-99: calculatePercentile edge cases ---

  it('returns NaN for empty array percentile', () => {
    expect(calculatePercentile([], 50)).toBeNaN();
  });

  it('interpolates between indices for fractional percentile', () => {
    // sorted: [10, 20, 30, 40]
    // p=25 → index = 0.25 * 3 = 0.75 → lower=0, upper=1, weight=0.75
    // result = 10 * 0.25 + 20 * 0.75 = 2.5 + 15 = 17.5
    expect(calculatePercentile([10, 20, 30, 40], 25)).toBe(17.5);
  });
});
