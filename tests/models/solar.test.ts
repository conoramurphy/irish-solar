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
});
