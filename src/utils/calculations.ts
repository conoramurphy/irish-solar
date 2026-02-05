import type {
  CalculationResult,
  ConsumptionProfile,
  Financing,
  Grant,
  HistoricalSolarData,
  HistoricalTariffData,
  SystemConfiguration,
  Tariff,
  TradingConfig
} from '../types';
import { applyDegradation } from '../models/solar';
import { calculateGrantAmount } from '../models/grants';
import { calculateTradingRevenue } from '../models/trading';
import { calculateIRR, calculateLoanPayment, calculateNPV, calculateSimplePayback } from '../models/financial';
import { getTariffBucketKeys, normalizeBucketKey, normalizeSharesToOne } from './consumption';
import { generateHourlyConsumption } from './hourlyConsumption';
import { aggregateHourlyResultsToMonthly, simulateHourlyEnergyFlow, type BatteryConfig } from './hourlyEnergyFlow';
import { distributeAnnualProductionTimeseries, type ParsedSolarData } from './solarTimeseriesParser';

/**
 * Run a full ROI calculation for a single scenario.
 *
 * This function intentionally avoids any "fancy battery" behavior.
 * Battery size influences results only via a heuristic self-consumption uplift.
 *
 * Design constraints:
 * - deterministic, pure (no I/O)
 * - easy to unit test
 * - explicit assumptions (discount rate, degradation, etc.)
 */
export function runCalculation(
  config: SystemConfiguration,
  grants: Grant[],
  financing: Financing,
  tariff: Tariff,
  trading: TradingConfig,
  _historicalSolar: Record<string, HistoricalSolarData>,
  historicalTariffs: HistoricalTariffData[] = [],
  analysisYears = 25,
  consumptionProfile?: ConsumptionProfile,
  solarTimeseriesData?: ParsedSolarData
): CalculationResult {
  const systemCost = Math.max(0, config.installationCost);

  const { totalGrant } = calculateGrantAmount(systemCost, grants);
  const netCost = Math.max(0, systemCost - totalGrant);

  const equityAmount = Math.max(0, financing.equity);
  const derivedLoanAmount = Math.max(0, netCost - equityAmount);
  const loanAmount = typeof financing.loanAmount === 'number' ? Math.max(0, financing.loanAmount) : derivedLoanAmount;

  const annualLoanPayment =
    financing.termYears > 0 ? calculateLoanPayment(loanAmount, financing.interestRate, financing.termYears) : 0;

  // Use the pre-calculated annual production directly
  const baseGeneration = config.annualProductionKwh;
  
  const monthlyConsumption = normalizeConsumptionProfile(consumptionProfile, tariff);
  
  // REQUIRED: Solar timeseries data must be provided for audit mode
  if (!solarTimeseriesData) {
    throw new Error(
      'Solar timeseries data is required. The calculator now operates exclusively in "Audit Mode" ' +
      'which requires 8,760 hourly solar irradiance timesteps to ensure accurate hour-by-hour simulation. ' +
      'Please provide solar timeseries data for location: ' + config.location
    );
  }
  
  const solarHours = solarTimeseriesData.timesteps.length;
  if (solarHours !== 8760 && solarHours !== 8784) {
    throw new Error(
      `Solar timeseries must contain exactly 8,760 (non-leap year) or 8,784 (leap year) hourly timesteps. ` +
      `Received ${solarHours} timesteps.`
    );
  }
  
  // Always use hourly simulation (audit mode)
  const useHourlySimulation = true;
  
  let annualSelfConsumption: number;
  let annualExport: number;
  let audit: CalculationResult['audit'] | undefined;
  
  if (useHourlySimulation) {
    // Use hour-by-hour simulation with solar timeseries data
    const hourlyGeneration = distributeAnnualProductionTimeseries(baseGeneration, solarTimeseriesData!);
    const hourlyConsumption = generateHourlyConsumption(monthlyConsumption, tariff, solarTimeseriesData!.timesteps.length);
    
    const batteryConfig: BatteryConfig | undefined = config.batterySizeKwh > 0 ? {
      capacityKwh: config.batterySizeKwh,
      efficiency: 0.9,
      initialSoC: 0
    } : undefined;
    
    const baseYearElectricity = simulateHourlyEnergyFlow(
      hourlyGeneration,
      hourlyConsumption,
      tariff,
      batteryConfig,
      true
    );

    const hourly = baseYearElectricity.hourlyData ?? [];
    const monthly = aggregateHourlyResultsToMonthly(hourly);

    audit = {
      mode: 'hourly',
      year: solarTimeseriesData?.year,
      hourly,
      monthly,
      provenance: {
        hourlyDefinition:
          'Each row is one simulated hour (kWh + EUR) computed from the annual PV production distributed by irradiance weights + hourly consumption allocation by tariff bucket hours + optional battery dispatch.',
        monthlyAggregationDefinition:
          'Monthly figures are strict sums of the hourly rows that fall within the month (by sequential hour index using fixed month lengths for a non-leap year). No independent monthly business calculations are performed.'
      }
    };

    annualSelfConsumption = baseYearElectricity.totalSelfConsumption;
    annualExport = baseYearElectricity.totalGridExport;
  }
  // Note: Monthly approximation fallback removed - audit mode is now mandatory

  const cashFlows: CalculationResult['cashFlows'] = [];
  let cumulativeCashFlow = -equityAmount;

  for (let year = 1; year <= analysisYears; year++) {
    const yearGeneration = applyDegradation(baseGeneration, year - 1);

    // TODO: once we implement tariff projection, use historicalTariffs here.
    void historicalTariffs;

    let electricitySavings: number;
    
    // Always use hourly simulation with degraded generation
    const hourlyGeneration = distributeAnnualProductionTimeseries(yearGeneration, solarTimeseriesData);
    const hourlyConsumption = generateHourlyConsumption(monthlyConsumption, tariff, solarTimeseriesData.timesteps.length);
    
    const batteryConfig: BatteryConfig | undefined = config.batterySizeKwh > 0 ? {
      capacityKwh: config.batterySizeKwh,
      efficiency: 0.9,
      initialSoC: 0
    } : undefined;
    
    const yearElectricity = simulateHourlyEnergyFlow(
      hourlyGeneration,
      hourlyConsumption,
      tariff,
      batteryConfig
    );
    electricitySavings = yearElectricity.totalSavings;

    const tradingRevenue = calculateTradingRevenue(trading, config.batterySizeKwh, year);

    const loanPayment = year <= financing.termYears ? annualLoanPayment : 0;

    const netCashFlow = electricitySavings + tradingRevenue - loanPayment;
    cumulativeCashFlow += netCashFlow;

    cashFlows.push({
      year,
      generation: yearGeneration,
      savings: electricitySavings + tradingRevenue,
      loanPayment,
      netCashFlow,
      cumulativeCashFlow
    });
  }

  const annualCashFlows = cashFlows.map((cf) => cf.netCashFlow);
  const annualSavings = cashFlows[0]?.savings ?? 0;

  const simplePayback = calculateSimplePayback(netCost, annualSavings);
  const npv = calculateNPV(equityAmount, annualCashFlows, 0.05);
  const irr = calculateIRR(equityAmount, annualCashFlows);

  return {
    systemCost,
    netCost,
    annualGeneration: baseGeneration,
    annualSelfConsumption,
    annualExport,
    annualSavings,
    simplePayback,
    npv,
    irr,
    cashFlows,
    audit
  };
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function normalizeConsumptionProfile(
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

function getTariffUnitRateByBucketKey(tariff: Tariff, bucketKey: string): number {
  const wanted = normalizeBucketKey(bucketKey);
  const rate = tariff.rates.find((r) => normalizeBucketKey(r.period) === wanted)?.rate;
  return typeof rate === 'number' && Number.isFinite(rate) ? rate : 0;
}

function calculateYearElectricity(
  consumption: ConsumptionProfile,
  monthlyGenerationKwh: number[],
  tariff: Tariff,
  batterySizeKwh: number
): {
  annualSavings: number;
  annualSelfConsumption: number;
  annualExport: number;
} {
  const bucketKeys = getTariffBucketKeys(tariff);
  const pso = typeof tariff.psoLevy === 'number' && Number.isFinite(tariff.psoLevy) ? tariff.psoLevy : 0;

  let annualSavings = 0;
  let annualSelfConsumption = 0;
  let annualExport = 0;

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = consumption.months[monthIndex];
    const days = DAYS_PER_MONTH[monthIndex] ?? 30;

    const totalConsumption = Math.max(0, month?.totalKwh ?? 0);
    const totalGeneration = Math.max(0, monthlyGenerationKwh[monthIndex] ?? 0);

    const shares = normalizeSharesToOne(month?.bucketShares ?? {}, bucketKeys);

    // Baseline: all consumption imported.
    const baselineStanding = tariff.standingCharge * days;
    const baselineUnits = bucketKeys.reduce((sum, k) => {
      const kwh = totalConsumption * (shares[k] ?? 0);
      const unitRate = getTariffUnitRateByBucketKey(tariff, k);
      return sum + kwh * (unitRate + pso);
    }, 0);
    const baselineCost = baselineStanding + baselineUnits;

    // With solar: PV offsets non-night buckets first (simplified).
    const nightKey = bucketKeys.find((k) => k === 'night');
    const dayishKeys = bucketKeys.filter((k) => k !== nightKey);

    const dayishShare = dayishKeys.reduce((s, k) => s + (shares[k] ?? 0), 0);
    const nightShare = nightKey ? shares[nightKey] ?? 0 : 0;

    const dayishConsumption = totalConsumption * dayishShare;
    const nightConsumption = totalConsumption * nightShare;

    const pvUsedOnDayish = Math.min(totalGeneration, dayishConsumption);
    const remainingPv = Math.max(0, totalGeneration - pvUsedOnDayish);

    // Simple battery behavior:
    // - if PV would otherwise be exported, assume the battery can capture some of it
    //   and use it to offset night imports.
    // - approximate monthly shift capacity as: batterySizeKwh * days * 0.8 (one cycle/day, 80% usable).
    const monthlyShiftCap = Math.max(0, batterySizeKwh) * days * 0.8;
    const batteryShiftToNight = Math.min(remainingPv, nightConsumption, monthlyShiftCap);

    const exported = Math.max(0, remainingPv - batteryShiftToNight);

    const dayishImports = Math.max(0, dayishConsumption - pvUsedOnDayish);
    const nightImports = Math.max(0, nightConsumption - batteryShiftToNight);

    // Allocate dayish imports back into dayish buckets proportionally.
    const dayishSharesNormalized = dayishKeys.length
      ? normalizeSharesToOne(
          Object.fromEntries(dayishKeys.map((k) => [k, shares[k] ?? 0])),
          dayishKeys
        )
      : {};

    const withSolarStanding = baselineStanding;
    const withSolarUnits = bucketKeys.reduce((sum, k) => {
      const unitRate = getTariffUnitRateByBucketKey(tariff, k);

      if (k === nightKey) {
        return sum + nightImports * (unitRate + pso);
      }

      const portion = dayishSharesNormalized[k] ?? 0;
      const bucketImport = dayishImports * portion;
      return sum + bucketImport * (unitRate + pso);
    }, 0);

    const withSolarCost = withSolarStanding + withSolarUnits;
    const exportRevenue = exported * tariff.exportRate;

    const savings = baselineCost - withSolarCost + exportRevenue;
    annualSavings += savings;

    const selfConsumed = Math.max(0, totalGeneration - exported);
    annualSelfConsumption += selfConsumed;
    annualExport += exported;
  }

  return { annualSavings, annualSelfConsumption, annualExport };
}
