import type { HistoricalSolarData } from '../types';

/**
 * Solar generation model.
 *
 * Philosophy:
 * - Keep it simple + testable.
 * - Prefer historical-yield median if available (robust to outliers).
 * - Provide conservative fallback if no data.
 */

/**
 * Estimate annual generation (kWh/year).
 *
 * @param systemSizeKwp PV system size (kWp)
 * @param location key into `historicalData`
 * @param historicalData record keyed by location
 * @param useHistorical if false, always use fallback
 */
export function calculateAnnualGeneration(
  systemSizeKwp: number,
  location: string,
  historicalData: Record<string, HistoricalSolarData>,
  useHistorical = true
): number {
  if (!Number.isFinite(systemSizeKwp) || systemSizeKwp <= 0) return 0;

  if (useHistorical && historicalData[location]) {
    const data = historicalData[location];
    const yearlyTotals = data.yearlyTotals.map((y) => y.totalKwhKwp).filter(Number.isFinite);
    if (yearlyTotals.length > 0) {
      const median = calculateMedian(yearlyTotals);
      return systemSizeKwp * median;
    }
  }

  // Conservative Ireland-ish fallback (kWh per kWp per year)
  return systemSizeKwp * 950;
}

const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Estimate monthly generation (kWh/month) for Jan..Dec.
 *
 * If monthly averages are missing, returns a fixed fallback distribution.
 */
export function calculateMonthlyGeneration(
  systemSizeKwp: number,
  location: string,
  historicalData: Record<string, HistoricalSolarData>
): number[] {
  if (!Number.isFinite(systemSizeKwp) || systemSizeKwp <= 0) return Array(12).fill(0);

  const fallbackKwhPerKwp = [
    25, 45, 88, 125, 155, 160, 152, 130, 95, 58, 30, 20
  ];

  const data = historicalData[location];
  if (!data?.monthlyAverages) {
    return fallbackKwhPerKwp.map((v) => v * systemSizeKwp);
  }

  return MONTH_KEYS.map((k, idx) => {
    const month = data.monthlyAverages?.[k];
    const kwhPerKwp = month?.pvYield;
    const fallback = fallbackKwhPerKwp[idx] ?? 0;
    const kwhPerKwpSafe = typeof kwhPerKwp === 'number' && Number.isFinite(kwhPerKwp) ? kwhPerKwp : fallback;
    return kwhPerKwpSafe * systemSizeKwp;
  });
}

/**
 * Apply panel degradation to a base generation number.
 *
 * @param yearIndex 0-based year index (0 = no degradation)
 * @param degradationRate default 0.5%/year
 */
export function applyDegradation(generation: number, yearIndex: number, degradationRate = 0.005): number {
  if (!Number.isFinite(generation) || generation <= 0) return 0;
  if (!Number.isFinite(yearIndex) || yearIndex <= 0) return generation;
  return generation * Math.pow(1 - degradationRate, yearIndex);
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const p = Math.max(0, Math.min(100, percentile));
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
