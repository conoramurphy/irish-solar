import { describe, it, expect } from 'vitest';
import type { HourlyEnergyFlow, Tariff } from '../../src/types';
import { calculateMonthlyBillBreakdown, sumAnnualByBucket, sumAnnualKwhByBucket } from '../../src/utils/billBreakdown';

function makeHour(
  hourKey: string,
  monthIndex: number,
  hourOfDay: number,
  consumption: number,
  gridImport: number
): HourlyEnergyFlow {
  return {
    hour: 0,
    generation: 0,
    consumption,
    gridImport,
    gridExport: 0,
    batteryCharge: 0,
    batteryDischarge: 0,
    batterySoC: 0,
    hourKey,
    monthIndex,
    hourOfDay,
    baselineCost: 0,
    importCost: 0,
    exportRevenue: 0,
    savings: 0,
    tariffBucket: 'day'
  };
}

describe('billBreakdown', () => {
  it('splits baseline/after by effective buckets (ev/free/night/day) and includes standing', () => {
    const tariff: Tariff = {
      id: 't',
      supplier: 'Test',
      product: 'EV + Free',
      type: 'ev',
      standingCharge: 2, // €/day
      exportRate: 0,
      psoLevy: 0.01,
      rates: [
        { period: 'night', hours: '23:00-08:00', rate: 0.10 },
        { period: 'day', hours: '08:00-23:00', rate: 0.20 }
      ],
      evRate: 0.05,
      evTimeWindow: { description: '2-6', hourRanges: [{ start: 2, end: 6 }] },
      freeElectricityWindow: { description: 'Sat 10-12', hourRanges: [{ start: 10, end: 12 }], daysOfWeek: [6] }
    };

    // Sat Jan 4 2020 is dayOfWeek=6
    const rows: HourlyEnergyFlow[] = [
      // EV window
      makeHour('2020-01-04T02', 0, 2, 1, 0.5),
      makeHour('2020-01-04T03', 0, 3, 1, 0.5),
      // Free window (still pays PSO levy)
      makeHour('2020-01-04T10', 0, 10, 1, 0.5),
      // Normal day bucket
      makeHour('2020-01-04T14', 0, 14, 1, 0.5),
      // Normal night bucket
      makeHour('2020-01-04T23', 0, 23, 1, 0.5)
    ];

    const monthly = calculateMonthlyBillBreakdown(rows, tariff);

    const jan = monthly[0];
    expect(jan).toBeDefined();

    // Standing should be charged for every hour present
    // standing per hour = 2/24
    const standing = jan!.eurByBucketBaseline.standing;
    expect(standing).toBeCloseTo((2 / 24) * rows.length, 8);

    // kWh per bucket
    expect(jan!.kwhByBucketBaseline.ev).toBeCloseTo(2, 6);
    expect(jan!.kwhByBucketBaseline.free).toBeCloseTo(1, 6);
    expect(jan!.kwhByBucketBaseline.day).toBeCloseTo(1, 6);
    expect(jan!.kwhByBucketBaseline.night).toBeCloseTo(1, 6);

    // Costs by bucket include PSO levy
    // EV: 2 kWh * (0.05 + 0.01)
    expect(jan!.eurByBucketBaseline.ev).toBeCloseTo(2 * (0.05 + 0.01), 6);
    // Free: 1 kWh * (0 + 0.01)
    expect(jan!.eurByBucketBaseline.free).toBeCloseTo(1 * (0 + 0.01), 6);
    // Day: 1 kWh * (0.20 + 0.01)
    expect(jan!.eurByBucketBaseline.day).toBeCloseTo(1 * (0.20 + 0.01), 6);
    // Night: 1 kWh * (0.10 + 0.01)
    expect(jan!.eurByBucketBaseline.night).toBeCloseTo(1 * (0.10 + 0.01), 6);

    // After-solar kWh should be half of baseline in this fixture
    const annualKwhAfter = sumAnnualKwhByBucket(monthly, 'after');
    expect(annualKwhAfter.ev).toBeCloseTo(1, 6);
    expect(annualKwhAfter.free).toBeCloseTo(0.5, 6);

    // Annual sums should include standing
    const annualEurBaseline = sumAnnualByBucket(monthly, 'baseline');
    expect(annualEurBaseline.standing).toBeGreaterThan(0);
  });
});
