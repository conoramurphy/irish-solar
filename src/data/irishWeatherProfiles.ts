/**
 * Irish weather profiles for heat pump modelling.
 *
 * Temperature data from Met Éireann 1991–2020 climate normals.
 * Used to generate half-hourly outdoor temperature estimates for COP calculations.
 */

/** Outdoor temperature above which space heating demand is assumed zero (°C) */
export const HEATING_CUTOFF_TEMP_C = 15.5;

/** Design outdoor temperature for Dublin/most of Ireland (°C) — used for design heat load */
export const DESIGN_OUTDOOR_TEMP_C = -3;

/**
 * Monthly mean temperatures (°C) by location, indexed 0=Jan … 11=Dec.
 * Source: Met Éireann 1991–2020 climate normals.
 */
const MONTHLY_MEAN_TEMPS_BY_LOCATION: Record<string, number[]> = {
  Dublin:  [7.1, 7.1, 8.6, 10.5, 13.3, 15.8, 17.8, 17.7, 15.3, 12.4,  9.0,  7.7],
  Cork:    [8.0, 8.0, 9.4, 11.2, 13.8, 16.1, 17.9, 17.8, 15.6, 12.9,  9.8,  8.4],
  Galway:  [7.4, 7.3, 8.8, 10.5, 13.1, 15.4, 17.2, 17.2, 15.0, 12.2,  9.1,  7.8],
  Donegal: [6.5, 6.5, 7.8,  9.5, 12.2, 14.5, 16.2, 16.3, 14.1, 11.3,  8.2,  7.0],
};

/**
 * Daily temperature amplitude (±°C from monthly mean) by month.
 * Sinusoidal variation: minimum at 06:00, maximum at 15:00.
 * Smaller swings in winter (maritime), larger in summer.
 */
const DAILY_AMPLITUDE_BY_MONTH: number[] = [
  2.5, 2.5, 3.0, 3.5, 4.0, 4.0, 4.0, 4.0, 3.5, 3.0, 2.5, 2.5,
];

/**
 * Returns the monthly mean temperature for a given location and month.
 * Falls back to Dublin if location is not recognised.
 */
export function getMonthlyMeanTemp(location: string, monthIndex: number): number {
  const temps = MONTHLY_MEAN_TEMPS_BY_LOCATION[location]
    ?? MONTHLY_MEAN_TEMPS_BY_LOCATION['Dublin'];
  return temps[monthIndex];
}

/**
 * Returns estimated outdoor temperature (°C) for a half-hourly slot.
 *
 * @param location  - Location name (e.g. 'Dublin', 'Cork'). Falls back to Dublin.
 * @param monthIndex - 0=Jan … 11=Dec
 * @param halfHourSlot - 0–47 within the day (slot 0 = 00:00–00:30, slot 12 = 06:00, slot 30 = 15:00)
 */
export function getHalfHourlyTemperature(
  location: string,
  monthIndex: number,
  halfHourSlot: number,
): number {
  const mean = getMonthlyMeanTemp(location, monthIndex);
  const amplitude = DAILY_AMPLITUDE_BY_MONTH[monthIndex];

  // Sinusoidal: min at slot 12 (06:00), max at slot 30 (15:00)
  // Phase offset: min is at angle π (slot 12 = 12/48 × 2π + phase)
  // T = mean - amplitude × cos(2π × (slot - 12) / 48)
  const phase = (halfHourSlot - 12) / 48;
  return mean - amplitude * Math.cos(2 * Math.PI * phase);
}

/**
 * Generates a full array of outdoor temperatures for a year.
 * Matches the half-hourly slot structure used throughout the simulation engine.
 *
 * @param location - Location name
 * @param year     - Calendar year (handles leap years: 17664 slots vs 17568)
 * @param monthIndexPerSlot - Array of month indices (0–11) for each slot in the year,
 *                            derived from the solar timeseries timestamps.
 *                            If omitted, uses a built-in calendar approximation.
 */
export function generateYearlyTemperatureProfile(
  location: string,
  year: number,
  monthIndexPerSlot?: number[],
): number[] {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalSlots = isLeap ? 17664 : 17568;

  if (monthIndexPerSlot) {
    return monthIndexPerSlot.map((monthIndex, slotIndex) => {
      const halfHourSlot = slotIndex % 48;
      return getHalfHourlyTemperature(location, monthIndex, halfHourSlot);
    });
  }

  // Built-in calendar: approximate cumulative days per month
  const daysInMonth = isLeap
    ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const result: number[] = [];
  for (let m = 0; m < 12; m++) {
    const slotsInMonth = daysInMonth[m] * 48;
    for (let s = 0; s < slotsInMonth; s++) {
      const halfHourSlot = s % 48;
      result.push(getHalfHourlyTemperature(location, m, halfHourSlot));
    }
  }

  // Pad or trim to exact slot count (floating-point calendar rounding)
  while (result.length < totalSlots) result.push(result[result.length - 1]);
  return result.slice(0, totalSlots);
}
