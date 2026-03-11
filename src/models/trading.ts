import type { TradingConfig } from '../types';

export function calculateTradingRevenue(
  config: TradingConfig
): number {
  if (!config.enabled) return 0;
  if (typeof config.annualRevenue === 'number' && Number.isFinite(config.annualRevenue)) {
    return Math.max(0, config.annualRevenue);
  }
  return 0;
}
