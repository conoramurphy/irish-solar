import { startSpan, endSpan, logError, logInfo } from './logger';

export interface UsageProfileParseResult {
  /** Per-slot kWh values. 17520/17568 for half-hourly, 8760/8784 for legacy hourly. */
  hourlyConsumption: number[];
  /** The primary year detected in the file */
  year: number;
  /** Total kWh consumption */
  totalKwh: number;
  /** Warnings (e.g. missing slots, filled gaps) */
  warnings: string[];
  /** Resolution: 24 = hourly, 48 = half-hourly */
  slotsPerDay: 24 | 48;
}

/**
 * Parse an ESB Networks HDF (Historical Data File) CSV.
 * Columns expected: MPRN, Meter Serial Number, Read Value, Read Type, Read Date and End Time
 * 
 * Logic:
 * 1. Parse CSV to extract { timestamp, value, type }
 * 2. Filter for "Active Import Interval (kW)"
 * 3. Convert 30-min kW readings to kWh (Value * 0.5)
 * 4. Map each 30-min reading to its half-hourly slot (native resolution — no aggregation to hourly)
 * 5. Normalize to a full year half-hourly grid (17520 or 17568 slots)
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

    // Build a half-hourly grid (48 slots/day) — native ESB resolution
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeap ? 366 : 365;
    const slotsPerDay = 48;
    const slotsInYear = daysInYear * slotsPerDay; // 17520 or 17568
    const slotConsumption = new Float32Array(slotsInYear);

    // Sort points
    points.sort((a, b) => a.time - b.time);

    // Map each 30-min ESB reading to its half-hourly slot.
    // ESB timestamp is "End Time" of the interval, so interval start = ts - 30 min.
    // Slot index = minutes since start of year / 30.
    let mappedCount = 0;

    for (const p of points) {
      const intervalStart = p.time - 30 * 60 * 1000;
      const dStart = new Date(intervalStart);
      const sYear = dStart.getUTCFullYear();

      if (targetYear && sYear !== targetYear) continue;
      if (sYear !== year) continue;

      const startOfCurrentYear = Date.UTC(year, 0, 1);
      const diffMs = intervalStart - startOfCurrentYear;
      const slotIndex = Math.floor(diffMs / (30 * 60 * 1000));

      if (slotIndex >= 0 && slotIndex < slotsInYear) {
        slotConsumption[slotIndex] += p.kwh;
        mappedCount++;
      }
    }

    const totalKwh = slotConsumption.reduce((a, b) => a + b, 0);
    
    let zeroCount = 0;
    for (let i = 0; i < slotConsumption.length; i++) {
      if (slotConsumption[i] === 0) zeroCount++;
    }
    
    if (zeroCount > slotsPerDay) {
      warnings.push(`${zeroCount} half-hourly slots have 0 consumption. This might indicate missing data.`);
    }
    
    if (mappedCount < slotsInYear * 0.9) {
      warnings.push(`Only found ${mappedCount} half-hourly readings for year ${year}. Expected ~${slotsInYear}. Data may be incomplete.`);
    }

    endSpan(spanId, 'success', { year, totalKwh, warnings: warnings.length });

    return {
      hourlyConsumption: Array.from(slotConsumption),
      year,
      totalKwh,
      warnings,
      slotsPerDay
    };

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown parsing error';
    logError('parser', 'Failed to parse usage profile', { error: msg });
    endSpan(spanId, 'error', { message: msg });
    throw e;
  }
}
