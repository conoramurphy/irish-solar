import type {
  ConsumptionProfile,
  Financing,
  Grant,
  SensitivityAnalysis,
  SensitivityScenario,
  SystemConfiguration,
  Tariff,
  TradingConfig
} from '../types';
import { distributeAnnualProductionTimeseries, type ParsedSolarData } from './solarTimeseriesParser';
import { normalizePriceTimeseries, type ParsedPriceData } from './priceTimeseriesParser';
import { generateHourlyConsumption } from './hourlyConsumption';
import { simulateHourlyEnergyFlow, type BatteryConfig } from './hourlyEnergyFlow';
import { estimateSystemCost } from './costEstimation';
import { calculateGrantAmount } from '../models/grants';
import { calculateLoanPayment } from '../models/financial';
import { applyDegradation } from '../models/solar';
import { normalizeConsumptionProfile } from './consumption';

interface AnalysisContext {
  config: SystemConfiguration;
  grants: Grant[];
  financing: Financing;
  tariff: Tariff;
  trading: TradingConfig;
  consumptionProfile?: ConsumptionProfile;
  solarTimeseriesData: ParsedSolarData;
  priceTimeseriesData?: ParsedPriceData;
}

function computeScenarioMetrics(
  ctx: AnalysisContext,
  systemSizeKwp: number,
  annualGenerationKwh: number,
  batterySizeKwh: number
) {
  const {
    grants,
    financing,
    tariff,
    trading,
    consumptionProfile,
    solarTimeseriesData,
    priceTimeseriesData
  } = ctx;

  // 1. Financial Setup
  const systemCost = estimateSystemCost(systemSizeKwp, batterySizeKwh);
  const { totalGrant } = calculateGrantAmount(systemCost, grants, { systemSizeKwp });
  const netCost = Math.max(0, systemCost - totalGrant);
  
  const equityAmount = Math.max(0, financing.equity);
  // Assume equity is fixed cash available. If project scales up, loan scales up.
  const derivedLoanAmount = Math.max(0, netCost - equityAmount);
  // If user specified fixed loan amount, we probably should ignore it for sensitivity analysis 
  // and rely on (Cost - Equity), otherwise a fixed small loan would make large systems look impossible.
  // But let's respect the "derived" logic if loanAmount is not explicitly set in a way that overrides.
  // In `calculations.ts`, it says: `const loanAmount = typeof financing.loanAmount === 'number' ? ... : derived`.
  // Here we will force derived because we are changing the project size drastically.
  const loanAmount = derivedLoanAmount;

  const annualLoanPayment = financing.termYears > 0 
    ? calculateLoanPayment(loanAmount, financing.interestRate, financing.termYears) 
    : 0;

  // 2. Prepare Timesteps
  const timeStamps = solarTimeseriesData.timesteps.map((ts) => ts.stamp);
  
  // Normalize prices if needed
  let hourlyPrices: number[] | undefined;
  if (trading.enabled && priceTimeseriesData) {
    const { normalized } = normalizePriceTimeseries(priceTimeseriesData, solarTimeseriesData.year);
    hourlyPrices = normalized.timesteps.map(ts => ts.priceEur);
  }

  const monthlyConsumption = normalizeConsumptionProfile(consumptionProfile, tariff);
  // Hourly consumption is constant across years for this simplified analysis
  // (We ignore load growth/degrowth for now)
  const hourlyConsumption = generateHourlyConsumption(
    monthlyConsumption, 
    tariff, 
    solarTimeseriesData.timesteps.length, 
    timeStamps
  );

  const batteryConfig: BatteryConfig | undefined = batterySizeKwh > 0 ? {
    capacityKwh: batterySizeKwh,
    efficiency: 0.9,
    initialSoC: 0
  } : undefined;

  // let cumulativeCashFlow = -equityAmount;
  let firstYearSavings = 0;
  let firstYearSpillageFraction = 0;

  // 3. Simulate Year 1 Only
  const year1Generation = annualGenerationKwh;
  const year1HourlyGeneration = distributeAnnualProductionTimeseries(year1Generation, solarTimeseriesData);

  const year1Result = simulateHourlyEnergyFlow(
    year1HourlyGeneration,
    hourlyConsumption,
    tariff,
    batteryConfig,
    false,
    timeStamps,
    hourlyPrices,
    trading
  );

  firstYearSavings = year1Result.totalSavings;
  firstYearSpillageFraction = year1Result.totalGridExport / (year1Generation || 1);
  
  // Year 1 Net Cash Flow (ignoring loan for sensitivity comparison consistency? 
  // No, user asked for "profit loss", usually means Net Cash Flow including debt if applicable.
  // But debt depends on term. Let's include it.)
  const loanPayment = financing.termYears > 0 ? annualLoanPayment : 0;
  const netCashFlow = firstYearSavings - loanPayment;
  
  // Approximate 10-year cumulative cash flow
  // (Using the same degradation logic as calculations.ts)
  let cumulativeCashFlow10y = -equityAmount; // Start with negative equity
  
  for (let year = 1; year <= 10; year++) {
     const degradationFactor = applyDegradation(1, year - 1);
     const yearSavings = firstYearSavings * degradationFactor;
     const yearLoanPayment = year <= financing.termYears ? annualLoanPayment : 0;
     cumulativeCashFlow10y += (yearSavings - yearLoanPayment);
  }

  return {
    systemCost,
    netCost,
    annualSavings: firstYearSavings,
    year1NetCashFlow: netCashFlow,
    year10NetCashFlow: cumulativeCashFlow10y,
    spillageFraction: firstYearSpillageFraction
  };
}


export function runSensitivityAnalysis(context: AnalysisContext): SensitivityAnalysis {
  const { config } = context;
  
  // Scale factors to test
  const scaleFactors = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0];
  
  const baseKwp = config.systemSizeKwp && config.systemSizeKwp > 0 
    ? config.systemSizeKwp 
    : (config.annualProductionKwh / 950); // Fallback estimate

  const baseBattery = config.batterySizeKwh;

  const rows: SensitivityScenario[] = scaleFactors.map(factor => {
    const annualGenerationKwh = config.annualProductionKwh * factor;
    const systemSizeKwp = baseKwp * factor;

    // Case 1: No Battery
    const noBatteryMetrics = computeScenarioMetrics(
      context, 
      systemSizeKwp, 
      annualGenerationKwh, 
      0
    );

    // Case 2: With Battery
    // If base has battery, scale it.
    // If base has no battery, assume 1 kWh per 1 kWp.
    const targetBattery = baseBattery > 0 
      ? baseBattery * factor 
      : systemSizeKwp * 1.0; // 1 kWh per kWp default
      
    const withBatteryMetrics = computeScenarioMetrics(
      context, 
      systemSizeKwp, 
      annualGenerationKwh, 
      targetBattery
    );

    return {
      scaleFactor: factor,
      annualGenerationKwh,
      systemSizeKwp,
      noBattery: {
        batterySizeKwh: 0,
        ...noBatteryMetrics
      },
      withBattery: {
        batterySizeKwh: targetBattery,
        ...withBatteryMetrics
      }
    };
  });

  return {
    rows,
    note: 'Sensitivity analysis showing Year 1 Net Cash Flow and 10-Year Cumulative Cash Flow (Savings - Loan Payment) for various system sizes. "With Battery" assumes scaling existing battery or adding 1 kWh storage per 1 kWp solar.'
  };
}
