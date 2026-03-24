import { describe, it, expect } from 'vitest';
import {
  parseTimeRanges,
  getTariffBucketForHour,
  generateDailyConsumptionCurve,
  distributeMonthlyConsumptionToHourly,
  generateHourlyConsumption,
  aggregateHourlyToMonthly
} from '../../src/utils/hourlyConsumption';
import type { Tariff, ConsumptionProfile } from '../../src/types';

describe('hourlyConsumption', () => {
  describe('parseTimeRanges', () => {
    it('should parse single time range', () => {
      const result = parseTimeRanges('09:00-17:00');
      expect(result).toEqual([[9, 17]]);
    });

    it('should parse multiple time ranges', () => {
      const result = parseTimeRanges('17:00-19:00,07:00-09:00');
      expect(result).toEqual([[17, 19], [7, 9]]);
    });

    it('should parse time range crossing midnight', () => {
      const result = parseTimeRanges('23:00-08:00');
      expect(result).toEqual([[23, 8]]);
    });

    it('should handle invalid input', () => {
      expect(parseTimeRanges('')).toEqual([]);
      expect(parseTimeRanges('invalid')).toEqual([]);
      expect(parseTimeRanges('12:00')).toEqual([]);
    });
  });

  describe('getTariffBucketForHour', () => {
    const testTariff: Tariff = {
      id: 'test',
      supplier: 'Test',
      product: 'Test',
      type: 'time-of-use',
      standingCharge: 1.0,
      rates: [
        { period: 'night', hours: '23:00-08:00', rate: 0.15 },
        { period: 'day', hours: '09:00-17:00', rate: 0.30 },
        { period: 'peak', hours: '17:00-19:00,07:00-09:00', rate: 0.40 },
        { period: 'other', rate: 0.25 }
      ],
      exportRate: 0.20,
      psoLevy: 0.02
    };

    it('should identify night hours', () => {
      expect(getTariffBucketForHour(0, testTariff)).toBe('night');
      expect(getTariffBucketForHour(5, testTariff)).toBe('night');
      expect(getTariffBucketForHour(23, testTariff)).toBe('night');
    });

    it('should identify day hours', () => {
      expect(getTariffBucketForHour(10, testTariff)).toBe('day');
      expect(getTariffBucketForHour(14, testTariff)).toBe('day');
      expect(getTariffBucketForHour(16, testTariff)).toBe('day');
    });

    it('should identify peak hours', () => {
      expect(getTariffBucketForHour(7, testTariff)).toBe('peak');
      expect(getTariffBucketForHour(8, testTariff)).toBe('peak');
      expect(getTariffBucketForHour(17, testTariff)).toBe('peak');
      expect(getTariffBucketForHour(18, testTariff)).toBe('peak');
    });

    it('should identify other hours', () => {
      expect(getTariffBucketForHour(19, testTariff)).toBe('other');
      expect(getTariffBucketForHour(20, testTariff)).toBe('other');
      expect(getTariffBucketForHour(21, testTariff)).toBe('other');
    });

    it('should handle flat tariff', () => {
      const flatTariff: Tariff = {
        id: 'flat',
        supplier: 'Test',
        product: 'Flat',
        type: '24-hour',
        standingCharge: 1.0,
        rates: [{ period: 'all-day', rate: 0.25 }],
        exportRate: 0.20
      };

      expect(getTariffBucketForHour(0, flatTariff)).toBe('all-day');
      expect(getTariffBucketForHour(12, flatTariff)).toBe('all-day');
      expect(getTariffBucketForHour(23, flatTariff)).toBe('all-day');
    });
  });

  describe('generateDailyConsumptionCurve', () => {
    it('should generate 24 hourly values', () => {
      const curve = generateDailyConsumptionCurve();
      expect(curve).toHaveLength(24);
    });

    it('should sum to 1 (normalized)', () => {
      const curve = generateDailyConsumptionCurve();
      const sum = curve.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    });

    it('should have lower values at night', () => {
      const curve = generateDailyConsumptionCurve();
      const nightAvg = (curve[0] + curve[1] + curve[2] + curve[3]) / 4;
      const dayAvg = (curve[10] + curve[11] + curve[12] + curve[13]) / 4;
      expect(nightAvg).toBeLessThan(dayAvg);
    });

    it('should have all positive values', () => {
      const curve = generateDailyConsumptionCurve();
      curve.forEach(val => {
        expect(val).toBeGreaterThan(0);
      });
    });

    describe('farm mode', () => {
      it('should return 24 values summing to 1', () => {
        const curve = generateDailyConsumptionCurve('farm');
        expect(curve).toHaveLength(24);
        const sum = curve.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 10);
      });

      it('should have two peaks at hour 7 (morning milking) and hour 17 (evening milking)', () => {
        const curve = generateDailyConsumptionCurve('farm');
        // Hour 7 should be a local maximum in the morning block
        expect(curve[7]).toBeGreaterThan(curve[6]);
        expect(curve[7]).toBeGreaterThan(curve[9]);
        // Hour 17 should be a local maximum in the evening block
        expect(curve[17]).toBeGreaterThan(curve[16]);
        expect(curve[17]).toBeGreaterThan(curve[19]);
        // Both peaks should be the same height
        expect(curve[7]).toBeCloseTo(curve[17], 10);
      });

      it('should have a water-heating spike at hour 0', () => {
        const curve = generateDailyConsumptionCurve('farm');
        // Hour 0 should be higher than surrounding base-load hours (2-5)
        expect(curve[0]).toBeGreaterThan(curve[2]);
        expect(curve[0]).toBeGreaterThan(curve[3]);
        expect(curve[0]).toBeGreaterThan(curve[4]);
        expect(curve[0]).toBeGreaterThan(curve[5]);
      });
    });

    describe('half-hourly (48-slot) curves', () => {
      it('should return 48 values summing to 1 for hotel', () => {
        const curve = generateDailyConsumptionCurve('hotel', 48);
        expect(curve).toHaveLength(48);
        const sum = curve.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 10);
      });

      it('should return 48 values summing to 1 for farm', () => {
        const curve = generateDailyConsumptionCurve('farm', 48);
        expect(curve).toHaveLength(48);
        const sum = curve.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 10);
      });
    });
  });

  describe('distributeMonthlyConsumptionToHourly', () => {
    const testTariff: Tariff = {
      id: 'test',
      supplier: 'Test',
      product: 'Test',
      type: 'time-of-use',
      standingCharge: 1.0,
      rates: [
        { period: 'night', hours: '23:00-08:00', rate: 0.15 },
        { period: 'day', hours: '09:00-17:00', rate: 0.30 },
        { period: 'other', rate: 0.25 }
      ],
      exportRate: 0.20
    };

    it('should generate correct number of hours', () => {
      const monthlyKwh = 10000;
      const bucketShares = { night: 0.3, day: 0.5, other: 0.2 };
      const daysInMonth = 31;

      const result = distributeMonthlyConsumptionToHourly(
        monthlyKwh,
        bucketShares,
        daysInMonth,
        testTariff
      );

      expect(result).toHaveLength(31 * 24);
    });

    it('should preserve monthly total', () => {
      const monthlyKwh = 10000;
      const bucketShares = { night: 0.3, day: 0.5, other: 0.2 };
      const daysInMonth = 31;

      const result = distributeMonthlyConsumptionToHourly(
        monthlyKwh,
        bucketShares,
        daysInMonth,
        testTariff
      );

      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(monthlyKwh, 1);
    });

    it('should handle zero consumption', () => {
      const result = distributeMonthlyConsumptionToHourly(
        0,
        { night: 0.3, day: 0.7 },
        30,
        testTariff
      );

      expect(result).toHaveLength(30 * 24);
      expect(result.every(v => v === 0)).toBe(true);
    });
  });

  describe('generateHourlyConsumption', () => {
    const testTariff: Tariff = {
      id: 'test',
      supplier: 'Test',
      product: 'Test',
      type: 'time-of-use',
      standingCharge: 1.0,
      rates: [
        { period: 'night', hours: '23:00-08:00', rate: 0.15 },
        { period: 'day', hours: '09:00-17:00', rate: 0.30 },
        { period: 'other', rate: 0.25 }
      ],
      exportRate: 0.20
    };

    it('should generate 8760 hours for full year', () => {
      const profile: ConsumptionProfile = {
        months: Array.from({ length: 12 }, (_, i) => ({
          monthIndex: i,
          totalKwh: 10000,
          bucketShares: { night: 0.3, day: 0.5, other: 0.2 }
        }))
      };

      const result = generateHourlyConsumption(profile, testTariff);
      expect(result).toHaveLength(8760);

      const leap = generateHourlyConsumption(profile, testTariff, 8784);
      expect(leap).toHaveLength(8784);
    });

    it('should preserve annual total', () => {
      const monthlyKwh = 10000;
      const annualKwh = monthlyKwh * 12;

      const profile: ConsumptionProfile = {
        months: Array.from({ length: 12 }, (_, i) => ({
          monthIndex: i,
          totalKwh: monthlyKwh,
          bucketShares: { night: 0.3, day: 0.5, other: 0.2 }
        }))
      };

      const result = generateHourlyConsumption(profile, testTariff);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(annualKwh, 1);
    });

    it('should handle varying monthly consumption', () => {
      const profile: ConsumptionProfile = {
        months: [
          { monthIndex: 0, totalKwh: 15000, bucketShares: { night: 0.4, day: 0.4, other: 0.2 } },
          { monthIndex: 1, totalKwh: 14000, bucketShares: { night: 0.4, day: 0.4, other: 0.2 } },
          { monthIndex: 2, totalKwh: 12000, bucketShares: { night: 0.35, day: 0.45, other: 0.2 } },
          { monthIndex: 3, totalKwh: 10000, bucketShares: { night: 0.3, day: 0.5, other: 0.2 } },
          { monthIndex: 4, totalKwh: 8000, bucketShares: { night: 0.3, day: 0.5, other: 0.2 } },
          { monthIndex: 5, totalKwh: 7000, bucketShares: { night: 0.25, day: 0.55, other: 0.2 } },
          { monthIndex: 6, totalKwh: 7000, bucketShares: { night: 0.25, day: 0.55, other: 0.2 } },
          { monthIndex: 7, totalKwh: 8000, bucketShares: { night: 0.3, day: 0.5, other: 0.2 } },
          { monthIndex: 8, totalKwh: 9000, bucketShares: { night: 0.3, day: 0.5, other: 0.2 } },
          { monthIndex: 9, totalKwh: 11000, bucketShares: { night: 0.35, day: 0.45, other: 0.2 } },
          { monthIndex: 10, totalKwh: 13000, bucketShares: { night: 0.35, day: 0.45, other: 0.2 } },
          { monthIndex: 11, totalKwh: 14000, bucketShares: { night: 0.4, day: 0.4, other: 0.2 } }
        ]
      };

      const result = generateHourlyConsumption(profile, testTariff);
      expect(result).toHaveLength(8760);

      const expectedAnnual = profile.months.reduce((sum, m) => sum + m.totalKwh, 0);
      const actualAnnual = result.reduce((a, b) => a + b, 0);
      expect(actualAnnual).toBeCloseTo(expectedAnnual, 1);
    });

    it('should throw when timeStamps length does not match totalHoursInYear', () => {
      const profile: ConsumptionProfile = {
        months: Array.from({ length: 12 }, (_, i) => ({
          monthIndex: i,
          totalKwh: 10000,
          bucketShares: { night: 0.3, day: 0.5, other: 0.2 }
        }))
      };

      const wrongLengthTimeStamps = Array.from({ length: 100 }, (_, i) => ({
        monthIndex: 0,
        day: 1,
        hour: i % 24
      }));

      expect(() =>
        generateHourlyConsumption(profile, testTariff, 8760, wrongLengthTimeStamps)
      ).toThrow('timeStamps length must match totalHoursInYear');
    });

    it('should throw when month data produces wrong number of slots', () => {
      const profile: ConsumptionProfile = {
        months: Array.from({ length: 12 }, (_, i) => ({
          monthIndex: i,
          totalKwh: 10000,
          bucketShares: { night: 0.3, day: 0.5, other: 0.2 }
        }))
      };

      // totalHoursInYear=5000 won't match the 8760 slots produced by 12 months of standard days
      expect(() =>
        generateHourlyConsumption(profile, testTariff, 5000)
      ).toThrow(/produced .* slots, expected 5000/);
    });
  });

  describe('aggregateHourlyToMonthly', () => {
    it('should aggregate back to 12 months', () => {
      const hourly = Array(8760).fill(1);
      const monthly = aggregateHourlyToMonthly(hourly);
      expect(monthly).toHaveLength(12);

      const hourlyLeap = Array(8784).fill(1);
      const monthlyLeap = aggregateHourlyToMonthly(hourlyLeap);
      expect(monthlyLeap).toHaveLength(12);
    });

    it('should preserve total when aggregating', () => {
      const hourly = Array(8760).fill(10);
      const hourlyTotal = hourly.reduce((a, b) => a + b, 0);

      const monthly = aggregateHourlyToMonthly(hourly);
      const monthlyTotal = monthly.reduce((a, b) => a + b, 0);

      expect(monthlyTotal).toBeCloseTo(hourlyTotal, 1);
    });

    it('should match original monthly values after round-trip', () => {
      const testTariff: Tariff = {
        id: 'test',
        supplier: 'Test',
        product: 'Test',
        type: '24-hour',
        standingCharge: 1.0,
        rates: [{ period: 'all-day', rate: 0.25 }],
        exportRate: 0.20
      };

      const originalMonthly = [10000, 9000, 8000, 7000, 6000, 5500, 5500, 6000, 7000, 8000, 9000, 10000];
      const profile: ConsumptionProfile = {
        months: originalMonthly.map((kwh, i) => ({
          monthIndex: i,
          totalKwh: kwh,
          bucketShares: { 'all-day': 1.0 }
        }))
      };

      const hourly = generateHourlyConsumption(profile, testTariff);
      const aggregated = aggregateHourlyToMonthly(hourly);

      aggregated.forEach((monthlyKwh, i) => {
        expect(monthlyKwh).toBeCloseTo(originalMonthly[i], 1);
      });
    });

    it('should handle half-hourly (17520-length) data with slotsPerDay=48 branch (lines 286-295)', () => {
      const halfHourly = Array(17520).fill(0.5);
      const monthly = aggregateHourlyToMonthly(halfHourly);
      expect(monthly).toHaveLength(12);

      const monthlyTotal = monthly.reduce((a, b) => a + b, 0);
      const halfHourlyTotal = halfHourly.reduce((a: number, b: number) => a + b, 0);
      expect(monthlyTotal).toBeCloseTo(halfHourlyTotal, 1);

      // January: 31 days × 48 slots = 1488 slots × 0.5 = 744
      expect(monthly[0]).toBeCloseTo(31 * 48 * 0.5, 1);
      // February (non-leap): 28 days × 48 slots = 1344 slots × 0.5 = 672
      expect(monthly[1]).toBeCloseTo(28 * 48 * 0.5, 1);
    });

    it('handles array with 0 values (covers || 0 right branch at line 295)', () => {
      // Array of zeros triggers the || 0 fallback branch in aggregateHourlyToMonthly
      const zeros = new Array(8760).fill(0);
      const monthly = aggregateHourlyToMonthly(zeros);
      expect(monthly).toHaveLength(12);
      monthly.forEach(v => expect(v).toBe(0));
    });

    it('should handle half-hourly leap year (17568-length) - covers getDaysPerMonthFromHours leap path', () => {
      // Leap year: 366 * 48 = 17568
      const halfHourlyLeap = Array(17568).fill(1.0);
      const monthly = aggregateHourlyToMonthly(halfHourlyLeap);
      expect(monthly).toHaveLength(12);

      const monthlyTotal = monthly.reduce((a, b) => a + b, 0);
      expect(monthlyTotal).toBeCloseTo(17568, 1);

      // February in leap year: 29 days × 48 slots = 1392 slots × 1.0 = 1392
      expect(monthly[1]).toBeCloseTo(29 * 48, 1);
      // January: 31 × 48 = 1488
      expect(monthly[0]).toBeCloseTo(31 * 48, 1);
    });
  });

  describe('generateHourlyConsumption half-hourly mode', () => {
    it('generates 17520 slots for a non-leap year (slotsPerDay=48)', () => {
      const flatTariff: Tariff = {
        id: 'flat',
        supplier: 'Test',
        product: 'Flat',
        type: '24-hour',
        standingCharge: 0,
        rates: [{ period: 'all-day', rate: 0.25 }],
        exportRate: 0.10
      };

      const profile: ConsumptionProfile = {
        months: Array.from({ length: 12 }, (_, i) => ({
          monthIndex: i,
          totalKwh: 1000,
          bucketShares: { 'all-day': 1.0 }
        }))
      };

      // 17520 = 365 * 48 (non-leap year half-hourly)
      const result = generateHourlyConsumption(profile, flatTariff, 17520);
      expect(result).toHaveLength(17520);

      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1000 * 12, 1);
    });

    it('skips months where profile.months[i] is undefined (if (!month) continue branch)', () => {
      const flatTariff: Tariff = {
        id: 'flat',
        supplier: 'Test',
        product: 'Flat',
        type: '24-hour',
        standingCharge: 0,
        rates: [{ period: 'all-day', rate: 0.25 }],
        exportRate: 0.10
      };

      // Sparse months array: only months 0-10, missing month 11
      const sparseMonths: ConsumptionProfile = {
        months: Array.from({ length: 12 }, (_, i) => i < 11
          ? { monthIndex: i, totalKwh: 1000, bucketShares: { 'all-day': 1.0 } }
          : (undefined as unknown as { monthIndex: number; totalKwh: number; bucketShares: Record<string, number> })
        )
      };

      // This will throw because the total slots won't match 8760 (month 11 is skipped)
      // We just test that it correctly skips month 11 (no throw for undefined month itself)
      // But it will throw with slot mismatch. Let's just test that month[11]=undefined is handled.
      // Use a try-catch to verify the continue branch fires without crashing on undefined access
      expect(() => generateHourlyConsumption(sparseMonths, flatTariff, 8760)).toThrow(/produced.*slots.*expected/);
    });
  });

  describe('generateHourlyConsumption with undefined bucketShares', () => {
    it('should fall back to empty bucketShares when month.bucketShares is falsy (lines 252-253)', () => {
      const testTariff: Tariff = {
        id: 'flat',
        supplier: 'Test',
        product: 'Flat',
        type: '24-hour',
        standingCharge: 1.0,
        rates: [{ period: 'all-day', rate: 0.25 }],
        exportRate: 0.20
      };

      // Create a profile where bucketShares is undefined on every month
      const profile = {
        months: Array.from({ length: 12 }, (_, i) => ({
          monthIndex: i,
          totalKwh: 1000,
          bucketShares: undefined as unknown as Record<string, number>
        }))
      } as ConsumptionProfile;

      const result = generateHourlyConsumption(profile, testTariff);
      expect(result).toHaveLength(8760);
      // All values should be 0 since empty bucketShares means no energy allocated to any bucket
      expect(result.every(v => v === 0)).toBe(true);
    });
  });
});
