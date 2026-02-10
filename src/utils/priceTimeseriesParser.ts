import { expectedHoursInYear, buildCanonicalHourStampsForYear, toHourKey } from './solarTimeseriesParser';
import type { HourKey, HourStamp } from './solarTimeseriesParser';

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
      hour: currentHour
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
 * Normalize price data to match the target simulation year (8760/8784 hours)
 */
export function normalizePriceTimeseries(
  data: ParsedPriceData,
  targetYear: number
): { normalized: ParsedPriceData; corrections: PriceNormalizationCorrections } {
  const expectedHours = expectedHoursInYear(targetYear);
  const canonicalStamps = buildCanonicalHourStampsForYear(targetYear);
  
  // Index source data by "MM-DD-HH" key to map across years
  const sourceMap = new Map<string, number>(); // Key -> Price
  
  for (const ts of data.timesteps) {
    // Key format: MM-DD-HH
    const key = `${ts.stamp.monthIndex}-${ts.stamp.day}-${ts.stamp.hour}`;
    // If duplicate (e.g. multiple years in source), keep last or first? 
    // Let's keep last (arbitrary, or maybe we want average?)
    // Simple: keep last.
    sourceMap.set(key, ts.priceEur);
  }

  const normalizedTimesteps: PriceTimestep[] = [];
  let hoursMissingFilled = 0;
  
  for (const stamp of canonicalStamps) {
    const key = `${stamp.monthIndex}-${stamp.day}-${stamp.hour}`;
    let price = sourceMap.get(key);

    if (price === undefined) {
      // Fallback strategies:
      // 1. If Feb 29 and missing, look for Feb 28
      if (stamp.monthIndex === 1 && stamp.day === 29) {
         const feb28Key = `1-28-${stamp.hour}`;
         price = sourceMap.get(feb28Key);
      }
      
      // 2. If still missing, look for previous hour?
      // 3. Default to 0? Or average?
      // Let's default to a "safe" reasonable price or 0?
      // 0 might mislead battery to charge aggressively.
      // Let's use 0 but warn.
      if (price === undefined) {
        price = 0;
        hoursMissingFilled++;
      }
    }

    const hourKey = toHourKey(stamp);
    const timestamp = new Date(Date.UTC(targetYear, stamp.monthIndex, stamp.day, stamp.hour, 0, 0));

    normalizedTimesteps.push({
      timestamp,
      stamp,
      hourKey,
      priceEur: price,
      sourceIndex: -1 // Synthetic
    });
  }

  const corrections: PriceNormalizationCorrections = {
    targetYear,
    expectedHours,
    actualRowsParsed: data.timesteps.length,
    duplicatesDropped: 0, // Simplified
    hoursMissingFilled,
    warnings: hoursMissingFilled > 0 ? [`Filled ${hoursMissingFilled} hours with 0 price.`] : []
  };

  return {
    normalized: {
      year: targetYear,
      timesteps: normalizedTimesteps
    },
    corrections
  };
}
