export function normalizeConsumptionProfile(
  profile: ConsumptionProfile | undefined,
  tariff: Tariff
): ConsumptionProfile {
  const bucketKeys = getTariffBucketKeys(tariff);

  const emptyMonths = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    totalKwh: 0,
    bucketShares: normalizeSharesToOne({}, bucketKeys)
  }));

  const months = (profile?.months ?? emptyMonths)
    .slice(0, 12)
    .map((m, idx) => {
      const monthIndex = typeof m?.monthIndex === 'number' ? m.monthIndex : idx;
      const totalKwh = typeof m?.totalKwh === 'number' && Number.isFinite(m.totalKwh) ? Math.max(0, m.totalKwh) : 0;
      const bucketShares = normalizeSharesToOne(m?.bucketShares ?? {}, bucketKeys);
      return { monthIndex, totalKwh, bucketShares };
    });

  // Ensure 12 months in order.
  const byIndex = new Map(months.map((m) => [m.monthIndex, m] as const));
  const full = Array.from({ length: 12 }, (_, monthIndex) =>
    byIndex.get(monthIndex) ?? {
      monthIndex,
      totalKwh: 0,
      bucketShares: normalizeSharesToOne({}, bucketKeys)
    }
  );

  return { months: full };
}

import type { ConsumptionProfile, MonthlyConsumption, Tariff, TariffBucketKey } from '../types';

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function normalizeBucketKey(period: string): TariffBucketKey {
  return String(period)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

export function getTariffBucketKeys(tariff: Tariff): TariffBucketKey[] {
  const keys = (tariff.rates ?? []).map((r) => normalizeBucketKey(r.period)).filter(Boolean);
  // Ensure uniqueness + stable order.
  return Array.from(new Set(keys));
}

export function makeDefaultBucketShares(bucketKeys: TariffBucketKey[]): Record<TariffBucketKey, number> {
  const keys = bucketKeys.filter(Boolean);
  if (keys.length === 0) return {};

  const has = (k: string) => keys.includes(k);

  // Preferred default: Day/Night/Peak if present.
  if (has('day') || has('night') || has('peak')) {
    const shares: Record<TariffBucketKey, number> = {};
    if (has('night')) shares.night = 0.35;
    if (has('peak')) shares.peak = 0.10;
    if (has('day')) shares.day = 0.55;

    // If some of these don't exist, distribute remaining across existing buckets.
    const existingKeys = keys;
    const assigned = Object.values(shares).reduce((s, v) => s + v, 0);
    const remainingKeys = existingKeys.filter((k) => !(k in shares));

    if (remainingKeys.length > 0) {
      const remaining = Math.max(0, 1 - assigned);
      const each = remaining / remainingKeys.length;
      for (const k of remainingKeys) shares[k] = each;
    }

    return normalizeSharesToOne(shares, keys);
  }

  // Otherwise, equal split.
  const equal = 1 / keys.length;
  const shares: Record<TariffBucketKey, number> = {};
  for (const k of keys) shares[k] = equal;
  return shares;
}

export function normalizeSharesToOne(
  shares: Record<TariffBucketKey, number>,
  bucketKeys: TariffBucketKey[]
): Record<TariffBucketKey, number> {
  const cleaned: Record<TariffBucketKey, number> = {};

  for (const k of bucketKeys) {
    const v = shares[k];
    cleaned[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  const sum = Object.values(cleaned).reduce((s, v) => s + v, 0);
  if (sum <= 0) {
    const equal = bucketKeys.length > 0 ? 1 / bucketKeys.length : 0;
    for (const k of bucketKeys) cleaned[k] = equal;
    return cleaned;
  }

  for (const k of bucketKeys) cleaned[k] = cleaned[k] / sum;
  return cleaned;
}

/**
 * Generate a smooth seasonal consumption curve from two user inputs:
 * - winterMonthlyKwh: higher month (typically Dec/Jan)
 * - summerMonthlyKwh: lower month (typically Jun/Jul)
 *
 * Uses a cosine curve so that:
 * - max is around Jan (index 0)
 * - min is around Jul (index 6)
 */
export function generateSeasonalMonthlyKwh(winterMonthlyKwh: number, summerMonthlyKwh: number): number[] {
  const w = Number.isFinite(winterMonthlyKwh) ? Math.max(0, winterMonthlyKwh) : 0;
  const s = Number.isFinite(summerMonthlyKwh) ? Math.max(0, summerMonthlyKwh) : 0;

  const avg = (w + s) / 2;
  const amp = (w - s) / 2;

  // monthIndex: 0..11 (Jan..Dec)
  // cos gives +1 at 0, -1 at pi => 6
  return Array.from({ length: 12 }, (_, i) => {
    const theta = (2 * Math.PI * i) / 12;
    const v = avg + amp * Math.cos(theta);
    // round to 1 decimal for UI stability
    return Math.max(0, Math.round(v * 10) / 10);
  });
}

export function buildConsumptionProfileFromSeasonalInputs(
  winterMonthlyKwh: number,
  summerMonthlyKwh: number,
  tariff: Tariff
): ConsumptionProfile {
  const bucketKeys = getTariffBucketKeys(tariff);
  const defaultShares = makeDefaultBucketShares(bucketKeys);
  const monthly = generateSeasonalMonthlyKwh(winterMonthlyKwh, summerMonthlyKwh);

  const months: MonthlyConsumption[] = monthly.map((kwh, monthIndex) => ({
    monthIndex,
    totalKwh: kwh,
    bucketShares: defaultShares
  }));

  return { months };
}
