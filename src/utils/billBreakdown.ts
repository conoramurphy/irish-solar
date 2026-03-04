import type { HourlyEnergyFlow, Tariff } from '../types';
import { getEffectiveTariffBucketForHour, getTariffRateForHour } from './tariffRate';

export type BillBreakdownMode = 'baseline' | 'after';

export interface MonthlyBillBreakdown {
  monthIndex: number;
  /** EUR amounts by bucket, includes `standing` */
  eurByBucketBaseline: Record<string, number>;
  eurByBucketAfter: Record<string, number>;
  /** kWh amounts by bucket (standing excluded) */
  kwhByBucketBaseline: Record<string, number>;
  kwhByBucketAfter: Record<string, number>;
}

function safeNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseHourKey(hourKey: string | undefined): { year: number; monthIndex: number; day: number; hour: number } | null {
  if (!hourKey) return null;
  // Supports both YYYY-MM-DDTHH (legacy hourly) and YYYY-MM-DDTHH:MM (half-hourly)
  const m = hourKey.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  if (![year, monthIndex, day, hour].every(Number.isFinite)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day, hour };
}

function add(map: Record<string, number>, key: string, amount: number) {
  map[key] = (map[key] ?? 0) + amount;
}

/**
 * Compute a monthly bill breakdown by effective tariff bucket.
 *
 * - Baseline uses `consumption` (no solar)
 * - After uses `gridImport` (with solar/battery)
 * - Both include standing charges under the `standing` bucket.
 *
 * Notes:
 * - Export revenue is intentionally not included here (this is strictly the import bill side).
 * - EV/free windows are classified into `ev`/`free` buckets.
 */
export function calculateMonthlyBillBreakdown(hourly: HourlyEnergyFlow[], tariff: Tariff): MonthlyBillBreakdown[] {
  const months: MonthlyBillBreakdown[] = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    eurByBucketBaseline: { standing: 0 },
    eurByBucketAfter: { standing: 0 },
    kwhByBucketBaseline: {},
    kwhByBucketAfter: {}
  }));

  const slotsPerDay = hourly.length > 10000 ? 48 : 24;
  const standingPerHour = safeNumber(tariff.standingCharge) / slotsPerDay;
  const pso = safeNumber(tariff.psoLevy);

  for (const row of hourly) {
    const monthIndex =
      typeof row.monthIndex === 'number'
        ? row.monthIndex
        : parseHourKey(row.hourKey)?.monthIndex;

    if (typeof monthIndex !== 'number' || monthIndex < 0 || monthIndex > 11) continue;

    const hourOfDay =
      typeof row.hourOfDay === 'number'
        ? row.hourOfDay
        : parseHourKey(row.hourKey)?.hour;

    if (typeof hourOfDay !== 'number' || hourOfDay < 0 || hourOfDay > 23) continue;

    const parsed = parseHourKey(row.hourKey);
    const dayOfWeek = parsed ? new Date(parsed.year, parsed.monthIndex, parsed.day).getDay() : undefined;

    const bucket = getEffectiveTariffBucketForHour(hourOfDay, tariff, dayOfWeek);
    const unitRate = getTariffRateForHour(hourOfDay, tariff, dayOfWeek) + pso;

    const baselineKwh = Math.max(0, safeNumber(row.consumption));
    const afterKwh = Math.max(0, safeNumber(row.gridImport));

    // Standing charges apply regardless of usage
    add(months[monthIndex]!.eurByBucketBaseline, 'standing', standingPerHour);
    add(months[monthIndex]!.eurByBucketAfter, 'standing', standingPerHour);

    add(months[monthIndex]!.kwhByBucketBaseline, bucket, baselineKwh);
    add(months[monthIndex]!.kwhByBucketAfter, bucket, afterKwh);

    add(months[monthIndex]!.eurByBucketBaseline, bucket, baselineKwh * unitRate);
    add(months[monthIndex]!.eurByBucketAfter, bucket, afterKwh * unitRate);
  }

  return months;
}

export function sumAnnualByBucket(monthly: MonthlyBillBreakdown[], mode: BillBreakdownMode): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of monthly) {
    const src = mode === 'baseline' ? m.eurByBucketBaseline : m.eurByBucketAfter;
    for (const [k, v] of Object.entries(src)) {
      add(out, k, v);
    }
  }
  return out;
}

export function sumAnnualKwhByBucket(monthly: MonthlyBillBreakdown[], mode: BillBreakdownMode): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of monthly) {
    const src = mode === 'baseline' ? m.kwhByBucketBaseline : m.kwhByBucketAfter;
    for (const [k, v] of Object.entries(src)) {
      add(out, k, v);
    }
  }
  return out;
}
