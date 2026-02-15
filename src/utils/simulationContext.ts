import type {
  ConsumptionProfile,
  SystemConfiguration,
  Tariff,
  TradingConfig
} from '../types';
import { normalizeConsumptionProfile } from './consumption';
import { generateHourlyConsumption } from './hourlyConsumption';
import { normalizePriceTimeseries, type ParsedPriceData } from './priceTimeseriesParser';
import { type ParsedSolarData } from './solarTimeseriesParser';

export interface SimulationContext {
  /** 8760/8784 hourly timestamps */
  timeStamps: Array<{ year: number; monthIndex: number; day: number; hour: number }>;
  /** Hourly grid consumption (kWh) before solar */
  hourlyConsumption: number[];
  /** Hourly market prices (EUR/kWh) - already normalized and converted */
  hourlyPrices?: number[];
  /** Total solar hours (8760 or 8784) */
  totalHours: number;
}

/**
 * Prepares the shared context for simulations.
 * This centralizes the normalization of consumption, prices, and timestamps
 * so that the main calculation and sensitivity analysis usage the exact same inputs.
 */
export function prepareSimulationContext(
  config: SystemConfiguration,
  tariff: Tariff,
  trading: TradingConfig,
  solarTimeseriesData: ParsedSolarData,
  consumptionProfile?: ConsumptionProfile,
  priceTimeseriesData?: ParsedPriceData
): SimulationContext {
  const totalHours = solarTimeseriesData.timesteps.length;
  if (totalHours !== 8760 && totalHours !== 8784) {
    throw new Error(
      `Solar timeseries must contain exactly 8,760 (non-leap year) or 8,784 (leap year) hourly timesteps. ` +
      `Received ${totalHours} timesteps.`
    );
  }

  const timeStamps = solarTimeseriesData.timesteps.map((ts) => ts.stamp);

  // 1. Prepare Consumption
  const monthlyConsumption = normalizeConsumptionProfile(consumptionProfile, tariff);
  const hourlyConsumption = generateHourlyConsumption(
    monthlyConsumption,
    tariff,
    totalHours,
    timeStamps,
    config.businessType
  );

  // 2. Prepare Prices
  let hourlyPrices: number[] | undefined;
  if (trading.enabled && priceTimeseriesData) {
    // Normalize prices to match solar year
    const { normalized } = normalizePriceTimeseries(priceTimeseriesData, solarTimeseriesData.year);
    // Extract simple array AND convert MWh -> kWh
    hourlyPrices = normalized.timesteps.map(ts => ts.priceEur / 1000);
  }

  return {
    timeStamps,
    hourlyConsumption,
    hourlyPrices,
    totalHours
  };
}
