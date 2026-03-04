/**
 * Calendar and time constants.
 */

/**
 * Days per month for a standard (non-leap) year.
 */
export const DAYS_PER_MONTH_NON_LEAP = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Days per month for a leap year.
 */
export const DAYS_PER_MONTH_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Hours in a standard year.
 */
export const HOURS_PER_YEAR_NON_LEAP = 8760;

/**
 * Hours in a leap year.
 */
export const HOURS_PER_YEAR_LEAP = 8784;

/**
 * Half-hourly slots in a standard year (48 slots/day).
 */
export const SLOTS_PER_YEAR_NON_LEAP = 17520;

/**
 * Half-hourly slots in a leap year (48 slots/day).
 */
export const SLOTS_PER_YEAR_LEAP = 17568;

/**
 * Get days per month for a given year.
 */
export function getDaysPerMonth(year: number): readonly number[] {
  return isLeapYear(year) ? DAYS_PER_MONTH_LEAP : DAYS_PER_MONTH_NON_LEAP;
}

/**
 * Check if a year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Get expected hours for a year.
 */
export function getHoursForYear(year: number): number {
  return isLeapYear(year) ? HOURS_PER_YEAR_LEAP : HOURS_PER_YEAR_NON_LEAP;
}

/**
 * Get expected time slots for a year at a given resolution.
 * @param slotsPerDay 24 for hourly, 48 for half-hourly
 */
export function getSlotsForYear(year: number, slotsPerDay: 24 | 48 = 24): number {
  const days = isLeapYear(year) ? 366 : 365;
  return days * slotsPerDay;
}

/**
 * Get days per month given total slots in the year.
 * Accepts both hourly (8760/8784) and half-hourly (17520/17568) totals.
 */
export function getDaysPerMonthFromHours(totalSlotsInYear: number): readonly number[] {
  if (totalSlotsInYear === HOURS_PER_YEAR_LEAP || totalSlotsInYear === SLOTS_PER_YEAR_LEAP) {
    return DAYS_PER_MONTH_LEAP;
  }
  return DAYS_PER_MONTH_NON_LEAP;
}

/**
 * Derive slots-per-day from a total slot count.
 * > 10000 implies half-hourly (48), otherwise hourly (24).
 */
export function getSlotsPerDay(totalSlots: number): 24 | 48 {
  return totalSlots > 10000 ? 48 : 24;
}
