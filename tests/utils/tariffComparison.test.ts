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
});
