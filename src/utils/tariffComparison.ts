import type { Tariff } from '../types';
import { simulateHourlyEnergyFlow } from './hourlyEnergyFlow';
import { buildCanonicalHourStampsForYear, expectedHoursInYear } from './solarTimeseriesParser';
import { getEffectiveTariffBucketForHour, getTariffRateForHour } from './tariffRate';

export interface TariffComparisonRow {
  tariff: Tariff;

  /** Sort key: estimated annual import bill (EUR), includes standing charges + PSO levy. */
  annualCostEur: number;

  /** Difference vs cheapest plan (EUR). */
  deltaVsBestEur: number;
  /** Difference vs cheapest plan (%). */
  deltaVsBestPct: number;

  /** Standing charge contribution over the year (EUR). */
  annualStandingEur: number;
  /** Energy portion only (EUR) => annualCost - standing. */
  annualEnergyEur: number;

  /** Total annual usage (kWh). */
  totalKwh: number;

  /** (annualEnergyEur / totalKwh). Includes PSO levy in the unit rate, excludes standing charges. */
  effectiveAllInImportRateEurPerKwh: number;

  /** Unit-rate stats over the hours where usage > 0. Includes PSO levy; excludes standing charges. */
  minUnitRate: number;
  maxUnitRate: number;
  rateSpread: number;
  distinctRateCount: number;

  /** Usage exposure to cheapest/most-expensive unit rates (kWh + fraction). */
  kwhAtCheapestRate: number;
  pctKwhAtCheapestRate: number;
  kwhAtMaxRate: number;
  pctKwhAtMaxRate: number;

  /** Usage grouped by effective bucket (ev/free/night/day/peak/etc.). */
  kwhByEffectiveBucket: Record<string, number>;

  hasEvWindow: boolean;
  hasFreeWindow: boolean;
}

export interface CompareDomesticTariffsInput {
  hourlyConsumption: number[];
  year: number;
  tariffs: Tariff[];
}

function safeNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function add(map: Record<string, number>, key: string, amount: number) {
  map[key] = (map[key] ?? 0) + amount;
}

function rateKey(rate: number): string {
  // Stabilize float keys for grouping distinct rates.
  return safeNumber(rate).toFixed(6);
}

export function compareDomesticTariffsForUsage(input: CompareDomesticTariffsInput): TariffComparisonRow[] {
  const { hourlyConsumption, year, tariffs } = input;

  const expectedHours = expectedHoursInYear(year);
  if (hourlyConsumption.length !== expectedHours) {
    throw new Error(
      `Hourly usage length (${hourlyConsumption.length}) does not match expected hours (${expectedHours}) for year ${year}.`
    );
  }

  const stamps = buildCanonicalHourStampsForYear(year);
  const zeros = new Array(hourlyConsumption.length).fill(0);

  const baseRows: Omit<TariffComparisonRow, 'deltaVsBestEur' | 'deltaVsBestPct'>[] = tariffs.map((tariff) => {
    // Authoritative annual cost via existing engine logic.
    const sim = simulateHourlyEnergyFlow(zeros, hourlyConsumption, tariff, undefined, false, stamps);
    const annualCostEur = safeNumber(sim.totalImportCost);

    const days = stamps.length / 24;
    const annualStandingEur = safeNumber(tariff.standingCharge) * days;
    const annualEnergyEur = annualCostEur - annualStandingEur;

    const totalKwh = hourlyConsumption.reduce((sum, kwh) => sum + Math.max(0, safeNumber(kwh)), 0);

    const pso = safeNumber(tariff.psoLevy);

    // Usage-weighted rate stats.
    const kwhByEffectiveBucket: Record<string, number> = {};
    const kwhByRate = new Map<string, { rate: number; kwh: number }>();

    for (let i = 0; i < hourlyConsumption.length; i++) {
      const kwh = Math.max(0, safeNumber(hourlyConsumption[i]));
      if (kwh <= 0) continue;

      const stamp = stamps[i]!;
      const hourOfDay = stamp.hour;
      // Match the existing engine's day-of-week logic (local time constructor).
      const dayOfWeek = new Date(stamp.year, stamp.monthIndex, stamp.day).getDay();

      const unitRateAllIn = getTariffRateForHour(hourOfDay, tariff, dayOfWeek) + pso;

      const bucket = getEffectiveTariffBucketForHour(hourOfDay, tariff, dayOfWeek);
      add(kwhByEffectiveBucket, bucket, kwh);

      const key = rateKey(unitRateAllIn);
      const existing = kwhByRate.get(key);
      if (existing) {
        existing.kwh += kwh;
      } else {
        kwhByRate.set(key, { rate: unitRateAllIn, kwh });
      }
    }

    let minUnitRate = Infinity;
    let maxUnitRate = -Infinity;
    for (const { rate } of kwhByRate.values()) {
      minUnitRate = Math.min(minUnitRate, rate);
      maxUnitRate = Math.max(maxUnitRate, rate);
    }

    if (!Number.isFinite(minUnitRate)) minUnitRate = 0;
    if (!Number.isFinite(maxUnitRate)) maxUnitRate = 0;

    const minKey = rateKey(minUnitRate);
    const maxKey = rateKey(maxUnitRate);

    const kwhAtCheapestRate = kwhByRate.get(minKey)?.kwh ?? 0;
    const kwhAtMaxRate = kwhByRate.get(maxKey)?.kwh ?? 0;

    const pctKwhAtCheapestRate = totalKwh > 0 ? kwhAtCheapestRate / totalKwh : 0;
    const pctKwhAtMaxRate = totalKwh > 0 ? kwhAtMaxRate / totalKwh : 0;

    const effectiveAllInImportRateEurPerKwh = totalKwh > 0 ? annualEnergyEur / totalKwh : 0;

    return {
      tariff,
      annualCostEur,
      annualStandingEur,
      annualEnergyEur,
      totalKwh,
      effectiveAllInImportRateEurPerKwh,
      minUnitRate,
      maxUnitRate,
      rateSpread: maxUnitRate - minUnitRate,
      distinctRateCount: kwhByRate.size,
      kwhAtCheapestRate,
      pctKwhAtCheapestRate,
      kwhAtMaxRate,
      pctKwhAtMaxRate,
      kwhByEffectiveBucket,
      hasEvWindow: !!(tariff.evRate !== undefined && tariff.evTimeWindow),
      hasFreeWindow: !!tariff.freeElectricityWindow
    };
  });

  const sorted = [...baseRows].sort((a, b) => a.annualCostEur - b.annualCostEur);
  const best = sorted[0]?.annualCostEur ?? 0;

  return sorted.map((row) => {
    const deltaVsBestEur = row.annualCostEur - best;
    const deltaVsBestPct = best > 0 ? deltaVsBestEur / best : 0;
    return { ...row, deltaVsBestEur, deltaVsBestPct };
  });
}
