import { describe, expect, it } from 'vitest';
import {
  parseSolarTimeseriesCSV,
  parsePvgisTimeToStamp,
  listSolarTimeseriesYears,
  sliceSolarTimeseriesYear,
  aggregateToDaily,
  toHourKey,
  normalizeSolarTimeseriesYear,
  calculateTimeseriesWeights,
  buildCanonicalStampsForYear
} from '../../src/utils/solarTimeseriesParser';
import type { ParsedSolarData, SolarTimestep, HourStamp } from '../../src/utils/solarTimeseriesParser';

describe('parseSolarTimeseriesCSV - CSV format validation', () => {
  const validCSV = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101
Radiation database:\tPVGIS-SARAH3

Slope: 0 deg. 
Azimuth: 100 deg. 
time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,0.0,0.0,5.63,1.45,0.0
20200101:0111,0.0,0.0,5.85,1.52,0.0
20200101:0211,10.5,10.0,6.00,1.60,0.0
`;

  it('should parse a valid PVGIS CSV', () => {
    const result = parseSolarTimeseriesCSV(validCSV, 'TestLocation');
    
    expect(result.location).toBe('TestLocation');
    expect(result.latitude).toBeCloseTo(53.835, 3);
    expect(result.longitude).toBeCloseTo(-7.072, 3);
    expect(result.elevation).toBe(101);
    expect(result.timesteps).toHaveLength(3);
    expect(result.year).toBe(2020);
  });

  it('should throw error for completely empty CSV', () => {
    expect(() => parseSolarTimeseriesCSV('', 'Test')).toThrow();
  });

  it('should throw error when data header is missing', () => {
    const noHeader = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

20200101:0011,0.0,0.0,5.63,1.45,0.0
`;
    
    expect(() => parseSolarTimeseriesCSV(noHeader, 'Test')).toThrow('Could not find data header');
  });

  it('should handle CSV with only headers (no data rows)', () => {
    const onlyHeaders = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101
Radiation database:\tPVGIS-SARAH3

time,G(i),H_sun,T2m,WS10m,Int
`;
    
    const result = parseSolarTimeseriesCSV(onlyHeaders, 'Test');
    expect(result.timesteps).toHaveLength(0);
    expect(result.totalIrradiance).toBe(0);
  });

  it('should skip rows with malformed time strings', () => {
    const malformedTime = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
INVALID_TIME,20.0,0.0,5.63,1.45,0.0
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(malformedTime, 'Test');
    expect(result.timesteps).toHaveLength(2); // Skip the invalid row
    expect(result.timesteps[0].irradianceWm2).toBe(10.0);
    expect(result.timesteps[1].irradianceWm2).toBe(15.0);
  });

  it('should skip rows with insufficient columns', () => {
    const insufficientColumns = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(insufficientColumns, 'Test');
    expect(result.timesteps).toHaveLength(2); // Skip row with insufficient columns
  });

  it('should clamp negative irradiance values to zero', () => {
    const negativeIrradiance = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111,-5.0,0.0,5.63,1.45,0.0
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(negativeIrradiance, 'Test');
    expect(result.timesteps[0].irradianceWm2).toBe(10.0);
    expect(result.timesteps[1].irradianceWm2).toBe(0); // Clamped to 0
    expect(result.timesteps[2].irradianceWm2).toBe(15.0);
  });

  it('should handle non-numeric irradiance values as zero', () => {
    const nonNumeric = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111,NOT_A_NUMBER,0.0,5.63,1.45,0.0
20200101:0211,15.0,0.0,5.63,1.45,0.0
`;
    
    const result = parseSolarTimeseriesCSV(nonNumeric, 'Test');
    expect(result.timesteps[1].irradianceWm2).toBe(0); // Non-numeric treated as 0
  });

  it('should handle missing metadata gracefully', () => {
    const noMetadata = `time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0
20200101:0111,20.0,0.0,5.85,1.52,0.0
`;
    
    const result = parseSolarTimeseriesCSV(noMetadata, 'Test');
    expect(result.latitude).toBe(0); // Default to 0
    expect(result.longitude).toBe(0);
    expect(result.elevation).toBe(0);
    expect(result.timesteps).toHaveLength(2);
  });

  it('should handle Windows line endings (CRLF)', () => {
    const crlfCSV = "Latitude (decimal degrees):\t53.835\r\nLongitude (decimal degrees):\t-7.072\r\ntime,G(i),H_sun\r\n20200101:0011,10.0,0.0\r\n20200101:0111,20.0,0.0\r\n";
    
    const result = parseSolarTimeseriesCSV(crlfCSV, 'Test');
    expect(result.timesteps).toHaveLength(2);
  });

  it('should handle extra whitespace in data rows', () => {
    const extraWhitespace = `Latitude (decimal degrees):\t53.835

time,G(i),H_sun,T2m,WS10m,Int
  20200101:0011  ,  10.0  ,0.0,5.63,1.45,0.0  
20200101:0111,20.0,0.0,5.85,1.52,0.0
`;
    
    const result = parseSolarTimeseriesCSV(extraWhitespace, 'Test');
    // Parser should handle trimming or at least not crash
    expect(result.timesteps.length).toBeGreaterThan(0);
  });

  it('should skip blank/empty lines in data section', () => {
    const blankLines = `Latitude (decimal degrees):\t53.835

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,10.0,0.0,5.63,1.45,0.0

20200101:0111,20.0,0.0,5.85,1.52,0.0

`;
    
    const result = parseSolarTimeseriesCSV(blankLines, 'Test');
    expect(result.timesteps).toHaveLength(2); // Blank lines are filtered
  });

  it('should correctly set sourceIndex on parsed timesteps', () => {
    const csv = `time,G(i),H_sun
20200101:0011,10.0,0.0
20200101:0111,20.0,0.0
20200101:0211,30.0,0.0
`;
    const result = parseSolarTimeseriesCSV(csv, 'Test');
    expect(result.timesteps[0].sourceIndex).toBe(0);
    expect(result.timesteps[1].sourceIndex).toBe(1);
    expect(result.timesteps[2].sourceIndex).toBe(2);
  });

  it('should handle dates with invalid month (> 12)', () => {
    const invalidMonth = `time,G(i),H_sun
20201301:0011,10.0,0.0
20200101:0111,20.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(invalidMonth, 'Test');
    expect(result.timesteps).toHaveLength(1); // Invalid month row should be skipped
    expect(result.timesteps[0].stamp.monthIndex).toBe(0);
  });

  it('should handle dates with invalid day (> 31)', () => {
    const invalidDay = `time,G(i),H_sun
20200132:0011,10.0,0.0
20200101:0111,20.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(invalidDay, 'Test');
    expect(result.timesteps).toHaveLength(1); // Invalid day row should be skipped
  });

  it('should handle invalid hour (> 23)', () => {
    const invalidHour = `time,G(i),H_sun
20200101:2511,10.0,0.0
20200101:0111,20.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(invalidHour, 'Test');
    expect(result.timesteps).toHaveLength(1); // Invalid hour row should be skipped
  });

  it('should parse multi-year CSV correctly', () => {
    const multiYear = `time,G(i),H_sun
20200101:0011,10.0,0.0
20200101:0111,20.0,0.0
20210101:0011,15.0,0.0
20210101:0111,25.0,0.0
`;
    
    const result = parseSolarTimeseriesCSV(multiYear, 'Test');
    expect(result.timesteps).toHaveLength(4);
    expect(result.year).toBe(2020); // First year encountered
    
    const years = new Set(result.timesteps.map(ts => ts.stamp.year));
    expect(years.size).toBe(2); // Both years present
    expect(years.has(2020)).toBe(true);
    expect(years.has(2021)).toBe(true);
  });
});

// --- Helper to build a minimal ParsedSolarData ---
function makeParsedData(timesteps: SolarTimestep[]): ParsedSolarData {
  const totalIrradiance = timesteps.reduce((s, t) => s + t.irradianceWm2, 0);
  return {
    location: 'Test',
    latitude: 53,
    longitude: -7,
    elevation: 100,
    year: timesteps[0]?.stamp.year ?? 2020,
    timesteps,
    totalIrradiance
  };
}

function makeTimestep(year: number, monthIndex: number, day: number, hour: number, irradiance: number): SolarTimestep {
  const stamp = { year, monthIndex, day, hour };
  return {
    timestamp: new Date(Date.UTC(year, monthIndex, day, hour, 0, 0)),
    stamp,
    hourKey: toHourKey(stamp),
    irradianceWm2: irradiance,
    sourceIndex: 0
  };
}

// --- listSolarTimeseriesYears ---
describe('listSolarTimeseriesYears', () => {
  it('returns sorted unique years from timesteps', () => {
    const ts = [
      makeTimestep(2021, 0, 1, 0, 10),
      makeTimestep(2020, 5, 15, 12, 100),
      makeTimestep(2021, 11, 31, 23, 5),
    ];
    const years = listSolarTimeseriesYears(makeParsedData(ts));
    expect(years).toEqual([2020, 2021]);
  });

  it('returns single year when all timesteps are same year', () => {
    const ts = [
      makeTimestep(2020, 0, 1, 0, 10),
      makeTimestep(2020, 6, 1, 12, 100),
    ];
    expect(listSolarTimeseriesYears(makeParsedData(ts))).toEqual([2020]);
  });

  it('returns empty array for no timesteps', () => {
    expect(listSolarTimeseriesYears(makeParsedData([]))).toEqual([]);
  });
});

// --- sliceSolarTimeseriesYear ---
describe('sliceSolarTimeseriesYear', () => {
  it('filters to only the selected year', () => {
    const ts = [
      makeTimestep(2020, 0, 1, 0, 10),
      makeTimestep(2020, 6, 1, 12, 100),
      makeTimestep(2021, 0, 1, 0, 50),
    ];
    const sliced = sliceSolarTimeseriesYear(makeParsedData(ts), 2020);
    expect(sliced.timesteps).toHaveLength(2);
    expect(sliced.year).toBe(2020);
    expect(sliced.totalIrradiance).toBe(110);
  });

  it('returns empty timesteps for a year with no data', () => {
    const ts = [makeTimestep(2020, 0, 1, 0, 10)];
    const sliced = sliceSolarTimeseriesYear(makeParsedData(ts), 2025);
    expect(sliced.timesteps).toHaveLength(0);
    expect(sliced.totalIrradiance).toBe(0);
    expect(sliced.year).toBe(2025);
  });

  it('preserves location metadata', () => {
    const ts = [makeTimestep(2020, 0, 1, 0, 10)];
    const data = makeParsedData(ts);
    data.location = 'Cavan';
    const sliced = sliceSolarTimeseriesYear(data, 2020);
    expect(sliced.location).toBe('Cavan');
    expect(sliced.latitude).toBe(53);
  });
});

// --- aggregateToDaily ---
describe('aggregateToDaily', () => {
  it('aggregates 24 hours into a single day', () => {
    const ts: SolarTimestep[] = [];
    for (let h = 0; h < 24; h++) {
      ts.push(makeTimestep(2020, 0, 1, h, h < 6 || h > 18 ? 0 : 100));
    }
    const hourlyProd = ts.map((_, i) => (i >= 6 && i <= 18 ? 1.0 : 0));
    const daily = aggregateToDaily(hourlyProd, makeParsedData(ts));

    expect(daily).toHaveLength(1);
    expect(daily[0].date).toBe('2020-01-01');
    expect(daily[0].productionKwh).toBeCloseTo(13); // 13 hours * 1.0
  });

  it('produces sorted output across multiple days', () => {
    const ts = [
      makeTimestep(2020, 0, 2, 10, 100),
      makeTimestep(2020, 0, 1, 10, 100),
      makeTimestep(2020, 0, 3, 10, 100),
    ];
    const hourlyProd = [5, 3, 7];
    const daily = aggregateToDaily(hourlyProd, makeParsedData(ts));

    expect(daily).toHaveLength(3);
    expect(daily[0].date).toBe('2020-01-01');
    expect(daily[0].productionKwh).toBe(3);
    expect(daily[1].date).toBe('2020-01-02');
    expect(daily[1].productionKwh).toBe(5);
    expect(daily[2].date).toBe('2020-01-03');
    expect(daily[2].productionKwh).toBe(7);
  });

  it('returns empty array for empty data', () => {
    expect(aggregateToDaily([], makeParsedData([]))).toEqual([]);
  });
});

// --- normalizeSolarTimeseriesYear ---
describe('normalizeSolarTimeseriesYear', () => {
  function makeFullTimestep(stamp: HourStamp, irradiance: number, sourceIndex = 0): SolarTimestep {
    return {
      timestamp: new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, stamp.minute, 0)),
      stamp,
      hourKey: toHourKey(stamp),
      irradianceWm2: irradiance,
      sourceIndex
    };
  }

  it('should skip rows whose hourKey is not in the canonical set (line 257)', () => {
    const year = 2020;
    const canonicalStamps = buildCanonicalStampsForYear(year, 24);

    // Build a full year of valid data
    const validTimesteps = canonicalStamps.map((s, i) => makeFullTimestep(s, i % 100));

    // Add extra rows with a bogus hourKey not in canonical set (minute=15 never appears)
    const bogusStamp: HourStamp = { year: 2020, monthIndex: 0, day: 1, hour: 0, minute: 15 };
    const bogusTimestep = makeFullTimestep(bogusStamp, 999);
    const allTimesteps = [...validTimesteps, bogusTimestep];

    const data: ParsedSolarData = {
      location: 'Test',
      latitude: 53,
      longitude: -7,
      elevation: 100,
      year,
      slotsPerDay: 24,
      timesteps: allTimesteps,
      totalIrradiance: allTimesteps.reduce((s, t) => s + t.irradianceWm2, 0)
    };

    const { normalized, corrections } = normalizeSolarTimeseriesYear(data, year);
    // The bogus row should have been skipped — normalized should still have exactly 8784 slots (2020 is leap)
    expect(normalized.timesteps).toHaveLength(corrections.expectedSlots);
    // The bogus irradiance (999) should not appear in any timestep
    expect(normalized.timesteps.every(ts => ts.irradianceWm2 !== 999)).toBe(true);
  });

  it('should keep first duplicate and skip subsequent with keep-first policy (line 268)', () => {
    const year = 2020;
    const canonicalStamps = buildCanonicalStampsForYear(year, 24);

    // Build full year
    const validTimesteps = canonicalStamps.map((s, i) => makeFullTimestep(s, 10, i));

    // Add a duplicate for the first slot with higher irradiance
    const dupStamp = canonicalStamps[0]!;
    const dupTimestep = makeFullTimestep(dupStamp, 999, 99999);

    const allTimesteps = [...validTimesteps, dupTimestep];
    const data: ParsedSolarData = {
      location: 'Test',
      latitude: 53,
      longitude: -7,
      elevation: 100,
      year,
      slotsPerDay: 24,
      timesteps: allTimesteps,
      totalIrradiance: allTimesteps.reduce((s, t) => s + t.irradianceWm2, 0)
    };

    const { normalized, corrections } = normalizeSolarTimeseriesYear(data, year, 'keep-first');
    expect(corrections.duplicatesDropped).toBe(1);
    // Should have kept the first (irradiance=10), not the duplicate (irradiance=999)
    expect(normalized.timesteps[0].irradianceWm2).toBe(10);
  });

  it('falls back to slotsPerDay=24 when data.slotsPerDay is undefined (line 243 ?? 24)', () => {
    const year = 2023;
    const canonicalStamps = buildCanonicalStampsForYear(year, 24);
    const validTimesteps = canonicalStamps.map((s, i) => makeFullTimestep(s, i % 100, i));
    const data = {
      location: 'Test', latitude: 53, longitude: -7, elevation: 100,
      year,
      slotsPerDay: undefined as unknown as 24 | 48, // triggers ?? 24
      timesteps: validTimesteps,
      totalIrradiance: 100
    };
    const { normalized } = normalizeSolarTimeseriesYear(data, year);
    expect(normalized.slotsPerDay).toBe(24);
    expect(normalized.timesteps).toHaveLength(8760);
  });

  it('uses ?? 0 fallback when irradianceWm2 is undefined in duplicate comparison (line 271)', () => {
    const year = 2023;
    const canonicalStamps = buildCanonicalStampsForYear(year, 24);
    const validTimesteps = canonicalStamps.map((s, i) => makeFullTimestep(s, 10, i));
    // Duplicate with irradianceWm2 undefined — triggers ?? 0 in the comparison
    const dupStamp = canonicalStamps[0]!;
    const dupTimestep: SolarTimestep = {
      timestamp: new Date(Date.UTC(dupStamp.year, dupStamp.monthIndex, dupStamp.day, dupStamp.hour, dupStamp.minute, 0)),
      stamp: dupStamp,
      hourKey: toHourKey(dupStamp),
      irradianceWm2: undefined as unknown as number,
      sourceIndex: 99999
    };
    const data: ParsedSolarData = {
      location: 'Test', latitude: 53, longitude: -7, elevation: 100,
      year, slotsPerDay: 24,
      timesteps: [...validTimesteps, dupTimestep],
      totalIrradiance: 100
    };
    // keep-max-irradiance: undefined ?? 0 = 0, which is not > 10, so original is kept
    const { normalized, corrections } = normalizeSolarTimeseriesYear(data, year, 'keep-max-irradiance');
    expect(corrections.duplicatesDropped).toBe(1);
    expect(normalized.timesteps[0].irradianceWm2).toBe(10);
  });

  it('uses ?? 0 fallback when irradianceWm2 is undefined in totalIrradiance reduce (line 306)', () => {
    const year = 2023;
    const canonicalStamps = buildCanonicalStampsForYear(year, 24);
    const validTimesteps = canonicalStamps.map((s, i) => ({
      timestamp: new Date(Date.UTC(s.year, s.monthIndex, s.day, s.hour, s.minute, 0)),
      stamp: s,
      hourKey: toHourKey(s),
      irradianceWm2: (i === 0 ? undefined : 5) as unknown as number, // first slot undefined
      sourceIndex: i
    } satisfies SolarTimestep));
    const data: ParsedSolarData = {
      location: 'Test', latitude: 53, longitude: -7, elevation: 100,
      year, slotsPerDay: 24, timesteps: validTimesteps, totalIrradiance: 0
    };
    const { normalized } = normalizeSolarTimeseriesYear(data, year);
    // totalIrradiance should be computed without NaN (undefined ?? 0 = 0)
    expect(Number.isFinite(normalized.totalIrradiance)).toBe(true);
  });
});

// --- parsePvgisTimeToStamp ---
describe('parsePvgisTimeToStamp', () => {
  it('returns null for empty/non-string input', () => {
    expect(parsePvgisTimeToStamp('', false)).toBeNull();
    expect(parsePvgisTimeToStamp(null as unknown as string, false)).toBeNull();
  });

  it('returns null for string shorter than 13 chars', () => {
    expect(parsePvgisTimeToStamp('20200101:00', false)).toBeNull();
  });

  it('returns null when monthIndex < 0 (month "00")', () => {
    // month "00" → monthIndex = 0 - 1 = -1 → fails < 0 check
    expect(parsePvgisTimeToStamp('20200001:0011', false)).toBeNull();
  });

  it('returns null when monthIndex > 11 (month "13")', () => {
    expect(parsePvgisTimeToStamp('20201301:0011', false)).toBeNull();
  });

  it('returns null when day < 1 (day "00")', () => {
    expect(parsePvgisTimeToStamp('20200100:0011', false)).toBeNull();
  });

  it('returns null when hour > 23 (hour "25")', () => {
    expect(parsePvgisTimeToStamp('20200101:2511', false)).toBeNull();
  });

  it('returns null when rawMinute > 59 (minute "61")', () => {
    expect(parsePvgisTimeToStamp('20200101:0061', false)).toBeNull();
  });

  it('snaps minute to 30 for halfHourly when rawMinute >= 15', () => {
    const stamp = parsePvgisTimeToStamp('20200101:0030', true);
    expect(stamp).not.toBeNull();
    expect(stamp!.minute).toBe(30);
  });

  it('snaps minute to 0 for halfHourly when rawMinute < 15', () => {
    const stamp = parsePvgisTimeToStamp('20200101:0000', true);
    expect(stamp).not.toBeNull();
    expect(stamp!.minute).toBe(0);
  });

  it('always snaps minute to 0 for non-halfHourly', () => {
    const stamp = parsePvgisTimeToStamp('20200101:0011', false);
    expect(stamp).not.toBeNull();
    expect(stamp!.minute).toBe(0);
  });
});

// --- calculateTimeseriesWeights ---
describe('calculateTimeseriesWeights', () => {
  it('should return equal weights when totalIrradiance is 0 (line 348)', () => {
    const ts: SolarTimestep[] = [];
    for (let h = 0; h < 24; h++) {
      const stamp: HourStamp = { year: 2020, monthIndex: 0, day: 1, hour: h, minute: 0 };
      ts.push({
        timestamp: new Date(Date.UTC(2020, 0, 1, h, 0, 0)),
        stamp,
        hourKey: toHourKey(stamp),
        irradianceWm2: 0,
        sourceIndex: h
      });
    }
    const data: ParsedSolarData = {
      location: 'Test',
      latitude: 53,
      longitude: -7,
      elevation: 100,
      year: 2020,
      slotsPerDay: 24,
      timesteps: ts,
      totalIrradiance: 0
    };

    const weights = calculateTimeseriesWeights(data);
    expect(weights).toHaveLength(24);
    // Each weight should be 1/24
    for (const w of weights) {
      expect(w).toBeCloseTo(1 / 24, 10);
    }
    // Sum should be 1
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});
