import type {
  Financing,
  Grant,
  SensitivityAnalysis,
  SensitivityScenario,
  SensitivityVariant,
  SystemConfiguration,
  Tariff,
  TradingConfig
} from '../types';
import { distributeAnnualProductionTimeseries, type ParsedSolarData } from './solarTimeseriesParser';
import type { SimulationContext } from './simulationContext';
import { simulateHourlyEnergyFlow, type BatteryConfig } from './hourlyEnergyFlow';
import { estimateSystemCost } from './costEstimation';
import { calculateGrantAmount } from '../models/grants';
import { calculateLoanPayment, calculateIRR } from '../models/financial';
import { applyDegradation } from '../models/solar';

interface AnalysisContext {
  config: SystemConfiguration;
  grants: Grant[];
  financing: Financing;
  tariff: Tariff;
  trading: TradingConfig;
  simContext: SimulationContext;
  solarTimeseriesData: ParsedSolarData;
}

const ANALYSIS_YEARS = 25;

function computeScenarioMetrics(
  ctx: AnalysisContext,
  systemSizeKwp: number,
  annualGenerationKwh: number,
  batterySizeKwh: number,
  batteryFactor: 0 | 0.5 | 1.0 | 2.0
): SensitivityVariant {
  const { grants, financing, tariff, trading, simContext, solarTimeseriesData } = ctx;
  const { timeStamps, hourlyConsumption, hourlyPrices } = simContext;

  const mode = ctx.config.businessType === 'house' ? 'domestic' : 'commercial';
  const systemCost = estimateSystemCost(systemSizeKwp, batterySizeKwh, mode);
  const { totalGrant } = calculateGrantAmount(systemCost, grants, { systemSizeKwp });
  const netCost = Math.max(0, systemCost - totalGrant);

  // Equity is fixed; loan scales with project cost.
  const equityAmount = Math.max(0, financing.equity);
  const loanAmount = Math.max(0, netCost - equityAmount);
  const annualLoanPayment =
    financing.termYears > 0
      ? calculateLoanPayment(loanAmount, financing.interestRate, financing.termYears)
      : 0;

  const batteryConfig: BatteryConfig | undefined =
    batterySizeKwh > 0
      ? { capacityKwh: batterySizeKwh, efficiency: 0.9, initialSoC: 0 }
      : undefined;

  // Year 1 full hourly simulation
  const year1HourlyGeneration = distributeAnnualProductionTimeseries(
    annualGenerationKwh,
    solarTimeseriesData
  );
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

  const firstYearSavings = year1Result.totalSavings;
  const firstYearExportRevenue = year1Result.totalExportRevenue;
  const exportPaidFraction = year1Result.totalGridExport / (annualGenerationKwh || 1);
  const exportUnpaidFraction = year1Result.totalGridExportCurtailed / (annualGenerationKwh || 1);
  const spillageFraction = exportPaidFraction;

  // Roll up ANALYSIS_YEARS of cash flows using Year 1 savings + degradation
  // (same pattern as runCalculation — no re-simulation needed for years 2+)
  const grossCashFlows: number[] = []; // savings only, before loan — used for project IRR
  const netCashFlows: number[] = [];   // savings minus loan — used for Yr1/Yr10 display
  let cumulativeCashFlow = -equityAmount;

  for (let year = 1; year <= ANALYSIS_YEARS; year++) {
    const degradationFactor = applyDegradation(1, year - 1);
    const yearSavings = firstYearSavings * degradationFactor;
    const yearLoanPayment = year <= financing.termYears ? annualLoanPayment : 0;
    grossCashFlows.push(yearSavings);
    const netCashFlow = yearSavings - yearLoanPayment;
    netCashFlows.push(netCashFlow);
    if (year <= 10) cumulativeCashFlow += netCashFlow;
  }

  const year1NetCashFlow = netCashFlows[0];
  const year10NetCashFlow = cumulativeCashFlow; // cumulative through year 10 (from -equity)

  // Project IRR: return on total net capital invested (netCost), using gross savings.
  const irr = calculateIRR(netCost, grossCashFlows);

  return {
    batteryFactor,
    batterySizeKwh,
    systemCost,
    netCost,
    annualSavings: firstYearSavings,
    year1ExportRevenue: firstYearExportRevenue,
    annualGenerationKwh,
    equityAmount,
    annualLoanPayment,
    loanTermYears: financing.termYears,
    irr,
    year1NetCashFlow,
    year10NetCashFlow,
    spillageFraction,
    exportPaidFraction,
    exportUnpaidFraction,
  };
}


export function runSensitivityAnalysis(context: AnalysisContext): SensitivityAnalysis {
  const { config } = context;

  const scaleFactors = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0];

  const baseKwp =
    config.systemSizeKwp && config.systemSizeKwp > 0
      ? config.systemSizeKwp
      : config.annualProductionKwh / 950;

  // Base battery in kWh (fallback: 1 kWh/kWp)
  const baseBatteryKwhPerKwp =
    config.batterySizeKwh > 0 ? config.batterySizeKwh / baseKwp : 1.0;

  const rows: SensitivityScenario[] = scaleFactors.map((factor) => {
    const annualGenerationKwh = config.annualProductionKwh * factor;
    const systemSizeKwp = baseKwp * factor;

    // Full battery size for this system size
    const fullBatteryKwh = baseBatteryKwhPerKwp * systemSizeKwp;

    return {
      scaleFactor: factor,
      annualGenerationKwh,
      systemSizeKwp,
      noBattery: computeScenarioMetrics(
        context, systemSizeKwp, annualGenerationKwh, 0, 0
      ),
      halfBattery: computeScenarioMetrics(
        context, systemSizeKwp, annualGenerationKwh, fullBatteryKwh * 0.5, 0.5
      ),
      fullBattery: computeScenarioMetrics(
        context, systemSizeKwp, annualGenerationKwh, fullBatteryKwh, 1.0
      ),
      doubleBattery: computeScenarioMetrics(
        context, systemSizeKwp, annualGenerationKwh, fullBatteryKwh * 2, 2.0
      ),
    };
  });

  return {
    rows,
    note:
      'IRR is 25-year internal rate of return on equity. Battery sizes scale with system size. ' +
      'Click any cell to re-run the full simulation for that solar size and battery configuration.',
  };
}
