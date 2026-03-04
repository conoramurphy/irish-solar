/**
 * Parser for timeseries solar irradiance CSV files.
 * Supports both PVGIS (hourly) and CAMS (half-hourly) formats.
 */

export interface HourStamp {
  year: number;
  /** 0-11 */
  monthIndex: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0 or 30 for half-hourly data; always 0 for legacy hourly data */
  minute: number;
}

export type HourKey = string; // YYYY-MM-DDTHH:MM

/** Number of time slots per day: 24 (hourly) or 48 (half-hourly). */
export type SlotsPerDay = 24 | 48;

export interface SolarTimestep {
  /** Timestamp for display only. Core logic should use stamp/hourKey and UTC getters. */
  timestamp: Date;
  stamp: HourStamp;
  hourKey: HourKey;
  irradianceWm2: number; // GHI column - global horizontal irradiance
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
  /** Detected resolution: 24 = hourly, 48 = half-hourly */
  slotsPerDay: SlotsPerDay;
  timesteps: SolarTimestep[];
  totalIrradiance: number; // Sum of all irradiance values (for normalization)
}

export function toHourKey(stamp: HourStamp): HourKey {
  const y = String(stamp.year).padStart(4, '0');
  const m = String(stamp.monthIndex + 1).padStart(2, '0');
  const d = String(stamp.day).padStart(2, '0');
  const hh = String(stamp.hour).padStart(2, '0');
  const mm = String(stamp.minute).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * Parse a PVGIS/CAMS timestamp string into a HourStamp.
 * PVGIS hourly format: 20200101:0011  (minutes are an offset artifact, snapped to :00)
 * CAMS half-hourly:    20200101:0000 / 20200101:0030
 */
export function parsePvgisTimeToStamp(timeStr: string, halfHourly: boolean): HourStamp | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  if (timeStr.length < 13) return null;

  const dateStr = timeStr.substring(0, 8);
  const timePart = timeStr.substring(9);

  const year = parseInt(dateStr.substring(0, 4));
  const monthIndex = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(timePart.substring(0, 2));
  const rawMinute = parseInt(timePart.substring(2, 4));

  if (![year, monthIndex, day, hour, rawMinute].every(Number.isFinite)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (rawMinute < 0 || rawMinute > 59) return null;

  // For hourly data (PVGIS), snap minutes to 0 (they use :11 as an offset artifact).
  // For half-hourly data (CAMS), snap to nearest 0 or 30.
  const minute = halfHourly ? (rawMinute >= 15 ? 30 : 0) : 0;

  return { year, monthIndex, day, hour, minute };
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
  
  // Find the data header line: PVGIS uses "time,G(i),..." and CAMS uses "time,GHI,..."
  const dataHeaderIndex = lines.findIndex(l =>
    l.includes('time,G(i)') || l.includes('time,GHI')
  );
  if (dataHeaderIndex === -1) {
    throw new Error('Could not find data header in CSV (expected time,G(i) or time,GHI)');
  }

  const headerLine = lines[dataHeaderIndex];
  const isCAMS = headerLine.includes('time,GHI');

  // Detect half-hourly: CAMS files use :0000 and :0030 timestamps
  const halfHourly = isCAMS;
  
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

    const stamp = parsePvgisTimeToStamp(timeStr, halfHourly);
    if (!stamp) {
      sourceIndex++;
      continue;
    }

    if (dataYear === 0) {
      dataYear = stamp.year;
    }

    const timestamp = new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, stamp.minute, 0));
    const hourKey = toHourKey(stamp);

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

  const slotsPerDay: SlotsPerDay = halfHourly ? 48 : 24;
  
  return {
    location: locationName,
    latitude,
    longitude,
    elevation,
    year: dataYear,
    slotsPerDay,
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
    slotsPerDay: data.slotsPerDay,
    timesteps,
    totalIrradiance
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function expectedSlotsInYear(year: number, slotsPerDay: SlotsPerDay = 24): number {
  const days = isLeapYear(year) ? 366 : 365;
  return days * slotsPerDay;
}

/** @deprecated Use expectedSlotsInYear with slotsPerDay=24 */
export function expectedHoursInYear(year: number): number {
  return expectedSlotsInYear(year, 24);
}

export interface SolarNormalizationCorrections {
  selectedYear: number;
  expectedSlots: number;
  actualRowsInYear: number;
  duplicatesDropped: number;
  slotsMissingFilled: number;
  rowsOutsideYearDropped: number;
  warnings: string[];
}

export type DuplicatePolicy = 'keep-first' | 'keep-max-irradiance';

export function buildCanonicalStampsForYear(year: number, slotsPerDay: SlotsPerDay = 24): HourStamp[] {
  const febDays = isLeapYear(year) ? 29 : 28;
  const daysPerMonth = [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const minuteSteps = slotsPerDay === 48 ? [0, 30] : [0];

  const stamps: HourStamp[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const days = daysPerMonth[monthIndex] ?? 30;
    for (let day = 1; day <= days; day++) {
      for (let hour = 0; hour < 24; hour++) {
        for (const minute of minuteSteps) {
          stamps.push({ year, monthIndex, day, hour, minute });
        }
      }
    }
  }
  return stamps;
}

/** @deprecated Use buildCanonicalStampsForYear */
export function buildCanonicalHourStampsForYear(year: number): HourStamp[] {
  return buildCanonicalStampsForYear(year, 24);
}

export function normalizeSolarTimeseriesYear(
  data: ParsedSolarData,
  selectedYear: number,
  duplicatePolicy: DuplicatePolicy = 'keep-max-irradiance'
): { normalized: ParsedSolarData; corrections: SolarNormalizationCorrections } {
  const spd = data.slotsPerDay ?? 24;
  const expectedSlots = expectedSlotsInYear(selectedYear, spd);
  const canonicalStamps = buildCanonicalStampsForYear(selectedYear, spd);
  const canonicalKeys = canonicalStamps.map(toHourKey);
  const canonicalKeySet = new Set(canonicalKeys);

  const rowsInYear = data.timesteps.filter((ts) => ts.stamp.year === selectedYear);

  const map = new Map<HourKey, SolarTimestep>();
  let duplicatesDropped = 0;

  for (const ts of rowsInYear) {
    const k = ts.hourKey;
    if (!canonicalKeySet.has(k)) {
      continue;
    }

    const existing = map.get(k);
    if (!existing) {
      map.set(k, ts);
      continue;
    }

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

  const normalizedTimesteps: SolarTimestep[] = [];
  let slotsMissingFilled = 0;
  for (let i = 0; i < canonicalStamps.length; i++) {
    const stamp = canonicalStamps[i]!;
    const k = canonicalKeys[i]!;
    const found = map.get(k);

    if (found) {
      normalizedTimesteps.push({
        ...found,
        timestamp: new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, stamp.minute, 0)),
        stamp,
        hourKey: k
      });
      continue;
    }

    slotsMissingFilled++;
    normalizedTimesteps.push({
      timestamp: new Date(Date.UTC(stamp.year, stamp.monthIndex, stamp.day, stamp.hour, stamp.minute, 0)),
      stamp,
      hourKey: k,
      irradianceWm2: 0,
      sourceIndex: -1
    });
  }

  const totalIrradiance = normalizedTimesteps.reduce((sum, ts) => sum + (ts.irradianceWm2 ?? 0), 0);

  const warnings: string[] = [];
  if (rowsOutsideYearDropped > 0) warnings.push(`Dropped ${rowsOutsideYearDropped} rows outside selected year ${selectedYear}.`);
  if (duplicatesDropped > 0) warnings.push(`Dropped ${duplicatesDropped} duplicate slots (policy: ${duplicatePolicy}).`);
  if (slotsMissingFilled > 0) warnings.push(`Filled ${slotsMissingFilled} missing slots with 0 irradiance.`);

  const normalized: ParsedSolarData = {
    ...data,
    year: selectedYear,
    slotsPerDay: spd,
    timesteps: normalizedTimesteps,
    totalIrradiance
  };

  const corrections: SolarNormalizationCorrections = {
    selectedYear,
    expectedSlots,
    actualRowsInYear: rowsInYear.length,
    duplicatesDropped,
    slotsMissingFilled,
    rowsOutsideYearDropped,
    warnings
  };

  if (normalized.timesteps.length !== expectedSlots) {
    throw new Error(
      `Normalization failed: expected ${expectedSlots} slots for year ${selectedYear}, got ${normalized.timesteps.length}.`
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
