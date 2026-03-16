import { describe, it, expect } from 'vitest';
import { isHourInTimeWindow, getTariffRateForHour, getEffectiveTariffBucketForHour } from '../../src/utils/tariffRate';
import type { Tariff, TimeWindow } from '../../src/types';

/** Helper to build a minimal Tariff with sensible defaults */
function makeTariff(overrides: Partial<Tariff> = {}): Tariff {
  return {
    id: 'test-tariff',
    supplier: 'Test Supplier',
    product: 'Test Product',
    type: 'time-of-use',
    standingCharge: 0.5,
    rates: [
      { period: 'Day', hours: '08:00-23:00', rate: 0.30 },
      { period: 'Night', hours: '23:00-08:00', rate: 0.15 },
    ],
    exportRate: 0.185,
    ...overrides,
  };
}

describe('isHourInTimeWindow', () => {
  it('returns false when window is undefined', () => {
    expect(isHourInTimeWindow(12, 1, undefined)).toBe(false);
  });

  it('returns true when window has no hour ranges and no day constraint', () => {
    const window: TimeWindow = { description: 'always' };
    expect(isHourInTimeWindow(12, 1, window)).toBe(true);
  });

  it('returns true when window has no hour ranges and day constraint matches', () => {
    const window: TimeWindow = { description: 'weekends', daysOfWeek: [0, 6] };
    expect(isHourInTimeWindow(12, 0, window)).toBe(true);
    expect(isHourInTimeWindow(12, 6, window)).toBe(true);
  });

  it('returns false when day-of-week does not match', () => {
    const window: TimeWindow = { description: 'weekends', daysOfWeek: [0, 6] };
    expect(isHourInTimeWindow(12, 1, window)).toBe(false);
  });

  it('returns false when dayOfWeek is undefined and daysOfWeek constraint exists', () => {
    const window: TimeWindow = { description: 'weekends', daysOfWeek: [0, 6] };
    expect(isHourInTimeWindow(12, undefined, window)).toBe(false);
  });

  it('matches hour within a normal range', () => {
    const window: TimeWindow = {
      description: '2am-6am',
      hourRanges: [{ start: 2, end: 6 }],
    };
    expect(isHourInTimeWindow(2, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(5, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(6, undefined, window)).toBe(false);
    expect(isHourInTimeWindow(1, undefined, window)).toBe(false);
  });

  it('matches hour within a midnight-crossing range', () => {
    const window: TimeWindow = {
      description: '11pm-5am',
      hourRanges: [{ start: 23, end: 5 }],
    };
    expect(isHourInTimeWindow(23, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(0, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(4, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(5, undefined, window)).toBe(false);
    expect(isHourInTimeWindow(22, undefined, window)).toBe(false);
  });

  it('combines day-of-week and hour range constraints', () => {
    const window: TimeWindow = {
      description: 'Sat/Sun 8-11',
      hourRanges: [{ start: 8, end: 11 }],
      daysOfWeek: [0, 6],
    };
    // Right day, right hour
    expect(isHourInTimeWindow(9, 0, window)).toBe(true);
    // Right day, wrong hour
    expect(isHourInTimeWindow(12, 0, window)).toBe(false);
    // Wrong day, right hour
    expect(isHourInTimeWindow(9, 3, window)).toBe(false);
  });

  it('matches with multiple hour ranges', () => {
    const window: TimeWindow = {
      description: 'morning and evening',
      hourRanges: [
        { start: 6, end: 9 },
        { start: 18, end: 21 },
      ],
    };
    expect(isHourInTimeWindow(7, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(19, undefined, window)).toBe(true);
    expect(isHourInTimeWindow(12, undefined, window)).toBe(false);
  });
});

describe('getTariffRateForHour', () => {
  it('returns 0 when free electricity window is active', () => {
    const tariff = makeTariff({
      freeElectricityWindow: {
        description: 'Sat/Sun 9-12',
        hourRanges: [{ start: 9, end: 12 }],
        daysOfWeek: [0, 6],
      },
    });
    // Saturday at 10am → free
    expect(getTariffRateForHour(10, tariff, 6)).toBe(0);
  });

  it('does not return 0 outside free electricity window', () => {
    const tariff = makeTariff({
      freeElectricityWindow: {
        description: 'Sat/Sun 9-12',
        hourRanges: [{ start: 9, end: 12 }],
        daysOfWeek: [0, 6],
      },
    });
    // Monday at 10am → normal rate
    expect(getTariffRateForHour(10, tariff, 1)).toBeGreaterThan(0);
  });

  it('returns EV rate when EV window is active', () => {
    const tariff = makeTariff({
      evRate: 0.08,
      evTimeWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
    });
    expect(getTariffRateForHour(3, tariff)).toBe(0.08);
  });

  it('does not return EV rate outside EV window', () => {
    const tariff = makeTariff({
      evRate: 0.08,
      evTimeWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
    });
    expect(getTariffRateForHour(12, tariff)).not.toBe(0.08);
  });

  it('free electricity takes precedence over EV rate', () => {
    const tariff = makeTariff({
      evRate: 0.08,
      evTimeWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
      freeElectricityWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
    });
    expect(getTariffRateForHour(3, tariff)).toBe(0);
  });

  it('falls back to standard bucket rate when no special windows match', () => {
    const tariff = makeTariff();
    // Hour 10 is day rate (08:00-23:00)
    expect(getTariffRateForHour(10, tariff)).toBe(0.30);
    // Hour 2 is night rate (23:00-08:00)
    expect(getTariffRateForHour(2, tariff)).toBe(0.15);
  });

  it('falls back to first rate when hour has no explicit match', () => {
    const tariff = makeTariff({
      rates: [{ period: 'Day', hours: '08:00-17:00', rate: 0.30 }],
    });
    // Hour 2 has no matching hours range — falls back to the only rate available
    expect(getTariffRateForHour(2, tariff)).toBe(0.30);
  });

  it('returns 0 when rates array is empty', () => {
    const tariff = makeTariff({ rates: [] });
    expect(getTariffRateForHour(10, tariff)).toBe(0);
  });
});

describe('getEffectiveTariffBucketForHour', () => {
  it('returns "free" when free electricity window is active', () => {
    const tariff = makeTariff({
      freeElectricityWindow: {
        description: 'Sat 9-12',
        hourRanges: [{ start: 9, end: 12 }],
        daysOfWeek: [6],
      },
    });
    expect(getEffectiveTariffBucketForHour(10, tariff, 6)).toBe('free');
  });

  it('returns "ev" when EV window is active', () => {
    const tariff = makeTariff({
      evRate: 0.08,
      evTimeWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
    });
    expect(getEffectiveTariffBucketForHour(3, tariff)).toBe('ev');
  });

  it('"free" takes precedence over "ev"', () => {
    const tariff = makeTariff({
      evRate: 0.08,
      evTimeWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
      freeElectricityWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
    });
    expect(getEffectiveTariffBucketForHour(3, tariff)).toBe('free');
  });

  it('returns standard bucket label when no special windows match', () => {
    const tariff = makeTariff();
    // Hour 10 → day bucket
    expect(getEffectiveTariffBucketForHour(10, tariff)).toBe('day');
    // Hour 2 → night bucket
    expect(getEffectiveTariffBucketForHour(2, tariff)).toBe('night');
  });

  it('does not return "ev" when evRate is undefined', () => {
    const tariff = makeTariff({
      evTimeWindow: {
        description: '2am-5am',
        hourRanges: [{ start: 2, end: 5 }],
      },
    });
    // evRate not set → falls through to standard bucket
    expect(getEffectiveTariffBucketForHour(3, tariff)).not.toBe('ev');
  });

  it('does not return "free" outside the free window', () => {
    const tariff = makeTariff({
      freeElectricityWindow: {
        description: 'Sat 9-12',
        hourRanges: [{ start: 9, end: 12 }],
        daysOfWeek: [6],
      },
    });
    // Monday at 10am
    expect(getEffectiveTariffBucketForHour(10, tariff, 1)).not.toBe('free');
  });
});
