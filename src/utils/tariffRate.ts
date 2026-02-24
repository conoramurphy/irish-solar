import type { Tariff, TimeWindow } from '../types';
import { getTariffBucketForHour } from './hourlyConsumption';
import { normalizeBucketKey } from './consumption';

/**
 * Check if hour falls within a time window.
 * Note: this is used for domestic tariff features like EV charging rates and free electricity.
 */
export function isHourInTimeWindow(
  hourOfDay: number,
  dayOfWeek: number | undefined,
  window: TimeWindow | undefined
): boolean {
  if (!window) return false;

  // Check day of week constraint if present
  if (window.daysOfWeek && window.daysOfWeek.length > 0) {
    if (dayOfWeek === undefined || !window.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }
  }

  // Check hour ranges if present
  if (window.hourRanges && window.hourRanges.length > 0) {
    return window.hourRanges.some((range) => {
      // Handle ranges that span midnight
      if (range.end <= range.start) {
        return hourOfDay >= range.start || hourOfDay < range.end;
      }
      return hourOfDay >= range.start && hourOfDay < range.end;
    });
  }

  // If no hour ranges specified, assume always applicable (given day constraint passed)
  return true;
}

/**
 * Get the base unit energy rate (EUR/kWh) for a given hour.
 * Supports domestic tariff features:
 * - free electricity windows (unit rate = 0)
 * - EV rate windows
 */
export function getTariffRateForHour(hourOfDay: number, tariff: Tariff, dayOfWeek?: number): number {
  // Check for free electricity window first (0 rate takes precedence)
  if (tariff.freeElectricityWindow && isHourInTimeWindow(hourOfDay, dayOfWeek, tariff.freeElectricityWindow)) {
    return 0;
  }

  // Check for EV rate window
  if (tariff.evRate !== undefined && tariff.evTimeWindow && isHourInTimeWindow(hourOfDay, dayOfWeek, tariff.evTimeWindow)) {
    return tariff.evRate;
  }

  // Fall back to standard tariff bucket lookup
  const bucket = getTariffBucketForHour(hourOfDay, tariff);
  const rate = tariff.rates.find((r) => normalizeBucketKey(r.period) === bucket);
  return rate?.rate || 0;
}

/**
 * Get the effective bucket label for a given hour.
 * This matches what customers think of as "rate periods" (e.g. ev/free/night/day/peak).
 */
export function getEffectiveTariffBucketForHour(hourOfDay: number, tariff: Tariff, dayOfWeek?: number): string {
  if (tariff.freeElectricityWindow && isHourInTimeWindow(hourOfDay, dayOfWeek, tariff.freeElectricityWindow)) {
    return 'free';
  }

  if (tariff.evRate !== undefined && tariff.evTimeWindow && isHourInTimeWindow(hourOfDay, dayOfWeek, tariff.evTimeWindow)) {
    return 'ev';
  }

  return getTariffBucketForHour(hourOfDay, tariff);
}
