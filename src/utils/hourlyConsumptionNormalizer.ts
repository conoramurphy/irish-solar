/**
 * Utility to normalize consumption data to match solar timeseries slot count.
 * 
 * Handles leap-year mismatches for both hourly (8760/8784) and
 * half-hourly (17520/17568) arrays.
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
 * Normalize a consumption array to match target slot count.
 * 
 * Supported transitions (hourly and half-hourly):
 *   8760  <-> 8784   (add/remove 24 slots  for Feb 29)
 *   17520 <-> 17568  (add/remove 48 slots  for Feb 29)
 * 
 * @param hourlyConsumption - Source consumption array (hourly or half-hourly)
 * @param targetLength - Target slot count
 */
export function normalizeHourlyConsumptionLength(
  hourlyConsumption: number[],
  targetLength: number
): NormalizeResult {
  const warnings: string[] = [];
  const originalLength = hourlyConsumption.length;
  
  if (originalLength === targetLength) {
    return {
      normalized: hourlyConsumption,
      corrections: { originalLength, targetLength, padded: false, trimmed: false, warnings: [] }
    };
  }

  // Derive slots-per-day from the larger of the two lengths so we cover both directions.
  const slotsPerDay: 24 | 48 = Math.max(originalLength, targetLength) > 10000 ? 48 : 24;
  const feb29Slots = slotsPerDay; // 24 or 48 slots to add/remove
  const feb29Start = (31 + 28) * slotsPerDay; // slot index where Feb 29 begins

  const nonLeapSlots = 365 * slotsPerDay;
  const leapSlots    = 366 * slotsPerDay;

  // Pad: non-leap -> leap  (8760->8784 or 17520->17568)
  if (originalLength === nonLeapSlots && targetLength === leapSlots) {
    const normalized = [...hourlyConsumption];

    const feb28Start = (31 + 27) * slotsPerDay; // first slot of Feb 28
    const mar1Start  = feb28Start + feb29Slots;  // first slot of Mar 1

    const feb29Pad: number[] = [];
    for (let s = 0; s < feb29Slots; s++) {
      const feb28Val = hourlyConsumption[feb28Start + s] ?? 0;
      const mar1Val  = hourlyConsumption[mar1Start  + s] ?? 0;
      feb29Pad.push((feb28Val + mar1Val) / 2);
    }

    normalized.splice(feb29Start, 0, ...feb29Pad);

    const msg = `Padded consumption with ${feb29Slots} slots for Feb 29 (averaged from Feb 28 and Mar 1)`;
    warnings.push(msg);
    logWarn('normalizer', msg);

    return {
      normalized,
      corrections: { originalLength, targetLength, padded: true, trimmed: false, warnings }
    };
  }

  // Trim: leap -> non-leap  (8784->8760 or 17568->17520)
  if (originalLength === leapSlots && targetLength === nonLeapSlots) {
    const normalized = [...hourlyConsumption];
    normalized.splice(feb29Start, feb29Slots);

    const msg = `Removed ${feb29Slots} slots for Feb 29 from consumption data`;
    warnings.push(msg);
    logWarn('normalizer', msg);

    return {
      normalized,
      corrections: { originalLength, targetLength, padded: false, trimmed: true, warnings }
    };
  }

  throw new Error(
    `Cannot normalize consumption data: unexpected length ${originalLength}. ` +
    `Supported lengths: 8760, 8784, 17520, 17568. Target is ${targetLength}.`
  );
}
