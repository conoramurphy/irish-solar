import { describe, expect, it } from 'vitest';
import type { Tariff } from '../../src/types';
import { compareDomesticTariffsForUsage } from '../../src/utils/tariffComparison';
import { buildCanonicalHourStampsForYear, expectedHoursInYear } from '../../src/utils/solarTimeseriesParser';

function makeHourlyUsage(year: number, fn: (i: number, stamp: { year: number; monthIndex: number; day: number; hour: number }) => number) {
  const stamps = buildCanonicalHourStampsForYear(year);
  const hours = expectedHoursInYear(year);
  expect(stamps).toHaveLength(hours);
  return stamps.map((s, i) => fn(i, s));
}

describe('compareDomesticTariffsForUsage', () => {
  it('ranks an EV-window tariff cheaper when usage is concentrated in the EV window', () => {
    const year = 2023;

    // 1 kWh for hours 2-5 every day.
    const hourlyConsumption = makeHourlyUsage(year, (_i, stamp) => (stamp.hour >= 2 && stamp.hour < 6 ? 1 : 0));

    const flat: Tariff = {
      id: 'flat',
      supplier: 'Test',
      product: 'Flat',
      type: 'flat',
      standingCharge: 0.5,
      rates: [{ period: 'all-day', rate: 0.2 }],
      exportRate: 0,
      psoLevy: 0.01
    };

    const ev: Tariff = {
      id: 'ev',
      supplier: 'Test',
      product: 'EV Plan',
      type: 'ev',
      standingCharge: 0.5,
      rates: [
        { period: 'day', hours: '06:00-23:00', rate: 0.35 },
        { period: 'night', hours: '23:00-06:00', rate: 0.25 }
      ],
      exportRate: 0,
      psoLevy: 0.01,
      evRate: 0.05,
      evTimeWindow: { description: '2-6', hourRanges: [{ start: 2, end: 6 }] }
    };

    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [flat, ev] });

    expect(rows[0]?.tariff.id).toBe('ev');
    expect(rows[1]?.tariff.id).toBe('flat');

    // Usage should be 100% at the cheapest rate for the EV tariff.
    const evRow = rows.find((r) => r.tariff.id === 'ev')!;
    expect(evRow.hasEvWindow).toBe(true);
    expect(evRow.distinctRateCount).toBe(1);
    expect(evRow.pctKwhAtCheapestRate).toBeCloseTo(1, 8);

    // Cheapest unit rate includes PSO.
    expect(evRow.minUnitRate).toBeCloseTo(0.05 + 0.01, 6);
  });

  it('treats free-electricity windows as a cheaper effective bucket for ranking', () => {
    const year = 2023;
    const stamps = buildCanonicalHourStampsForYear(year);

    // 1 kWh only during free window: Sundays 9-11.
    const hourlyConsumption = stamps.map((s) => {
      const dow = new Date(s.year, s.monthIndex, s.day).getDay();
      const isSunday = dow === 0;
      const isFreeHour = s.hour >= 9 && s.hour < 11;
      return isSunday && isFreeHour ? 1 : 0;
    });

    const normal: Tariff = {
      id: 'normal',
      supplier: 'Test',
      product: 'Normal',
      type: 'time-of-use',
      standingCharge: 0,
      rates: [{ period: 'day', rate: 0.3 }],
      exportRate: 0,
      psoLevy: 0.01
    };

    const free: Tariff = {
      id: 'free',
      supplier: 'Test',
      product: 'Free Sundays',
      type: 'smart',
      standingCharge: 0,
      rates: [{ period: 'day', rate: 0.3 }],
      exportRate: 0,
      psoLevy: 0.01,
      freeElectricityWindow: {
        description: 'Sundays 9-11',
        hourRanges: [{ start: 9, end: 11 }],
        daysOfWeek: [0]
      }
    };

    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [normal, free] });

    expect(rows[0]?.tariff.id).toBe('free');

    const freeRow = rows[0]!;
    expect(freeRow.hasFreeWindow).toBe(true);
    expect(freeRow.kwhByEffectiveBucket.free).toBeGreaterThan(0);

    // In the free window the base rate is 0, so min unit rate should be PSO-only.
    expect(freeRow.minUnitRate).toBeCloseTo(0.01, 6);
  });

  it('throws when hourlyConsumption length does not match expected hours for the year', () => {
    const year = 2023;
    const expected = expectedHoursInYear(year);
    const wrongLength = new Array(expected - 10).fill(0);

    const tariff: Tariff = {
      id: 'flat',
      supplier: 'Test',
      product: 'Flat',
      type: 'flat',
      standingCharge: 0,
      rates: [{ period: 'all-day', rate: 0.2 }],
      exportRate: 0,
      psoLevy: 0
    };

    expect(() =>
      compareDomesticTariffsForUsage({ hourlyConsumption: wrongLength, year, tariffs: [tariff] })
    ).toThrow(
      `Usage slot count (${wrongLength.length}) does not match expected ${expected} slots (24/day) for year ${year}.`
    );
  });

  it('handles zero consumption (all hours = 0) with Infinity fallback for minUnitRate', () => {
    const year = 2023;
    const hourlyConsumption = makeHourlyUsage(year, () => 0);

    const tariff: Tariff = {
      id: 'flat',
      supplier: 'Test',
      product: 'Flat',
      type: 'flat',
      standingCharge: 0.5,
      rates: [{ period: 'all-day', rate: 0.2 }],
      exportRate: 0,
      psoLevy: 0.01
    };

    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [tariff] });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.totalKwh).toBe(0);
    // minUnitRate falls back from Infinity to 0
    expect(row.minUnitRate).toBe(0);
    // maxUnitRate falls back from -Infinity to 0
    expect(row.maxUnitRate).toBe(0);
    expect(row.rateSpread).toBe(0);
    expect(row.distinctRateCount).toBe(0);
    expect(row.effectiveAllInImportRateEurPerKwh).toBe(0);
    expect(row.pctKwhAtCheapestRate).toBe(0);
    expect(row.pctKwhAtMaxRate).toBe(0);
  });

  it('handles half-hourly consumption (17520 slots) for a non-leap year', () => {
    const year = 2023; // non-leap: 365 * 48 = 17520
    const hourlyConsumption = new Array(17520).fill(0.5);

    const tariff: Tariff = {
      id: 'flat-hh',
      supplier: 'Test',
      product: 'Flat HH',
      type: 'flat',
      standingCharge: 0,
      rates: [{ period: 'all-day', rate: 0.2 }],
      exportRate: 0,
      psoLevy: 0
    };

    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [tariff] });
    expect(rows).toHaveLength(1);
    expect(rows[0].totalKwh).toBeCloseTo(17520 * 0.5, 0);
  });

  it('returns 0 for best cost when tariffs array is empty (sorted[0] is undefined)', () => {
    const year = 2023;
    const hourlyConsumption = makeHourlyUsage(year, () => 1);

    // Pass empty tariffs array → sorted[0] is undefined → best = sorted[0]?.annualCostEur ?? 0
    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [] });
    expect(rows).toHaveLength(0);
  });

  it('handles safeNumber converting non-numeric psoLevy string to 0', () => {
    const year = 2023;
    const hourlyConsumption = makeHourlyUsage(year, () => 1);

    const tariff: Tariff = {
      id: 'string-pso',
      supplier: 'Test',
      product: 'String PSO',
      type: 'flat',
      standingCharge: 0,
      rates: [{ period: 'all-day', rate: 0.2 }],
      exportRate: 0,
      psoLevy: 'not-a-number' as unknown as number // triggers safeNumber fallback to 0
    };

    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [tariff] });
    expect(rows).toHaveLength(1);
    // psoLevy treated as 0 → rates computed without it
    expect(rows[0].minUnitRate).toBeCloseTo(0.2, 5);
  });

  it('sets deltaVsBestPct to 0 when best annual cost is 0', () => {
    const year = 2023;
    const hourlyConsumption = makeHourlyUsage(year, () => 0);

    const t1: Tariff = {
      id: 'zero-a',
      supplier: 'Test',
      product: 'Zero A',
      type: 'flat',
      standingCharge: 0,
      rates: [{ period: 'all-day', rate: 0.2 }],
      exportRate: 0,
      psoLevy: 0
    };

    const t2: Tariff = {
      id: 'zero-b',
      supplier: 'Test',
      product: 'Zero B',
      type: 'flat',
      standingCharge: 0,
      rates: [{ period: 'all-day', rate: 0.3 }],
      exportRate: 0,
      psoLevy: 0
    };

    const rows = compareDomesticTariffsForUsage({ hourlyConsumption, year, tariffs: [t1, t2] });

    // Both tariffs have 0 consumption and 0 standing charge → best = 0
    for (const row of rows) {
      expect(row.annualCostEur).toBe(0);
      expect(row.deltaVsBestEur).toBe(0);
      expect(row.deltaVsBestPct).toBe(0);
    }
  });
});
