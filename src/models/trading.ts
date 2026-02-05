import type { TradingConfig } from '../types';

export function calculateTradingRevenue(
  config: TradingConfig,
  batteryCapacityKwh: number,
  _year: number
): number {
  if (!config.enabled) return 0;
  if (typeof config.annualRevenue === 'number' && Number.isFinite(config.annualRevenue)) {
    return Math.max(0, config.annualRevenue);
  }

  // Very rough placeholder: treat kWh as a proxy for deliverable kW, which isn't strictly correct.
  // Adjust once you have a specific market product / dispatch assumption.
  const revenuePerKwhPerYear = 75;
  return Math.max(0, batteryCapacityKwh) * revenuePerKwhPerYear;
}
