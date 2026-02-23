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
 * Month names.
 */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

/**
 * Hours in a standard year.
 */
export const HOURS_PER_YEAR_NON_LEAP = 8760;

/**
 * Hours in a leap year.
 */
export const HOURS_PER_YEAR_LEAP = 8784;

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
