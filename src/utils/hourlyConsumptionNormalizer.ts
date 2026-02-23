/**
 * Utility to normalize hourly consumption data to match solar timeseries length.
 * 
 * Handles the case where usage data is from a different year type (leap vs non-leap)
 * than the selected solar data year.
 */

import { logWarn } from './logger';

export interface NormalizeResult {
  normalized: number[];
  corrections: {
    originalLength: number;
    targetLength: number;
    padded: boolean;
    trimmed: boolean;
    warnings: string[];
  };
}

/**
 * Normalize hourly consumption array to match target length (8760 or 8784).
 * 
 * If source is non-leap (8760) and target is leap (8784):
 * - Pads Feb 29 with averaged values from Feb 28 and Mar 1
 * 
 * If source is leap (8784) and target is non-leap (8760):
 * - Removes Feb 29 data (hours 1416-1439, 24 hours)
 * 
 * @param hourlyConsumption - Source hourly consumption array
 * @param targetLength - Target length (8760 or 8784)
 * @returns Normalized array and correction metadata
 */
export function normalizeHourlyConsumptionLength(
  hourlyConsumption: number[],
  targetLength: number
): NormalizeResult {
  const warnings: string[] = [];
  const originalLength = hourlyConsumption.length;
  
  // No change needed
  if (originalLength === targetLength) {
    return {
      normalized: hourlyConsumption,
      corrections: {
        originalLength,
        targetLength,
        padded: false,
        trimmed: false,
        warnings: []
      }
    };
  }
  
  // Handle 8760 -> 8784 (add Feb 29)
  if (originalLength === 8760 && targetLength === 8784) {
    const normalized = [...hourlyConsumption];
    
    // Feb 29 starts at hour 1416 (31 days in Jan * 24 + 28 days in Feb * 24)
    // We need to insert 24 hours at index 1416
    const feb28Start = 31 * 24 + 27 * 24; // Last day of Feb in non-leap year
    const mar1Start = feb28Start + 24;
    
    // Average Feb 28 and Mar 1 for each hour
    const feb29Hours: number[] = [];
    for (let h = 0; h < 24; h++) {
      const feb28Hour = hourlyConsumption[feb28Start + h] || 0;
      const mar1Hour = hourlyConsumption[mar1Start + h] || 0;
      feb29Hours.push((feb28Hour + mar1Hour) / 2);
    }
    
    // Insert Feb 29 data
    normalized.splice(31 * 24 + 28 * 24, 0, ...feb29Hours);
    
    const msg = 'Padded consumption data with 24 hours for Feb 29 (averaged from Feb 28 and Mar 1)';
    warnings.push(msg);
    logWarn('normalizer', msg);
    
    return {
      normalized,
      corrections: {
        originalLength,
        targetLength,
        padded: true,
        trimmed: false,
        warnings
      }
    };
  }
  
  // Handle 8784 -> 8760 (remove Feb 29)
  if (originalLength === 8784 && targetLength === 8760) {
    const normalized = [...hourlyConsumption];
    
    // Feb 29 is at hour 1416-1439 (31 days in Jan * 24 + 28 days in Feb * 24)
    const feb29Start = 31 * 24 + 28 * 24;
    normalized.splice(feb29Start, 24);
    
    const msg = 'Removed 24 hours for Feb 29 from consumption data';
    warnings.push(msg);
    logWarn('normalizer', msg);
    
    return {
      normalized,
      corrections: {
        originalLength,
        targetLength,
        padded: false,
        trimmed: true,
        warnings
      }
    };
  }
  
  // Unexpected length mismatch
  throw new Error(
    `Cannot normalize consumption data: unexpected length ${originalLength}. ` +
    `Expected 8760 or 8784 hours. Target is ${targetLength}.`
  );
}
