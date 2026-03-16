import { describe, expect, it } from 'vitest';
import {
  parsePriceTimeseriesCSV,
  normalizePriceTimeseries,
  type ParsedPriceData,
} from '../../src/utils/priceTimeseriesParser';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Build a CSV header line matching the expected format. */
const HEADER = 'auction,price_eur,price_gbp,DeliveryDate,DeliveryInterval';

/**
 * Generate `days` days of CSV data rows starting from the given date.
 * Each day has `hoursPerDay` rows (default 24).
 * Returns an array of CSV lines (no header).
 */
function makeDayRows(
  startDate: string, // e.g. '2021/01/01'
  days: number,
  hoursPerDay = 24,
  basePriceEur = 50,
): string[] {
  const lines: string[] = [];
  const [yyyy, mm, dd] = startDate.split('/').map(Number);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));

  for (let day = 0; day < days; day++) {
    const dateStr = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
    for (let h = 0; h < hoursPerDay; h++) {
      const price = basePriceEur + day * 10 + h;
      lines.push(`DAM,${price},${(price * 0.9).toFixed(3)},${dateStr},1`);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return lines;
}

/** Build a full-year (365 days × 24 hours) ParsedPriceData for the given year. */
function makeFullYearParsedData(year: number, basePriceEur = 40): ParsedPriceData {
  const rows = makeDayRows(`${year}/01/01`, isLeapYear(year) ? 366 : 365, 24, basePriceEur);
  const csv = [HEADER, ...rows].join('\n');
  return parsePriceTimeseriesCSV(csv);
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/* ------------------------------------------------------------------ */
/*  parsePriceTimeseriesCSV                                           */
/* ------------------------------------------------------------------ */

describe('parsePriceTimeseriesCSV', () => {
  it('parses a normal CSV with multiple days (2 days, 48 rows total)', () => {
    const rows = makeDayRows('2021/01/01', 2);
    const csv = [HEADER, ...rows].join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    expect(result.year).toBe(2021);
    expect(result.timesteps).toHaveLength(48);

    // First timestep is hour 0 of Jan 1
    const first = result.timesteps[0];
    expect(first.stamp.year).toBe(2021);
    expect(first.stamp.monthIndex).toBe(0);
    expect(first.stamp.day).toBe(1);
    expect(first.stamp.hour).toBe(0);
    expect(first.priceEur).toBe(50); // basePriceEur + 0*10 + 0

    // Last timestep is hour 23 of Jan 2
    const last = result.timesteps[47];
    expect(last.stamp.day).toBe(2);
    expect(last.stamp.hour).toBe(23);
    expect(last.priceEur).toBe(83); // 50 + 1*10 + 23

    // sourceIndex is sequential across the entire file
    expect(first.sourceIndex).toBe(0);
    expect(last.sourceIndex).toBe(47);
  });

  it('finds header when preceded by preamble lines', () => {
    const preamble = [
      'Some info about the data source',
      'Downloaded: 2021-06-01',
      '',
    ];
    const rows = makeDayRows('2021/03/15', 1);
    const csv = [...preamble, HEADER, ...rows].join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    expect(result.year).toBe(2021);
    expect(result.timesteps).toHaveLength(24);
    expect(result.timesteps[0].stamp.monthIndex).toBe(2); // March = index 2
    expect(result.timesteps[0].stamp.day).toBe(15);
  });

  it('throws when header with DeliveryDate is missing', () => {
    const csv = [
      'col1,col2,col3,col4,col5',
      'DAM,55.09,49.595,2021/01/01,1',
    ].join('\n');

    expect(() => parsePriceTimeseriesCSV(csv)).toThrow(
      'Could not find header with DeliveryDate in price CSV',
    );
  });

  it('skips rows with fewer than 4 fields', () => {
    const rows = [
      HEADER,
      'DAM,55.09,49.595,2021/01/01,1', // valid — hour 0
      'DAM,56,50',                       // invalid — only 3 fields
      'DAM,57.00,51.300,2021/01/01,1',  // valid — hour 1
    ];
    const csv = rows.join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    expect(result.timesteps).toHaveLength(2);
    expect(result.timesteps[0].stamp.hour).toBe(0);
    expect(result.timesteps[1].stamp.hour).toBe(1);
  });

  it('skips DST extra rows when a day has more than 24 entries', () => {
    // 25 rows for Jan 1 — the 25th should be dropped
    const rows = makeDayRows('2021/01/01', 1, 25);
    const csv = [HEADER, ...rows].join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    expect(result.timesteps).toHaveLength(24);
    expect(result.timesteps[23].stamp.hour).toBe(23);
  });

  it('detects the year from the first data row', () => {
    const rows = makeDayRows('2023/06/15', 1);
    const csv = [HEADER, ...rows].join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    expect(result.year).toBe(2023);
  });

  it('generates correct hourKey strings', () => {
    const rows = makeDayRows('2021/02/05', 1);
    const csv = [HEADER, ...rows].join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    expect(result.timesteps[0].hourKey).toBe('2021-02-05T00:00');
    expect(result.timesteps[13].hourKey).toBe('2021-02-05T13:00');
    expect(result.timesteps[23].hourKey).toBe('2021-02-05T23:00');
  });

  it('creates correct UTC timestamps', () => {
    const rows = makeDayRows('2021/07/04', 1);
    const csv = [HEADER, ...rows].join('\n');

    const result = parsePriceTimeseriesCSV(csv);

    const ts = result.timesteps[10];
    expect(ts.timestamp.getUTCFullYear()).toBe(2021);
    expect(ts.timestamp.getUTCMonth()).toBe(6); // July = 6
    expect(ts.timestamp.getUTCDate()).toBe(4);
    expect(ts.timestamp.getUTCHours()).toBe(10);
    expect(ts.timestamp.getUTCMinutes()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  normalizePriceTimeseries                                          */
/* ------------------------------------------------------------------ */

describe('normalizePriceTimeseries', () => {
  it('normalizing to same year with full data produces 8760 timesteps and 0 missing', () => {
    const data = makeFullYearParsedData(2021); // 2021 is not a leap year

    const { normalized, corrections } = normalizePriceTimeseries(data, 2021);

    expect(normalized.year).toBe(2021);
    expect(normalized.timesteps).toHaveLength(8760);
    expect(corrections.hoursMissingFilled).toBe(0);
    expect(corrections.warnings).toHaveLength(0);
    expect(corrections.expectedHours).toBe(8760);
  });

  it('normalizing to a different year with missing hours fills gaps with price 0', () => {
    // Only 2 days of data from 2021
    const rows = makeDayRows('2021/01/01', 2);
    const csv = [HEADER, ...rows].join('\n');
    const data = parsePriceTimeseriesCSV(csv);

    const { normalized, corrections } = normalizePriceTimeseries(data, 2022);

    expect(normalized.year).toBe(2022);
    expect(normalized.timesteps).toHaveLength(8760);
    // 2 days = 48 hours covered; rest are missing
    expect(corrections.hoursMissingFilled).toBe(8760 - 48);
    expect(corrections.warnings.length).toBeGreaterThan(0);
    expect(corrections.warnings[0]).toContain('Filled');

    // Covered hours should have non-zero prices
    const jan1Hour0 = normalized.timesteps.find(
      (ts) => ts.stamp.monthIndex === 0 && ts.stamp.day === 1 && ts.stamp.hour === 0,
    );
    expect(jan1Hour0).toBeDefined();
    expect(jan1Hour0!.priceEur).toBeGreaterThan(0);

    // Uncovered hours should be 0
    const marchHour = normalized.timesteps.find(
      (ts) => ts.stamp.monthIndex === 2 && ts.stamp.day === 1 && ts.stamp.hour === 0,
    );
    expect(marchHour).toBeDefined();
    expect(marchHour!.priceEur).toBe(0);
  });

  it('produces 8784 hourly timesteps for a leap year target', () => {
    const data = makeFullYearParsedData(2020); // 2020 is a leap year

    const { normalized, corrections } = normalizePriceTimeseries(data, 2020, 24);

    expect(normalized.timesteps).toHaveLength(8784);
    expect(corrections.expectedHours).toBe(8784);
    expect(corrections.hoursMissingFilled).toBe(0);
  });

  it('slotsPerDay=48 doubles the output count', () => {
    const data = makeFullYearParsedData(2021);

    const { normalized, corrections } = normalizePriceTimeseries(data, 2021, 48);

    expect(normalized.timesteps).toHaveLength(8760 * 2);
    expect(corrections.expectedHours).toBe(8760 * 2);
    expect(corrections.slotsPerDay).toBe(48);

    // Each hourly price should appear twice (minute 0 and minute 30)
    const firstTwo = normalized.timesteps.slice(0, 2);
    expect(firstTwo[0].stamp.minute).toBe(0);
    expect(firstTwo[1].stamp.minute).toBe(30);
    expect(firstTwo[0].priceEur).toBe(firstTwo[1].priceEur);
  });

  it('falls back to Feb 28 data when target is a leap year and source has no Feb 29', () => {
    // Source is 2021 (non-leap), target is 2024 (leap)
    const data = makeFullYearParsedData(2021);

    const { normalized, corrections } = normalizePriceTimeseries(data, 2024, 24);

    expect(normalized.timesteps).toHaveLength(8784);

    // Feb 29 hours should have Feb 28 prices (not 0)
    const feb29Hours = normalized.timesteps.filter(
      (ts) => ts.stamp.monthIndex === 1 && ts.stamp.day === 29,
    );
    expect(feb29Hours).toHaveLength(24);

    const feb28Hours = normalized.timesteps.filter(
      (ts) => ts.stamp.monthIndex === 1 && ts.stamp.day === 28,
    );
    expect(feb28Hours).toHaveLength(24);

    // Each Feb 29 hour should match the corresponding Feb 28 hour
    for (let h = 0; h < 24; h++) {
      const feb28 = feb28Hours.find((ts) => ts.stamp.hour === h);
      const feb29 = feb29Hours.find((ts) => ts.stamp.hour === h);
      expect(feb29!.priceEur).toBe(feb28!.priceEur);
      expect(feb29!.priceEur).toBeGreaterThan(0);
    }

    // Feb 29 fallback means those hours are NOT counted as missing
    expect(corrections.hoursMissingFilled).toBe(0);
  });

  it('all normalized timesteps have sourceIndex -1', () => {
    const data = makeFullYearParsedData(2021);

    const { normalized } = normalizePriceTimeseries(data, 2021);

    for (const ts of normalized.timesteps) {
      expect(ts.sourceIndex).toBe(-1);
    }
  });
});
