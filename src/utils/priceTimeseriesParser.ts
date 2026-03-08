import {
  expectedSlotsInYear,
  buildCanonicalHourStampsForYear,
  toHourKey,
} from './solarTimeseriesParser';
import type { HourKey, HourStamp, SlotsPerDay } from './solarTimeseriesParser';

export interface PriceTimestep {
  timestamp: Date;
  stamp: HourStamp;
  hourKey: HourKey;
  priceEur: number;
  sourceIndex: number;
}

export interface ParsedPriceData {
  year: number;
  timesteps: PriceTimestep[];
}

export interface PriceNormalizationCorrections {
  targetYear: number;
  expectedHours: number;
  actualRowsParsed: number;
  duplicatesDropped: number;
  hoursMissingFilled: number;
  warnings: string[];
  slotsPerDay?: SlotsPerDay;
}

/**
 * Parse the Day Ahead Price CSV
 * Format: auction,price_eur,price_gbp,DeliveryDate,DeliveryInterval
 * Example: DAM,55.09,49.595,2021/01/01,1
 */
export function parsePriceTimeseriesCSV(csvContent: string): ParsedPriceData {
  const lines = csvContent.split('\n');
  
  // Find header
  const headerIndex = lines.findIndex(l => l.toLowerCase().includes('deliverydate'));
  if (headerIndex === -1) {
    throw new Error('Could not find header with DeliveryDate in price CSV');
  }

  const dataLines = lines.slice(headerIndex + 1).filter(l => l.trim().length > 0);
  const timesteps: PriceTimestep[] = [];
  let sourceIndex = 0;
  let detectedYear = 0;

  // We need to track hour for each day. The CSV seems to have 24 rows per day.
  // DeliveryInterval is usually 1.
  // Let's assume the rows are ordered by time.
  // But strictly, we should parse the date.
  // If there is no time column, we might have to infer hour from row order within date?
  // Let's look at the CSV again.
  // 2|DAM,55.09,49.595,2021/01/01,1
  // ...
  // 26|DAM,69.9,62.928,2021/01/02,1
  // It seems there are 24 rows for 2021/01/01.
  // We can track the current date and increment hour.

  let currentDayStr = '';
  let currentHour = 0;

  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 4) continue;

    const priceEur = parseFloat(parts[1]);
    const dateStr = parts[3]; // 2021/01/01

    if (dateStr !== currentDayStr) {
      currentDayStr = dateStr;
      currentHour = 0;
    } else {
      currentHour++;
    }

    // Safety check: if > 23, we might have duplicate data or different intervals (30 min?)
    // The file name says "Lookback2_mkt_filtered".
    // Let's assume standard hourly for now, but clamp to 23.
    // If we exceed 23, we should probably warn or skip. 
    // But if it's 30-min data, this logic fails.
    // Let's assume hourly based on 200 lines covering ~8 days. 200/24 = 8.33. 
    // 200 lines covers Jan 1 to Jan 9. 9 days * 24 = 216. So line 200 is part way through Jan 9.
    // Jan 1 to Jan 8 is 8 days. 8 * 24 = 192.
    // Line 200 is 2021/01/09.
    // So it is likely hourly.

    if (currentHour > 23) {
      // Skip extra hours if any (e.g. DST repeat?)
      // For simplicity in this "simple" model, let's just skip.
      continue;
    }

    const [yyyy, mm, dd] = dateStr.split('/').map(Number);
    if (!detectedYear) detectedYear = yyyy;

    const stamp: HourStamp = {
      year: yyyy,
      monthIndex: mm - 1,
      day: dd,
      hour: currentHour,
      minute: 0,
    };

    const hourKey = toHourKey(stamp);
    const timestamp = new Date(Date.UTC(yyyy, mm - 1, dd, currentHour, 0, 0));

    timesteps.push({
      timestamp,
      stamp,
      hourKey,
      priceEur,
      sourceIndex
    });

    sourceIndex++;
  }

  return {
    year: detectedYear,
    timesteps
  };
}

/**
 * Normalize price data to match the target simulation year.
 * @param data Parsed hourly price data
 * @param targetYear Calendar year to normalize to
 * @param slotsPerDay 24 = hourly output, 48 = half-hourly output (each hourly price duplicated into two 30-min slots)
 */
export function normalizePriceTimeseries(
  data: ParsedPriceData,
  targetYear: number,
  slotsPerDay: SlotsPerDay = 24
): { normalized: ParsedPriceData; corrections: PriceNormalizationCorrections } {
  const expectedHours = expectedSlotsInYear(targetYear, slotsPerDay);
  // Always build canonical hourly stamps as the source lookup; we expand to 30-min below if needed.
  const canonicalStamps = buildCanonicalHourStampsForYear(targetYear);
  
  // Index source data by "monthIndex-day-hour" key to map across years
  const sourceMap = new Map<string, number>(); // Key -> Price
  
  for (const ts of data.timesteps) {
    const key = `${ts.stamp.monthIndex}-${ts.stamp.day}-${ts.stamp.hour}`;
    sourceMap.set(key, ts.priceEur);
  }

  const normalizedTimesteps: PriceTimestep[] = [];
  let hoursMissingFilled = 0;
  
  for (const stamp of canonicalStamps) {
    const key = `${stamp.monthIndex}-${stamp.day}-${stamp.hour}`;
    let price = sourceMap.get(key);

    if (price === undefined) {
      if (stamp.monthIndex === 1 && stamp.day === 29) {
        const feb28Key = `1-28-${stamp.hour}`;
        price = sourceMap.get(feb28Key);
      }
      if (price === undefined) {
        price = 0;
        hoursMissingFilled++;
      }
    }

    if (slotsPerDay === 48) {
      // Duplicate the hourly price into two 30-minute slots
      for (const minute of [0, 30] as const) {
        const halfStamp: HourStamp = { ...stamp, minute };
        const hourKey = toHourKey(halfStamp);
        const timestamp = new Date(Date.UTC(targetYear, stamp.monthIndex, stamp.day, stamp.hour, minute, 0));
        normalizedTimesteps.push({ timestamp, stamp: halfStamp, hourKey, priceEur: price, sourceIndex: -1 });
      }
    } else {
      const hourKey = toHourKey(stamp);
      const timestamp = new Date(Date.UTC(targetYear, stamp.monthIndex, stamp.day, stamp.hour, 0, 0));
      normalizedTimesteps.push({ timestamp, stamp, hourKey, priceEur: price, sourceIndex: -1 });
    }
  }

  const corrections: PriceNormalizationCorrections = {
    targetYear,
    expectedHours,
    actualRowsParsed: data.timesteps.length,
    duplicatesDropped: 0,
    hoursMissingFilled,
    slotsPerDay,
    warnings: hoursMissingFilled > 0 ? [`Filled ${hoursMissingFilled} slots with 0 price.`] : []
  };

  return {
    normalized: {
      year: targetYear,
      timesteps: normalizedTimesteps
    },
    corrections
  };
}
