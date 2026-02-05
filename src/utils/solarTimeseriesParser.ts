/**
 * Parser for timeseries solar irradiance CSV files
 * Format: PVGIS horizontal irradiance data
 */

export interface SolarTimestep {
  timestamp: Date;
  irradianceWm2: number; // G(i) column - global horizontal irradiance
  hourOfYear: number; // 0-8759 for a full year
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
  let hourOfYear = 0;
  let dataYear = 0;
  
  for (const line of dataLines) {
    const parts = line.split(',');
    if (parts.length < 2) continue;
    
    const timestampStr = parts[0]; // e.g., "20200101:0011"
    const irradianceStr = parts[1]; // G(i) - global horizontal irradiance
    
    // Parse timestamp: YYYYMMdd:HHmm
    const dateStr = timestampStr.substring(0, 8); // YYYYMMdd
    const timeStr = timestampStr.substring(9); // HHmm
    
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // 0-indexed
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(timeStr.substring(0, 2));
    const minute = parseInt(timeStr.substring(2, 4));
    
    // Track the year from the data
    if (dataYear === 0) {
      dataYear = year;
    }
    
    const timestamp = new Date(year, month, day, hour, minute);
    
    // Parse irradiance (W/m²) and clamp negatives to zero
    const irradiance = Math.max(0, parseFloat(irradianceStr) || 0);
    
    timesteps.push({
      timestamp,
      irradianceWm2: irradiance,
      hourOfYear
    });
    
    totalIrradiance += irradiance;
    hourOfYear++;
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
    years.add(ts.timestamp.getFullYear());
  }
  return Array.from(years).sort((a, b) => a - b);
}

export function sliceSolarTimeseriesYear(data: ParsedSolarData, year: number): ParsedSolarData {
  const timesteps = data.timesteps.filter((ts) => ts.timestamp.getFullYear() === year);
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
    const monthIndex = ts.timestamp.getMonth();
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
