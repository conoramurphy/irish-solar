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

  /** Simple flat tariff used by most branch-coverage tests */
  const flatTariff: Tariff = {
    id: 'flat',
    supplier: 'Test',
    product: 'Flat',
    type: 'flat',
    standingCharge: 2.4, // €/day → 0.10 per hourly slot
    exportRate: 0,
    psoLevy: 0,
    rates: [{ period: 'day', hours: '00:00-24:00', rate: 0.20 }]
  };

  // ── safeNumber branch: non-number consumption values ────────────────
  it('safeNumber coerces string-like consumption and treats NaN/undefined as 0', () => {
    const rows: HourlyEnergyFlow[] = [
      // consumption is a string "3" cast via `as any`
      { ...makeHour('2020-06-01T12', 5, 12, 0, 0), consumption: '3' as unknown as number },
      // consumption is undefined
      { ...makeHour('2020-06-01T13', 5, 13, 0, 0), consumption: undefined as unknown as number },
      // consumption is NaN
      { ...makeHour('2020-06-01T14', 5, 14, 0, 0), consumption: NaN },
    ];

    const monthly = calculateMonthlyBillBreakdown(rows, flatTariff);
    const jun = monthly[5]!;
    // "3" → 3, undefined → 0, NaN → 0  ⇒ total baseline kWh = 3
    const totalKwh = Object.entries(jun.kwhByBucketBaseline)
      .reduce((sum, [, v]) => sum + v, 0);
    expect(totalKwh).toBeCloseTo(3, 6);
  });

  // ── parseHourKey: derive monthIndex from hourKey when row.monthIndex is missing ──
  it('derives monthIndex from hourKey when row.monthIndex is undefined', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('2020-03-15T10', 2, 10, 1, 0.5),
      monthIndex: undefined as unknown as number,          // force undefined
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    // March → monthIndex 2
    expect(monthly[2]!.kwhByBucketBaseline.day).toBeCloseTo(1, 6);
  });

  // ── parseHourKey: derive hourOfDay from hourKey when row.hourOfDay is missing ──
  it('derives hourOfDay from hourKey when row.hourOfDay is undefined', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('2020-03-15T10', 2, 10, 1, 0.5),
      hourOfDay: undefined as unknown as number,           // force undefined
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    expect(monthly[2]!.kwhByBucketBaseline.day).toBeCloseTo(1, 6);
  });

  // ── parseHourKey: both monthIndex and hourKey undefined → row is skipped ──
  it('skips rows where both monthIndex and hourKey are undefined', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('2020-01-01T00', 0, 0, 5, 5),
      monthIndex: undefined as unknown as number,
      hourKey: undefined,
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    // No kWh should appear anywhere
    const totalKwh = monthly.reduce(
      (sum, m) =>
        sum + Object.values(m.kwhByBucketBaseline).reduce((a, b) => a + b, 0),
      0
    );
    expect(totalKwh).toBe(0);
  });

  // ── parseHourKey: invalid hourKey format → row is skipped ──
  it('skips rows with invalid hourKey format when monthIndex is also missing', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('not-a-date', 0, 0, 5, 5),
      monthIndex: undefined as unknown as number,
      hourOfDay: undefined as unknown as number,
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    const totalKwh = monthly.reduce(
      (sum, m) =>
        sum + Object.values(m.kwhByBucketBaseline).reduce((a, b) => a + b, 0),
      0
    );
    expect(totalKwh).toBe(0);
  });

  // ── parseHourKey: invalid monthIndex (out of range) via hourKey ──
  it('skips rows where parsed monthIndex is out of range (e.g. month 13)', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('2020-13-01T10', 0, 10, 5, 5),
      monthIndex: undefined as unknown as number,
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    const totalKwh = monthly.reduce(
      (sum, m) =>
        sum + Object.values(m.kwhByBucketBaseline).reduce((a, b) => a + b, 0),
      0
    );
    expect(totalKwh).toBe(0);
  });

  // ── parseHourKey: half-hourly format YYYY-MM-DDTHH:MM ──
  it('parses half-hourly hourKey format YYYY-MM-DDTHH:MM', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('2020-07-10T14:30', 6, 14, 2, 1),
      monthIndex: undefined as unknown as number,
      hourOfDay: undefined as unknown as number,
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    // July → monthIndex 6, hour 14
    expect(monthly[6]!.kwhByBucketBaseline.day).toBeCloseTo(2, 6);
  });

  // ── Half-hourly data (>10000 rows): standing charge divided by 48 ──
  it('divides standing charge by 48 for half-hourly data (>10000 rows)', () => {
    // 17520 slots = 365 * 48 (half-hourly full year)
    const rows: HourlyEnergyFlow[] = Array.from({ length: 17520 }, (_, i) => {
      const dayOfYear = Math.floor(i / 48);
      const slotOfDay = i % 48;
      const hourOfDay = Math.floor(slotOfDay / 2);
      const month = Math.min(11, Math.floor(dayOfYear / 30.44));
      return makeHour(
        `2020-01-01T${String(hourOfDay).padStart(2, '0')}:${slotOfDay % 2 === 0 ? '00' : '30'}`,
        month,
        hourOfDay,
        0.1,
        0.05
      );
    });

    const monthly = calculateMonthlyBillBreakdown(rows, flatTariff);
    // Total standing = standingCharge/48 * 17520 = 2.4/48 * 17520 = 876
    const totalStanding = monthly.reduce((s, m) => s + m.eurByBucketBaseline.standing, 0);
    expect(totalStanding).toBeCloseTo(2.4 / 48 * 17520, 4);
  });

  // ── sumAnnualByBucket with 'after' mode ──
  it('sumAnnualByBucket sums after-solar EUR correctly', () => {
    const rows = [
      makeHour('2020-01-04T14', 0, 14, 2, 1),
      makeHour('2020-02-04T14', 1, 14, 2, 0.5),
    ];
    const monthly = calculateMonthlyBillBreakdown(rows, flatTariff);
    const annualAfter = sumAnnualByBucket(monthly, 'after');

    // after kWh: 1 + 0.5 = 1.5, rate = 0.20, pso = 0
    expect(annualAfter.day).toBeCloseTo(1.5 * 0.20, 6);
    expect(annualAfter.standing).toBeGreaterThan(0);
  });

  // ── sumAnnualKwhByBucket with 'baseline' mode ──
  it('sumAnnualKwhByBucket sums baseline kWh correctly', () => {
    const rows = [
      makeHour('2020-04-10T08', 3, 8, 3, 1),
      makeHour('2020-04-10T09', 3, 9, 4, 2),
    ];
    const monthly = calculateMonthlyBillBreakdown(rows, flatTariff);
    const annualKwhBaseline = sumAnnualKwhByBucket(monthly, 'baseline');

    expect(annualKwhBaseline.day).toBeCloseTo(7, 6);
  });

  // ── Row with both monthIndex and hourOfDay invalid and no usable hourKey ──
  it('skips rows with invalid hourOfDay and no usable hourKey fallback', () => {
    const row: HourlyEnergyFlow = {
      ...makeHour('2020-01-01T00', 0, 0, 5, 5),
      hourOfDay: undefined as unknown as number,
      hourKey: undefined,
    };

    const monthly = calculateMonthlyBillBreakdown([row], flatTariff);
    const totalKwh = monthly.reduce(
      (sum, m) =>
        sum + Object.values(m.kwhByBucketBaseline).reduce((a, b) => a + b, 0),
      0
    );
    expect(totalKwh).toBe(0);
  });
});
