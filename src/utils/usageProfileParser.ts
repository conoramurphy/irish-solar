import { startSpan, endSpan, logError, logInfo, logWarn } from './logger';

export interface UsageProfileParseResult {
  /** 8760 (or 8784) hourly kWh values */
  hourlyConsumption: number[];
  /** The primary year detected in the file */
  year: number;
  /** Total kWh consumption */
  totalKwh: number;
  /** Warnings (e.g. missing hours, filled gaps) */
  warnings: string[];
}

/**
 * Parse an ESB Networks HDF (Historical Data File) CSV.
 * Columns expected: MPRN, Meter Serial Number, Read Value, Read Type, Read Date and End Time
 * 
 * Logic:
 * 1. Parse CSV to extract { timestamp, value, type }
 * 2. Filter for "Active Import Interval (kW)"
 * 3. Convert 30-min kW readings to kWh (Value * 0.5)
 * 4. Aggregate to hourly (sum of XX:30 and (XX+1):00)
 * 5. Normalize to a full year grid
 */
export function parseEsbUsageProfile(csvText: string, targetYear?: number): UsageProfileParseResult {
  const spanId = startSpan('parser', 'parseEsbUsageProfile', { targetYear });
  const warnings: string[] = [];
  
  try {
    const lines = csvText.split(/\r?\n/);
    const headerRow = lines.find(l => l.toLowerCase().includes('read date and end time'));
    
    if (!headerRow) {
      throw new Error('Invalid CSV format: Missing "Read Date and End Time" column header.');
    }

    const headers = headerRow.split(',').map(h => h.trim().toLowerCase());
    const dateIdx = headers.indexOf('read date and end time');
    const valueIdx = headers.indexOf('read value');
    const typeIdx = headers.indexOf('read type'); // "Read Type" or similar

    if (dateIdx === -1 || valueIdx === -1) {
      throw new Error('Invalid CSV format: Missing Date or Value columns.');
    }

    // Parsed raw points (30-min intervals)
    const points: Array<{ time: number; kwh: number }> = [];
    const yearCounts = new Map<number, number>();

    // Start scanning from the line after header
    const startIdx = lines.indexOf(headerRow) + 1;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(','); // Simple split (assumes no commas in fields)
      
      // Check type if column exists
      if (typeIdx !== -1) {
        const type = cols[typeIdx]?.trim();
        // We want "Active Import Interval (kW)" or similar. Ignore exports or reactive.
        // Some files might just imply import. If it says "Export", skip.
        if (type && type.toLowerCase().includes('export')) continue;
      }

      const dateStr = cols[dateIdx]?.trim();
      const valStr = cols[valueIdx]?.trim();

      if (!dateStr || !valStr) continue;

      // Parse Date: DD-MM-YYYY HH:mm
      const [d, t] = dateStr.split(' ');
      if (!d || !t) continue;
      const [day, month, year] = d.split('-').map(Number);
      const [hour, min] = t.split(':').map(Number);

      if (!day || !month || !year) continue;

      // Create UTC date to avoid timezone issues (we treat the file times as "wall clock" for the site)
      // We align to UTC because the solar engine uses UTC.
      // 00:00 in file -> 00:00 in engine.
      const ts = Date.UTC(year, month - 1, day, hour, min);
      
      // Value is kW average for 30 mins -> kWh = kW * 0.5
      const val = parseFloat(valStr);
      if (isNaN(val)) continue;
      
      const kwh = val * 0.5;

      points.push({ time: ts, kwh });
      
      // Count years based on INTERVAL START, not End Time.
      // End Time 00:00 on Jan 1 belongs to Dec 31 of previous year.
      const intervalStart = ts - 30 * 60 * 1000;
      const sYear = new Date(intervalStart).getUTCFullYear();
      
      yearCounts.set(sYear, (yearCounts.get(sYear) || 0) + 1);
    }

    if (points.length === 0) {
      throw new Error('No valid usage data found in file.');
    }

    // Determine year
    let year = targetYear;
    if (!year) {
      // Pick year with most points
      let max = 0;
      for (const [y, count] of yearCounts.entries()) {
        if (count > max) {
          max = count;
          year = y;
        }
      }
    }
    
    if (!year) year = new Date().getFullYear(); // Fallback

    logInfo('parser', `Selected year for usage profile: ${year}`);

    // Create grid for the selected year
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeap ? 366 : 365;
    const hoursInYear = daysInYear * 24;
    const hourlyConsumption = new Float32Array(hoursInYear);

    // Sort points
    points.sort((a, b) => a.time - b.time);

    // Map points to grid
    // Logic: 
    // Grid Hour 0 (00:00-01:00) should sum points ending at 00:30 and 01:00.
    // Point timestamp is "End Time".
    // So timestamp T belongs to the hour (T - 1ms).getHours()?
    // Example: 
    // 00:30 belongs to 00:00-01:00 segment (Hour 0).
    // 01:00 belongs to 00:00-01:00 segment (Hour 0).
    // 01:30 belongs to 01:00-02:00 segment (Hour 1).
    
    let mappedCount = 0;

    for (const p of points) {
      // Calculate Interval Start
      const intervalStart = p.time - 30 * 60 * 1000;
      const dStart = new Date(intervalStart);
      const sYear = dStart.getUTCFullYear();

      // If we are strictly filtering by year:
      if (targetYear && sYear !== targetYear) {
        continue;
      }
      
      // If we inferred the year, we should only use points from that year 
      if (sYear !== year) continue;

      const sMonth = dStart.getUTCMonth();
      const sDate = dStart.getUTCDate();
      const sHour = dStart.getUTCHours(); // 0-23. This is the hour bucket.

      // Calculate hour index 0..8759
      const startOfCurrentYear = Date.UTC(year, 0, 1);
      const diffSinceStart = intervalStart - startOfCurrentYear;
      const hoursSinceStart = Math.floor(diffSinceStart / (1000 * 60 * 60));
      
      if (hoursSinceStart >= 0 && hoursSinceStart < hoursInYear) {
        hourlyConsumption[hoursSinceStart] += p.kwh;
        mappedCount++;
      }
    }

    const totalKwh = hourlyConsumption.reduce((a, b) => a + b, 0);
    
    // Check for gaps
    // We expect 2 points per hour. If usage is low, it might be valid.
    // But if 0, it might be missing.
    // Let's count zeros?
    let zeroCount = 0;
    for (let i = 0; i < hourlyConsumption.length; i++) {
      if (hourlyConsumption[i] === 0) zeroCount++;
    }
    
    if (zeroCount > 24) { // somewhat arbitrary threshold
      warnings.push(`${zeroCount} hours have 0 consumption. This might indicate missing data.`);
    }
    
    if (mappedCount < hoursInYear * 2 * 0.9) {
       warnings.push(`Only found ${mappedCount} half-hourly readings for year ${year}. Expected ~${hoursInYear * 2}. Data may be incomplete.`);
    }

    endSpan(spanId, 'success', { year, totalKwh, warnings: warnings.length });

    return {
      hourlyConsumption: Array.from(hourlyConsumption),
      year,
      totalKwh,
      warnings
    };

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown parsing error';
    logError('parser', 'Failed to parse usage profile', { error: msg });
    endSpan(spanId, 'error', { message: msg });
    throw e;
  }
}
