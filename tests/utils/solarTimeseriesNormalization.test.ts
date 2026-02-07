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
    timesteps,
    totalIrradiance: timesteps.reduce((s, t) => s + t.irradianceWm2, 0)
  };
}

describe('normalizeSolarTimeseriesYear', () => {
  it('returns exact 8760 hours for non-leap year and fills missing with 0', () => {
    const year = 2021; // non-leap
    const a = makeTs({ year, monthIndex: 0, day: 1, hour: 0 }, 100, 0);
    const b = makeTs({ year, monthIndex: 0, day: 1, hour: 1 }, 200, 1);

    const parsed = makeParsed(year, [a, b]);
    const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, year);

    expect(normalized.timesteps).toHaveLength(expectedHoursInYear(year));
    expect(corrections.hoursMissingFilled).toBe(expectedHoursInYear(year) - 2);

    // First two canonical hours preserved
    expect(normalized.timesteps[0].irradianceWm2).toBe(100);
    expect(normalized.timesteps[1].irradianceWm2).toBe(200);

    // A later hour should be filled with 0
    expect(normalized.timesteps[10].irradianceWm2).toBe(0);
  });

  it('drops duplicates deterministically (keep max irradiance)', () => {
    const year = 2021;
    const stamp = { year, monthIndex: 0, day: 1, hour: 0 };
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

    const ts1 = makeTs({ year: y, monthIndex: 0, day: 1, hour: 0 }, 10, 0);
    const ts2 = makeTs({ year: other, monthIndex: 0, day: 1, hour: 0 }, 999, 1);

    const parsed = makeParsed(other, [ts1, ts2]);
    const { normalized, corrections } = normalizeSolarTimeseriesYear(parsed, y);

    expect(normalized.year).toBe(y);
    expect(normalized.timesteps).toHaveLength(expectedHoursInYear(y));
    expect(corrections.rowsOutsideYearDropped).toBe(1);
    expect(normalized.timesteps[0].irradianceWm2).toBe(10);
  });
});
