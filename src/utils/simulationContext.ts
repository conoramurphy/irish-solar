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
import { normalizeHourlyConsumptionLength } from './hourlyConsumptionNormalizer';
import { logInfo } from './logger';

export interface ConsumptionNormalizationCorrections {
  originalLength: number;
  targetLength: number;
  padded: boolean;
  trimmed: boolean;
  warnings: string[];
}

export interface SimulationContext {
  /** 8760/8784 hourly timestamps */
  timeStamps: Array<{ year: number; monthIndex: number; day: number; hour: number }>;
  /** Hourly grid consumption (kWh) before solar */
  hourlyConsumption: number[];
  /** Hourly market prices (EUR/kWh) - already normalized and converted */
  hourlyPrices?: number[];
  /** Total solar hours (8760 or 8784) */
  totalHours: number;
  /** Whether consumption came from an imported hourly override or a derived monthly profile */
  consumptionSource: 'override' | 'monthly-profile';
  /** If consumption needed leap-year normalization */
  consumptionNormalization?: ConsumptionNormalizationCorrections;
  /** If prices were normalized and/or missing hours filled */
  priceNormalization?: import('./priceTimeseriesParser').PriceNormalizationCorrections;
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
  priceTimeseriesData?: ParsedPriceData,
  hourlyConsumptionOverride?: number[]
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
  let hourlyConsumption: number[];
  let consumptionSource: SimulationContext['consumptionSource'];
  let consumptionNormalization: SimulationContext['consumptionNormalization'];

  if (hourlyConsumptionOverride) {
    consumptionSource = 'override';

    // Use override if provided (Domestic Real Usage Mode)
    // Auto-normalize if there's a leap year mismatch
    if (hourlyConsumptionOverride.length !== totalHours) {
      const { normalized, corrections } = normalizeHourlyConsumptionLength(
        hourlyConsumptionOverride,
        totalHours
      );

      logInfo('simulation', 'Normalized consumption data to match solar timeseries', {
        from: corrections.originalLength,
        to: corrections.targetLength,
        padded: corrections.padded,
        trimmed: corrections.trimmed,
        warnings: corrections.warnings
      });

      hourlyConsumption = normalized;
      consumptionNormalization = {
        originalLength: corrections.originalLength,
        targetLength: corrections.targetLength,
        padded: corrections.padded,
        trimmed: corrections.trimmed,
        warnings: corrections.warnings
      };
    } else {
      hourlyConsumption = hourlyConsumptionOverride;
    }
  } else {
    consumptionSource = 'monthly-profile';

    // Generate from monthly profile (Commercial/Estimated Mode)
    const monthlyConsumption = normalizeConsumptionProfile(consumptionProfile, tariff);
    hourlyConsumption = generateHourlyConsumption(
      monthlyConsumption,
      tariff,
      totalHours,
      timeStamps,
      config.businessType
    );
  }

  // 2. Prepare Prices
  let hourlyPrices: number[] | undefined;
  let priceNormalization: SimulationContext['priceNormalization'];

  if (trading.enabled && priceTimeseriesData) {
    // Normalize prices to match solar year
    const { normalized, corrections } = normalizePriceTimeseries(priceTimeseriesData, solarTimeseriesData.year);
    priceNormalization = corrections;
    // Extract simple array AND convert MWh -> kWh
    hourlyPrices = normalized.timesteps.map((ts) => ts.priceEur / 1000);
  }

  return {
    timeStamps,
    hourlyConsumption,
    hourlyPrices,
    totalHours,
    consumptionSource,
    consumptionNormalization,
    priceNormalization
  };
}
