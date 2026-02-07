/**
 * Parser for timeseries solar irradiance CSV files
 * Format: PVGIS horizontal irradiance data
 */

export interface HourStamp {
  year: number;
  /** 0-11 */
  monthIndex: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
}

export type HourKey = string; // YYYY-MM-DDTHH

export interface SolarTimestep {
  /** Timestamp for display only. Core logic should use stamp/hourKey and UTC getters. */
  timestamp: Date;
  stamp: HourStamp;
  hourKey: HourKey;
  irradianceWm2: number; // G(i) column - global horizontal irradiance
  /** Row order index in the source file (not used for time logic). */
  sourceIndex: number;
}

export interface ParsedSolarData {
  location: string;
  latitude: number;
  longitude: number;
  elevation: number;
  /** First year encountered in the dataset (if multi-year CSV, this is not necessarily unique). */
  year: number;
  timesteps: SolarTimestep[];
  totalIrradiance: number; // Sum of all irradiance values (for normalization)
}

/**
 * Parse a PVGIS-format CSV file
 */
export function toHourKey(stamp: HourStamp): HourKey {
  const y = String(stamp.year).padStart(4, '0');
  const m = String(stamp.monthIndex + 1).padStart(2, '0');
  const d = String(stamp.day).padStart(2, '0');
  const hh = String(stamp.hour).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}`;
}

export function parsePvgisTimeToStamp(timeStr: string): HourStamp | null {
  // PVGIS format example: 20200101:0011 (YYYYMMDD:HHmm)
  if (!timeStr || typeof timeStr !== 'string') return null;
  if (timeStr.length < 13) return null;

  const dateStr = timeStr.substring(0, 8);
  const timePart = timeStr.substring(9);

  const year = parseInt(dateStr.substring(0, 4));
  const monthIndex = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(timePart.substring(0, 2));
  const minute = parseInt(timePart.substring(2, 4));

  if (![year, monthIndex, day, hour, minute].every(Number.isFinite)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  // We intentionally ignore minutes for hourKey mapping (PVGIS hourly exports may use HH:11).
  return { year, monthIndex, day, hour };
}

export function parseSolarTimeseriesCSV(csvContent: string, locationName: string): ParsedSolarData {
  const lines = csvContent.split('\n');
  
  // Parse header metadata
  const latLine = lines.find(l => l.startsWith('Latitude'));
  const lonLine = lines.find(l => l.startsWith('Longitude'));
  const elevLine = lines.find(l => l.startsWith('Elevation'));
  
  const latitude = parseFloat(latLine?.split('\t')[1] || '0');
  const longitude = parseFloat(lonLine?.split('\t')[1] || '0');
  const elevation = parseFloat(elevLine?.split('\t')[1] || '0');
  
  // Find the data header line (contains "time,G(i),...")
  const dataHeaderIndex = lines.findIndex(l => l.includes('time,G(i)'));
  if (dataHeaderIndex === -1) {
    throw new Error('Could not find data header in CSV');
  }
  
  const dataLines = lines.slice(dataHeaderIndex + 1).filter(l => l.trim().length > 0);
  
  const timesteps: SolarTimestep[] = [];
  let totalIrradiance = 0;
  let dataYear = 0;
  let sourceIndex = 0;

  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 2) continue;

    const timeStr = parts[0];
    const irradianceStr = parts[1];

    const stamp = parsePvgisTimeToStamp(timeStr);
    if (!stamp) {
      sourceIndex++;
      continue;
    }

    if (dataYear === 0) {
      dataYear = stamp.year;
    }

    // Use UTC Date to avoid local timezone / DST effects.
    const timestamp = new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, 0, 0));
    const hourKey = toHourKey(stamp);

    // Parse irradiance (W/m²) and clamp negatives to zero
    const irradiance = Math.max(0, parseFloat(irradianceStr) || 0);

    timesteps.push({
      timestamp,
      stamp,
      hourKey,
      irradianceWm2: irradiance,
      sourceIndex
    });

    totalIrradiance += irradiance;
    sourceIndex++;
  }
  
  return {
    location: locationName,
    latitude,
    longitude,
    elevation,
    year: dataYear,
    timesteps,
    totalIrradiance
  };
}

export function listSolarTimeseriesYears(data: ParsedSolarData): number[] {
  const years = new Set<number>();
  for (const ts of data.timesteps) {
    years.add(ts.timestamp.getUTCFullYear());
  }
  return Array.from(years).sort((a, b) => a - b);
}

export function sliceSolarTimeseriesYear(data: ParsedSolarData, year: number): ParsedSolarData {
  const timesteps = data.timesteps.filter((ts) => ts.timestamp.getUTCFullYear() === year);
  const totalIrradiance = timesteps.reduce((sum, ts) => sum + ts.irradianceWm2, 0);

  return {
    ...data,
    year,
    timesteps,
    totalIrradiance
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function expectedHoursInYear(year: number): number {
  return isLeapYear(year) ? 8784 : 8760;
}

export interface SolarNormalizationCorrections {
  selectedYear: number;
  expectedHours: number;
  actualRowsInYear: number;
  duplicatesDropped: number;
  hoursMissingFilled: number;
  rowsOutsideYearDropped: number;
  warnings: string[];
}

export type DuplicatePolicy = 'keep-first' | 'keep-max-irradiance';

export function buildCanonicalHourStampsForYear(year: number): HourStamp[] {
  const febDays = isLeapYear(year) ? 29 : 28;
  const daysPerMonth = [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const stamps: HourStamp[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const days = daysPerMonth[monthIndex] ?? 30;
    for (let day = 1; day <= days; day++) {
      for (let hour = 0; hour < 24; hour++) {
        stamps.push({ year, monthIndex, day, hour });
      }
    }
  }
  return stamps;
}

export function normalizeSolarTimeseriesYear(
  data: ParsedSolarData,
  selectedYear: number,
  duplicatePolicy: DuplicatePolicy = 'keep-max-irradiance'
): { normalized: ParsedSolarData; corrections: SolarNormalizationCorrections } {
  const expectedHours = expectedHoursInYear(selectedYear);
  const canonicalStamps = buildCanonicalHourStampsForYear(selectedYear);
  const canonicalKeys = canonicalStamps.map(toHourKey);
  const canonicalKeySet = new Set(canonicalKeys);

  const rowsInYear = data.timesteps.filter((ts) => ts.stamp.year === selectedYear);

  const map = new Map<HourKey, SolarTimestep>();
  let duplicatesDropped = 0;

  for (const ts of rowsInYear) {
    const k = ts.hourKey;
    if (!canonicalKeySet.has(k)) {
      // In-year row but off our canonical day/hour grid (e.g., weird day 31 in a 30-day month)
      continue;
    }

    const existing = map.get(k);
    if (!existing) {
      map.set(k, ts);
      continue;
    }

    // Duplicate hourKey: keep deterministically.
    duplicatesDropped++;
    if (duplicatePolicy === 'keep-first') {
      continue;
    }
    if (duplicatePolicy === 'keep-max-irradiance') {
      if ((ts.irradianceWm2 ?? 0) > (existing.irradianceWm2 ?? 0)) {
        map.set(k, ts);
      }
    }
  }

  const rowsOutsideYearDropped = data.timesteps.length - rowsInYear.length;

  // Fill missing hours with 0 irradiance.
  const normalizedTimesteps: SolarTimestep[] = [];
  let hoursMissingFilled = 0;
  for (let i = 0; i < canonicalStamps.length; i++) {
    const stamp = canonicalStamps[i]!;
    const k = canonicalKeys[i]!;
    const found = map.get(k);

    if (found) {
      // Ensure timestamp is UTC.
      normalizedTimesteps.push({
        ...found,
        timestamp: new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, 0, 0)),
        stamp,
        hourKey: k
      });
      continue;
    }

    hoursMissingFilled++;
    normalizedTimesteps.push({
      timestamp: new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, 0, 0)),
      stamp,
      hourKey: k,
      irradianceWm2: 0,
      sourceIndex: -1
    });
  }

  const totalIrradiance = normalizedTimesteps.reduce((sum, ts) => sum + (ts.irradianceWm2 ?? 0), 0);

  const warnings: string[] = [];
  if (rowsOutsideYearDropped > 0) warnings.push(`Dropped ${rowsOutsideYearDropped} rows outside selected year ${selectedYear}.`);
  if (duplicatesDropped > 0) warnings.push(`Dropped ${duplicatesDropped} duplicate hours (policy: ${duplicatePolicy}).`);
  if (hoursMissingFilled > 0) warnings.push(`Filled ${hoursMissingFilled} missing hours with 0 irradiance.`);

  const normalized: ParsedSolarData = {
    ...data,
    year: selectedYear,
    timesteps: normalizedTimesteps,
    totalIrradiance
  };

  const corrections: SolarNormalizationCorrections = {
    selectedYear,
    expectedHours,
    actualRowsInYear: rowsInYear.length,
    duplicatesDropped,
    hoursMissingFilled,
    rowsOutsideYearDropped,
    warnings
  };

  // Hard invariant: normalized must match canonical expected length.
  if (normalized.timesteps.length !== expectedHours) {
    throw new Error(
      `Normalization failed: expected ${expectedHours} hours for year ${selectedYear}, got ${normalized.timesteps.length}.`
    );
  }

  return { normalized, corrections };
}

/**
 * Calculate normalized weights for each timestep
 * Weight = irradiance / total_irradiance
 * Sum of all weights = 1
 */
export function calculateTimeseriesWeights(data: ParsedSolarData): number[] {
  if (data.totalIrradiance === 0) {
    // Fallback to equal distribution if no irradiance data
    return data.timesteps.map(() => 1 / data.timesteps.length);
  }
  
  return data.timesteps.map(ts => ts.irradianceWm2 / data.totalIrradiance);
}

/**
 * Distribute annual production across timesteps using irradiance weights
 */
export function distributeAnnualProductionTimeseries(
  annualProductionKwh: number,
  data: ParsedSolarData
): number[] {
  const weights = calculateTimeseriesWeights(data);
  return weights.map(weight => annualProductionKwh * weight);
}

/**
 * Aggregate hourly production to daily totals
 */
export function aggregateToDaily(
  hourlyProduction: number[],
  data: ParsedSolarData
): { date: string; productionKwh: number }[] {
  const dailyMap = new Map<string, number>();
  
  data.timesteps.forEach((ts, index) => {
    const dateKey = ts.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const current = dailyMap.get(dateKey) || 0;
    dailyMap.set(dateKey, current + hourlyProduction[index]);
  });
  
  return Array.from(dailyMap.entries())
    .map(([date, productionKwh]) => ({ date, productionKwh }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Aggregate hourly production to monthly totals
 */
export function aggregateToMonthly(
  hourlyProduction: number[],
  data: ParsedSolarData
): { monthIndex: number; monthName: string; productionKwh: number }[] {
  const monthlyMap = new Map<number, number>();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  data.timesteps.forEach((ts, index) => {
    const monthIndex = ts.timestamp.getUTCMonth();
    // Validate month index is in valid range (0-11)
    if (monthIndex >= 0 && monthIndex < 12) {
      const current = monthlyMap.get(monthIndex) || 0;
      monthlyMap.set(monthIndex, current + hourlyProduction[index]);
    }
  });
  
  // Ensure we return exactly 12 months, even if some have 0 production
  const result: { monthIndex: number; monthName: string; productionKwh: number }[] = [];
  for (let i = 0; i < 12; i++) {
    result.push({
      monthIndex: i,
      monthName: monthNames[i],
      productionKwh: monthlyMap.get(i) || 0
    });
  }
  
  return result;
}
