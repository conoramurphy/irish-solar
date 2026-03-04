import { describe, expect, it } from 'vitest';
import {
  normalizeSolarTimeseriesYear,
  expectedHoursInYear,
  type ParsedSolarData,
  type SolarTimestep,
  toHourKey,
  type HourStamp
} from '../../src/utils/solarTimeseriesParser';

function makeTs(stamp: HourStamp, irradianceWm2: number, sourceIndex: number): SolarTimestep {
  return {
    stamp,
    hourKey: toHourKey(stamp),
    irradianceWm2,
    sourceIndex,
    timestamp: new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, 0, 0))
  };
}

function makeParsed(year: number, timesteps: SolarTimestep[]): ParsedSolarData {
  return {
    location: 'Test',
    latitude: 0,
    longitude: 0,
    elevation: 0,
    year,
    slotsPerDay: 24,
    timesteps,
    totalIrradiance: timesteps.reduce((s, t) => s + t.irradianceWm2, 0)
  };
}

describe('normalizeSolarTimeseriesYear', () => {
  it('returns exact 8760 hours for non-leap year and fills missing with 0', () => {
    const year = 2021; // non-leap
    const a = makeTs({ year, monthIndex: 0, day: 1, hour: 0, minute: 0 }, 100, 0);
    const b = makeTs({ year, monthIndex: 0, day: 1, hour: 1, minute: 0 }, 200, 1);

    const parsed = makeParsed(year, [a, b]);
    const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, year);

    expect(normalized.timesteps).toHaveLength(expectedHoursInYear(year));
    expect(corrections.slotsMissingFilled).toBe(expectedHoursInYear(year) - 2);

    // First two canonical hours preserved
    expect(normalized.timesteps[0].irradianceWm2).toBe(100);
    expect(normalized.timesteps[1].irradianceWm2).toBe(200);

    // A later hour should be filled with 0
    expect(normalized.timesteps[10].irradianceWm2).toBe(0);
  });

  it('drops duplicates deterministically (keep max irradiance)', () => {
    const year = 2021;
    const stamp = { year, monthIndex: 0, day: 1, hour: 0, minute: 0 };
    const low = makeTs(stamp, 10, 0);
    const high = makeTs(stamp, 99, 1);

    const parsed = makeParsed(year, [low, high]);
    const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, year, 'keep-max-irradiance');

    expect(corrections.duplicatesDropped).toBe(1);
    expect(normalized.timesteps[0].irradianceWm2).toBe(99);
  });

  it('drops outside-year rows and still normalizes selected year', () => {
    const y = 2021;
    const other = 2020;

    const ts1 = makeTs({ year: y, monthIndex: 0, day: 1, hour: 0, minute: 0 }, 10, 0);
    const ts2 = makeTs({ year: other, monthIndex: 0, day: 1, hour: 0, minute: 0 }, 999, 1);

    const parsed = makeParsed(other, [ts1, ts2]);
    const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, y);

    expect(normalized.year).toBe(y);
    expect(normalized.timesteps).toHaveLength(expectedHoursInYear(y));
    expect(corrections.rowsOutsideYearDropped).toBe(1);
    expect(normalized.timesteps[0].irradianceWm2).toBe(10);
  });

  describe('DST / timezone edge cases', () => {
    it('handles data with 8759 hours (DST spring forward)', () => {
      const year = 2021;
      const timesteps: SolarTimestep[] = [];
      
      // Simulate missing one hour due to DST spring forward
      let hourCount = 0;
      for (let m = 0; m < 12; m++) {
        const daysInMonth = m === 1 ? 28 : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
        for (let d = 1; d <= (daysInMonth || 30); d++) {
          const hoursInDay = (m === 2 && d === 14) ? 23 : 24; // Skip hour 2 on March 14
          for (let h = 0; h < hoursInDay; h++) {
            const actualHour = (m === 2 && d === 14 && h >= 2) ? h + 1 : h;
            timesteps.push(makeTs({ year, monthIndex: m, day: d, hour: actualHour, minute: 0 }, 100, hourCount++));
          }
        }
      }

      const parsed = makeParsed(year, timesteps);
      const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, year);

      // Should fill the missing hour with 0
      expect(normalized.timesteps).toHaveLength(expectedHoursInYear(year));
      expect(corrections.slotsMissingFilled).toBe(1);
      expect(corrections.warnings.length).toBeGreaterThan(0);
    });

    it('handles data with 8761 hours (DST fall back)', () => {
      const year = 2021;
      const timesteps: SolarTimestep[] = [];
      
      // Simulate duplicate hour due to DST fall back
      let hourCount = 0;
      for (let m = 0; m < 12; m++) {
        const daysInMonth = m === 1 ? 28 : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
        for (let d = 1; d <= (daysInMonth || 30); d++) {
          const hoursInDay = (m === 10 && d === 7) ? 25 : 24; // Duplicate hour 2 on Nov 7
          for (let h = 0; h < hoursInDay; h++) {
            const actualHour = (m === 10 && d === 7 && h > 2 && h < 25) ? h - 1 : (h === 25 ? 3 : h);
            timesteps.push(makeTs({ year, monthIndex: m, day: d, hour: actualHour, minute: 0 }, 100 + h, hourCount++));
          }
        }
      }

      const parsed = makeParsed(year, timesteps);
      const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, year);

      // Should drop the duplicate hour
      expect(normalized.timesteps).toHaveLength(expectedHoursInYear(year));
      expect(corrections.duplicatesDropped).toBeGreaterThan(0);
      expect(corrections.warnings.length).toBeGreaterThan(0);
    });

    it('handles data with both missing and duplicate hours', () => {
      const year = 2021;
      const timesteps: SolarTimestep[] = [];
      
      // Add hours in order but skip some and duplicate others
      for (let h = 0; h < 8755; h++) {
        const d = Math.floor(h / 24) + 1;
        const hourOfDay = h % 24;
        timesteps.push(makeTs({ year, monthIndex: 0, day: Math.min(d, 31), hour: hourOfDay, minute: 0 }, 100, h));
      }
      
      // Add duplicates
      timesteps.push(makeTs({ year, monthIndex: 0, day: 5, hour: 10, minute: 0 }, 200, 8755));
      timesteps.push(makeTs({ year, monthIndex: 0, day: 5, hour: 10, minute: 0 }, 150, 8756));

      const parsed = makeParsed(year, timesteps);
      const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, year);

      expect(normalized.timesteps).toHaveLength(expectedHoursInYear(year));
      expect(corrections.slotsMissingFilled).toBeGreaterThan(0);
      expect(corrections.duplicatesDropped).toBeGreaterThan(0);
    });
  });
});
