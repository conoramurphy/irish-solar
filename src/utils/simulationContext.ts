import type {
  ConsumptionProfile,
  SystemConfiguration,
  Tariff,
  TradingConfig
} from '../types';
import { normalizeConsumptionProfile } from './consumption';
import { generateHourlyConsumption } from './hourlyConsumption';
import { normalizePriceTimeseries, type ParsedPriceData } from './priceTimeseriesParser';
import { type ParsedSolarData, type SlotsPerDay } from './solarTimeseriesParser';
import { normalizeHourlyConsumptionLength } from './hourlyConsumptionNormalizer';
import { logInfo } from './logger';
import { stripVat, VAT_RATE_REDUCED } from './vat';

export interface ConsumptionNormalizationCorrections {
  originalLength: number;
  targetLength: number;
  padded: boolean;
  trimmed: boolean;
  warnings: string[];
}

export interface SimulationContext {
  /** Timestamps for each slot in the year */
  timeStamps: Array<{ year: number; monthIndex: number; day: number; hour: number; minute: number }>;
  /** Grid consumption (kWh) per slot before solar */
  hourlyConsumption: number[];
  /** Market prices (EUR/kWh) per slot - already normalized and converted */
  hourlyPrices?: number[];
  /** Total slots in year (8760/8784 hourly, or 17520/17568 half-hourly) */
  totalHours: number;
  /** Resolution: 24 = hourly, 48 = half-hourly */
  slotsPerDay: SlotsPerDay;
  /** Whether consumption came from an imported override or a derived monthly profile */
  consumptionSource: 'override' | 'monthly-profile';
  /** If consumption needed leap-year normalization */
  consumptionNormalization?: ConsumptionNormalizationCorrections;
  /** If prices were normalized and/or missing slots filled */
  priceNormalization?: import('./priceTimeseriesParser').PriceNormalizationCorrections;
  /** The tariff used for the simulation (potentially ex-VAT) */
  effectiveTariff: Tariff;
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
  const validLengths = [8760, 8784, 17520, 17568];
  if (!validLengths.includes(totalHours)) {
    throw new Error(
      `Solar timeseries must contain 8,760/8,784 (hourly) or 17,520/17,568 (half-hourly) timesteps. ` +
      `Received ${totalHours} timesteps.`
    );
  }
  const slotsPerDay = solarTimeseriesData.slotsPerDay;

  // 0. Adjust Tariff for VAT exclusion if requested
  // Businesses can often write off VAT on utilities (typically 13.5% in Ireland)
  let effectiveTariff = tariff;
  if (config.excludeVat && !tariff.isExVat) {
    effectiveTariff = {
      ...tariff,
      standingCharge: stripVat(tariff.standingCharge, VAT_RATE_REDUCED),
      psoLevy: tariff.psoLevy !== undefined ? stripVat(tariff.psoLevy, VAT_RATE_REDUCED) : undefined,
      rates: tariff.rates.map(r => ({
        ...r,
        rate: stripVat(r.rate, VAT_RATE_REDUCED)
      })),
      // Note: exportRate is usually not subject to VAT in the same way, 
      // but we'll keep it as is unless specified otherwise.
      isExVat: true
    };
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
    const monthlyConsumption = normalizeConsumptionProfile(consumptionProfile, effectiveTariff);
    hourlyConsumption = generateHourlyConsumption(
      monthlyConsumption,
      effectiveTariff,
      totalHours,
      timeStamps,
      config.businessType
    );
  }

  // 2. Prepare Prices
  let hourlyPrices: number[] | undefined;
  let priceNormalization: SimulationContext['priceNormalization'];

  if (trading.enabled && priceTimeseriesData) {
    // Normalize prices to match solar year and resolution
    const { normalized, corrections } = normalizePriceTimeseries(priceTimeseriesData, solarTimeseriesData.year, slotsPerDay);
    priceNormalization = corrections;
    // Extract simple array AND convert MWh -> kWh
    // Market prices are typically already ex-VAT
    hourlyPrices = normalized.timesteps.map((ts) => ts.priceEur / 1000);
  }

  return {
    timeStamps,
    hourlyConsumption,
    hourlyPrices,
    totalHours,
    slotsPerDay,
    consumptionSource,
    consumptionNormalization,
    priceNormalization,
    // Pass the effective tariff back if needed, but for now we just use it for generation
    effectiveTariff
  };
}
