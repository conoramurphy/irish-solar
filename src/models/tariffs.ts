import type { HistoricalTariffData, Tariff } from '../types';

/**
 * Tariff model.
 *
 * NOTE: This is deliberately simplified.
 * - For time-of-use tariffs we currently use an unweighted average import rate.
 * - Accurate TOU modeling would require an hourly load profile and dispatch model.
 */

/**
 * Total annual electricity cost (EUR/year) given annual consumption and a tariff.
 * Adds standing charges and (optionally) PSO levy as a per-kWh adder.
 */
export function calculateElectricityCost(
  consumptionKwh: number,
  tariff: Tariff,
  days = 365
): number {
  if (!Number.isFinite(consumptionKwh) || consumptionKwh <= 0) return tariff.standingCharge * days;

  const standingChargeCost = tariff.standingCharge * days;

  const unitRate = getAverageImportRate(tariff);
  const unitCost = consumptionKwh * unitRate;

  const psoCost = tariff.psoLevy ? consumptionKwh * tariff.psoLevy : 0;
  return standingChargeCost + unitCost + psoCost;
}

export function calculateSavings(selfConsumedKwh: number, exportedKwh: number, tariff: Tariff): number {
  const importSavings = Math.max(0, selfConsumedKwh) * getAverageImportRate(tariff);
  const exportRevenue = Math.max(0, exportedKwh) * tariff.exportRate;
  return importSavings + exportRevenue;
}

export function getAverageImportRate(tariff: Tariff): number {
  if (!tariff.rates?.length) return 0;
  if (tariff.type === '24-hour') return tariff.rates[0].rate;

  // Simplified: unweighted average.
  return tariff.rates.reduce((sum, r) => sum + r.rate, 0) / tariff.rates.length;
}

export function projectFutureTariffs(
  currentRate: number,
  historicalData: HistoricalTariffData | undefined,
  years: number,
  method: 'flat' | 'trend' | 'conservative' = 'trend'
): number[] {
  if (years <= 0) return [];

  if (method === 'flat') return Array(years).fill(currentRate);

  const history = historicalData?.history ?? [];
  if (history.length < 2) return Array(years).fill(currentRate);

  const first = history[0];
  const last = history[history.length - 1];

  const firstRate = first.unitRate;
  const lastRate = last.unitRate;

  // Compute duration in years from dates (more accurate than count).
  const t0 = Date.parse(first.effectiveDate);
  const t1 = Date.parse(last.effectiveDate);
  const yearsOfData = Math.max(1, (t1 - t0) / (1000 * 60 * 60 * 24 * 365.25));

  const cagr = Math.pow(lastRate / firstRate, 1 / yearsOfData) - 1;
  const growthRate = method === 'conservative' ? cagr * 0.75 : cagr;

  return Array.from({ length: years }, (_, i) => currentRate * Math.pow(1 + growthRate, i + 1));
}
