/**
 * Converts a PVGIS hourly profile into generation weights compatible
 * with the existing simulation engine.
 *
 * Handles the hourly→half-hourly interpolation when CAMS data is 48 slots/day.
 */

import type { PvgisProfileEntry } from './pvgisProfileLoader';
import { HOURS_PER_YEAR } from './pvgisProfileLoader';
import type { SlotsPerDay } from './solarTimeseriesParser';

/**
 * Convert a PVGIS hourly profile (8760 values in watts) into normalised
 * generation weights that sum to 1.0.
 *
 * These weights replace the GHI-based weights from `calculateTimeseriesWeights()`
 * when an orientation is specified.
 */
export function pvgisProfileToWeights(profile: PvgisProfileEntry): number[] {
  const totalWatts = profile.hourlyWatts.reduce((s, w) => s + w, 0);
  if (totalWatts === 0) {
    // Uniform fallback (same as calculateTimeseriesWeights for zero-irradiance)
    const w = 1 / HOURS_PER_YEAR;
    return new Array(HOURS_PER_YEAR).fill(w);
  }
  const weights: number[] = new Array(HOURS_PER_YEAR);
  for (let i = 0; i < HOURS_PER_YEAR; i++) {
    weights[i] = profile.hourlyWatts[i] / totalWatts;
  }
  return weights;
}

/**
 * Interpolate 8760 hourly weights to 17520 half-hourly weights.
 *
 * For each pair of consecutive hours, inserts an interpolated midpoint.
 * The result sums to 1.0 (each original weight is split into two half-weights
 * plus the interpolation adjustment).
 */
export function interpolateToHalfHourly(hourlyWeights: number[]): number[] {
  const n = hourlyWeights.length; // 8760
  const halfHourly: number[] = new Array(n * 2);

  for (let i = 0; i < n; i++) {
    const curr = hourlyWeights[i];
    const next = hourlyWeights[(i + 1) % n]; // wrap last hour to first

    // Each hour contributes two half-hour slots:
    // :00 slot = average of (prev, curr), :30 slot = average of (curr, next)
    // But simpler: split the hour's weight proportionally.
    // The :00 slot gets weight proportional to curr blended with prev,
    // the :30 slot gets weight proportional to curr blended with next.
    const prev = hourlyWeights[(i - 1 + n) % n];
    const w00 = (prev + curr * 3) / 4;
    const w30 = (next + curr * 3) / 4;

    halfHourly[i * 2] = w00;
    halfHourly[i * 2 + 1] = w30;
  }

  // Renormalise to sum to 1.0
  const total = halfHourly.reduce((s, w) => s + w, 0);
  if (total > 0) {
    for (let i = 0; i < halfHourly.length; i++) {
      halfHourly[i] /= total;
    }
  }

  return halfHourly;
}

/**
 * Get orientation-aware generation weights at the correct resolution.
 *
 * @param profile - PVGIS profile for the selected orientation/tilt
 * @param slotsPerDay - 24 (hourly) or 48 (half-hourly), matching the CAMS data
 * @returns weights array of length 8760 or 17520, summing to 1.0
 */
export function getOrientationWeights(
  profile: PvgisProfileEntry,
  slotsPerDay: SlotsPerDay
): number[] {
  const hourlyWeights = pvgisProfileToWeights(profile);

  if (slotsPerDay === 24) {
    return hourlyWeights;
  }

  // Half-hourly: interpolate 8760 → 17520
  return interpolateToHalfHourly(hourlyWeights);
}

/**
 * Distribute annual production across timesteps using orientation-aware PVGIS weights.
 *
 * Drop-in replacement for `distributeAnnualProductionTimeseries()` when orientation is set.
 */
export function distributeProductionWithOrientation(
  annualProductionKwh: number,
  profile: PvgisProfileEntry,
  slotsPerDay: SlotsPerDay
): number[] {
  const weights = getOrientationWeights(profile, slotsPerDay);
  return weights.map(w => annualProductionKwh * w);
}
