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
import { getTariffBucketKeys, normalizeSharesToOne } from './consumption';
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
  
  let annualSelfConsumption = 0;
  let annualExport = 0;
  let audit: CalculationResult['audit'] | undefined;
  
  if (useHourlySimulation) {
    // Use hour-by-hour simulation with solar timeseries data
    const timeStamps = solarTimeseriesData!.timesteps.map((ts) => ts.stamp);
    const hourlyGeneration = distributeAnnualProductionTimeseries(baseGeneration, solarTimeseriesData!);
    const hourlyConsumption = generateHourlyConsumption(monthlyConsumption, tariff, solarTimeseriesData!.timesteps.length, timeStamps);
    
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
      true,
      timeStamps
    );

    const hourly = baseYearElectricity.hourlyData ?? [];
    const monthlyRaw = aggregateHourlyResultsToMonthly(hourly, timeStamps);

    // Year 1 only: show monthly debt payments and "out of pocket / up".
    const monthlyDebtPayment = financing.termYears > 0 ? annualLoanPayment / 12 : 0;
    const monthly = monthlyRaw.map((m) => ({
      ...m,
      debtPayment: monthlyDebtPayment,
      netOutOfPocket: m.savings - monthlyDebtPayment
    }));

    // Add traceability fields to hourly rows.
    const stampedHourly = hourly.map((row, idx) => ({
      ...row,
      hourKey: solarTimeseriesData!.timesteps[idx]?.hourKey,
      monthIndex: solarTimeseriesData!.timesteps[idx]?.stamp.monthIndex,
      hourOfDay: solarTimeseriesData!.timesteps[idx]?.stamp.hour
    }));

    audit = {
      mode: 'hourly',
      year: solarTimeseriesData?.year,
      totalHours: solarTimeseriesData?.timesteps.length,
      hourly: stampedHourly,
      monthly,
      provenance: {
        hourlyDefinition:
          'Each row is one simulated hour (kWh + EUR) on a canonical hourly grid for the selected year. PV generation is distributed by irradiance weights; consumption is allocated hour-by-hour by tariff bucket hours; optional battery dispatch is applied.',
        monthlyAggregationDefinition:
          'Monthly figures are strict sums of hourly rows grouped by the canonical timestamp monthIndex. No independent monthly business calculations are performed.'
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
    const timeStamps = solarTimeseriesData.timesteps.map((ts) => ts.stamp);
    const hourlyGeneration = distributeAnnualProductionTimeseries(yearGeneration, solarTimeseriesData);
    const hourlyConsumption = generateHourlyConsumption(monthlyConsumption, tariff, solarTimeseriesData.timesteps.length, timeStamps);
    
    const batteryConfig: BatteryConfig | undefined = config.batterySizeKwh > 0 ? {
      capacityKwh: config.batterySizeKwh,
      efficiency: 0.9,
      initialSoC: 0
    } : undefined;
    
    const yearElectricity = simulateHourlyEnergyFlow(
      hourlyGeneration,
      hourlyConsumption,
      tariff,
      batteryConfig,
      false,
      timeStamps
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

