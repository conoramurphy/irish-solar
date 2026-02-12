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
import { normalizeConsumptionProfile } from './consumption';
import { generateHourlyConsumption } from './hourlyConsumption';
import { aggregateHourlyResultsToMonthly, simulateHourlyEnergyFlow, type BatteryConfig } from './hourlyEnergyFlow';
import { calculateTimeseriesWeights, distributeAnnualProductionTimeseries, type ParsedSolarData } from './solarTimeseriesParser';
import { buildSolarSpillageAnalysis } from './spillageAnalysis';
import { runSensitivityAnalysis } from './sensitivityAnalysis';
import { normalizePriceTimeseries, type ParsedPriceData } from './priceTimeseriesParser';

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
  solarTimeseriesData?: ParsedSolarData,
  priceTimeseriesData?: ParsedPriceData
): CalculationResult {
  const systemCost = Math.max(0, config.installationCost);

  const { totalGrant } = calculateGrantAmount(systemCost, grants, {
    systemSizeKwp: config.systemSizeKwp
  });
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

  // Normalize price timeseries if provided and trading enabled
  let hourlyPrices: number[] | undefined;
  if (trading.enabled && priceTimeseriesData) {
    // Normalize prices to match solar year
    const { normalized } = normalizePriceTimeseries(priceTimeseriesData, solarTimeseriesData.year);
    // Extract simple array
    hourlyPrices = normalized.timesteps.map(ts => ts.priceEur);
  }
  
  // Always use hourly simulation (audit mode)
  const useHourlySimulation = true;
  
  let annualSelfConsumption = 0;
  let annualExport = 0;
  let annualSolarToLoadSavings = 0;
  let annualBatteryToLoadSavings = 0;
  let annualExportRevenue = 0;

  let solarSpillageAnalysis: CalculationResult['solarSpillageAnalysis'] | undefined;
  let sensitivityAnalysisResult: CalculationResult['sensitivityAnalysis'] | undefined;
  let audit: CalculationResult['audit'] | undefined;
  
  // Year 1 variables for projection
  let year1ElectricitySavings = 0;
  let year1TradingRevenue = 0;
  
  if (useHourlySimulation) {
    // Use hour-by-hour simulation with solar timeseries data
    const timeStamps = solarTimeseriesData!.timesteps.map((ts) => ts.stamp);
    const hourlyGeneration = distributeAnnualProductionTimeseries(baseGeneration, solarTimeseriesData!);
    const hourlyConsumption = generateHourlyConsumption(monthlyConsumption, tariff, solarTimeseriesData!.timesteps.length, timeStamps);

    // Extra mini-analysis: solar-only spillage sensitivity (ignores batteries + € rates).
    // Uses the same hourly consumption profile + irradiance-derived weights.
    solarSpillageAnalysis = buildSolarSpillageAnalysis({
      currentAnnualGenerationKwh: baseGeneration,
      hourlyConsumptionKwh: hourlyConsumption,
      hourlyWeights: calculateTimeseriesWeights(solarTimeseriesData!),
      targetSpillageFraction: 0.3
    }) ?? undefined;

    // Full Sensitivity Analysis (Solar + Battery + Financials)
    // This provides the Year 1 Net Cash Flow heatmap
    sensitivityAnalysisResult = runSensitivityAnalysis({
      config,
      grants,
      financing,
      tariff,
      trading,
      consumptionProfile,
      solarTimeseriesData: solarTimeseriesData!,
      priceTimeseriesData
    });
    
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
      timeStamps,
      hourlyPrices,
      trading
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
    annualSolarToLoadSavings = baseYearElectricity.totalSolarToLoadSavings;
    annualBatteryToLoadSavings = baseYearElectricity.totalBatteryToLoadSavings;
    annualExportRevenue = baseYearElectricity.totalExportRevenue;
    
    // Store for projection
    year1ElectricitySavings = baseYearElectricity.totalSavings;
    
    if (!hourlyPrices && trading.enabled) {
        year1TradingRevenue = calculateTradingRevenue(trading, config.batterySizeKwh, 1);
    }
  }

  // 2. Project Cash Flows for Analysis Years (Fast Projection)
  const cashFlows: CalculationResult['cashFlows'] = [];
  let cumulativeCashFlow = -equityAmount;

  for (let year = 1; year <= analysisYears; year++) {
    // Apply degradation to generation-based value
    // We assume savings scale linearly with generation (approx correct for solar, less so for battery/arb but acceptable for projection)
    const degradationFactor = applyDegradation(1, year - 1);
    
    const yearGeneration = baseGeneration * degradationFactor;
    const yearSavings = (year1ElectricitySavings + year1TradingRevenue) * degradationFactor;
    
    const loanPayment = year <= financing.termYears ? annualLoanPayment : 0;

    const netCashFlow = yearSavings - loanPayment;
    cumulativeCashFlow += netCashFlow;

    cashFlows.push({
      year,
      generation: yearGeneration,
      savings: yearSavings,
      loanPayment,
      netCashFlow,
      cumulativeCashFlow
    });
  }

  const annualCashFlows = cashFlows.map((cf) => cf.netCashFlow);
  const annualSavings = cashFlows[0]?.savings ?? 0;

  // Add heuristic revenue to battery part if applicable
  // (Note: annualSavings from cashFlows already includes heuristicTradingRevenue via the loop logic)
  // We just need to ensure the breakdown sums up correctly.
  // annualSolarToLoadSavings + annualBatteryToLoadSavings + annualExportRevenue should approx equal annualSavings.
  
  // Calculate Year 1 heuristic trading revenue for the breakdown
  const year1HeuristicTradingRevenue = (!hourlyPrices && trading.enabled) 
    ? calculateTradingRevenue(trading, config.batterySizeKwh, 1) 
    : 0;

  const finalBatterySavings = annualBatteryToLoadSavings + year1HeuristicTradingRevenue;

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
    annualSolarToLoadSavings,
    annualBatteryToLoadSavings: finalBatterySavings,
    annualExportRevenue,
    simplePayback,
    npv,
    irr,
    cashFlows,
    solarSpillageAnalysis,
    sensitivityAnalysis: sensitivityAnalysisResult,
    audit
  };
}

