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
import { calculateGrantAmount } from '../models/grants';
import { calculateLoanPayment } from '../models/financial';
import { aggregateHourlyResultsToMonthly, simulateHourlyEnergyFlow, type BatteryConfig } from './hourlyEnergyFlow';
import { calculateTimeseriesWeights, distributeAnnualProductionTimeseries, type ParsedSolarData } from './solarTimeseriesParser';
import { type ParsedPriceData } from './priceTimeseriesParser';
import { buildSolarSpillageAnalysis } from './spillageAnalysis';
import { runSensitivityAnalysis } from './sensitivityAnalysis';
import { prepareSimulationContext } from './simulationContext';
import { stripVat, VAT_RATE_REDUCED } from './vat';
import { projectCashFlows } from './exportRateProjection';
import type { PvgisProfileEntry } from './pvgisProfileLoader';
import { distributeProductionWithOrientation, getOrientationWeights } from './orientationWeights';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _historicalTariffs: HistoricalTariffData[] = [],
  analysisYears = 25,
  consumptionProfile?: ConsumptionProfile,
  solarTimeseriesData?: ParsedSolarData,
  priceTimeseriesData?: ParsedPriceData,
  hourlyConsumptionOverride?: number[],
  /** Pre-baked PVGIS profile for orientation-aware generation shape. When provided, replaces GHI-based weighting. */
  pvgisProfile?: PvgisProfileEntry
): CalculationResult {
  // Guard: Trading must not be enabled for house mode
  if (config.businessType === 'house' && trading.enabled) {
    throw new Error(
      'Trading cannot be enabled for house mode. ' +
      'Domestic customers use fixed tariffs and are not eligible for day-ahead market trading.'
    );
  }
  
  const systemCost = Math.max(0, config.installationCost);
  
  // If business is VAT-registered and excluding VAT, the "money at risk" is the ex-VAT cost.
  // We assume installationCost provided is gross (inc VAT) unless already ex-VAT.
  // For solar/batteries in Ireland, domestic is 0% (since May 2023) or 13.5%, 
  // but commercial is typically 23% or 13.5% depending on specific rules.
  // The UI Step4Finance handles the VAT rate selection. 
  // For simplicity in the engine, if excludeVat is true, we need to know what rate to strip.
  // We'll assume the standard 23% for commercial if not specified, but the plan says 
  // solar and batteries don't have standard vat on them (often 13.5% or 0%).
  // Let's use a heuristic: if it's commercial, it's likely 13.5% or 23%.
  // Actually, the UI saves the GROSS cost to config.installationCost.
  // We should probably pass the vatRate used in the UI to the engine, or just strip 13.5% as a safe default for solar.
  // Re-reading plan: "businesses can basically always write off VAT... solar and batteries don't have standard vat on them".
  // Let's assume 13.5% for stripping if excludeVat is true, unless we add vatRate to config.
  const effectiveSystemCost = config.excludeVat 
    ? stripVat(systemCost, VAT_RATE_REDUCED) 
    : systemCost;

  const annualConsumptionKwh =
    hourlyConsumptionOverride != null && hourlyConsumptionOverride.length > 0
      ? hourlyConsumptionOverride.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
      : consumptionProfile?.months?.length === 12
        ? consumptionProfile.months.reduce((s, m) => s + (m?.totalKwh ?? 0), 0)
        : undefined;

  const { totalGrant } = calculateGrantAmount(effectiveSystemCost, grants, {
    systemSizeKwp: config.systemSizeKwp,
    batterySizeKwh: config.batterySizeKwh,
    annualConsumptionKwh
  });
  const netCost = Math.max(0, effectiveSystemCost - totalGrant);

  const equityAmount = Math.max(0, financing.equity);
  const derivedLoanAmount = Math.max(0, netCost - equityAmount);
  const loanAmount = typeof financing.loanAmount === 'number' ? Math.max(0, financing.loanAmount) : derivedLoanAmount;

  const annualLoanPayment =
    financing.termYears > 0 ? calculateLoanPayment(loanAmount, financing.interestRate, financing.termYears) : 0;

  // Use the pre-calculated annual production directly
  const baseGeneration = config.annualProductionKwh;
  
  // REQUIRED: Solar timeseries data must be provided for audit mode
  if (!solarTimeseriesData) {
    throw new Error(
      'Solar timeseries data is required. The calculator now operates exclusively in "Audit Mode" ' +
      'which requires 8,760 hourly solar irradiance timesteps to ensure accurate hour-by-hour simulation. ' +
      'Please provide solar timeseries data for location: ' + config.location
    );
  }
  
  
  // Prepare simulation context (centralized logic)
  const simContext = prepareSimulationContext(
    config,
    tariff,
    trading,
    solarTimeseriesData,
    consumptionProfile,
    priceTimeseriesData,
    hourlyConsumptionOverride
  );

  const { timeStamps, hourlyConsumption, hourlyPrices, effectiveTariff } = simContext;

  const diagnosticsWarnings: string[] = [];

  if (simContext.consumptionNormalization?.warnings?.length) {
    for (const w of simContext.consumptionNormalization.warnings) {
      diagnosticsWarnings.push(`Consumption normalization: ${w}`);
    }
  }

  if (simContext.priceNormalization?.warnings?.length) {
    for (const w of simContext.priceNormalization.warnings) {
      diagnosticsWarnings.push(`Price normalization: ${w}`);
    }
  }

  if (solarTimeseriesData.totalIrradiance === 0) {
    diagnosticsWarnings.push(
      'Solar irradiance total is 0 for the selected timeseries. Annual PV production was distributed evenly across hours (no irradiance weighting).' 
    );
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
  const year1TradingRevenue = 0;
  
  if (useHourlySimulation) {
    // Use hour-by-hour simulation with solar timeseries data.
    // When a PVGIS orientation profile is provided, use it for the hourly shape
    // instead of the south-facing GHI weights.
    const hourlyGeneration = pvgisProfile
      ? distributeProductionWithOrientation(baseGeneration, pvgisProfile, solarTimeseriesData!.slotsPerDay)
      : distributeAnnualProductionTimeseries(baseGeneration, solarTimeseriesData!);

    // Spillage weights: orientation-aware if available, else GHI-based
    const spillageWeights = pvgisProfile
      ? getOrientationWeights(pvgisProfile, solarTimeseriesData!.slotsPerDay)
      : calculateTimeseriesWeights(solarTimeseriesData!);

    // Extra mini-analysis: solar-only spillage sensitivity (ignores batteries + € rates).
    // Uses the same hourly consumption profile + irradiance-derived weights.
    solarSpillageAnalysis = buildSolarSpillageAnalysis({
      currentAnnualGenerationKwh: baseGeneration,
      hourlyConsumptionKwh: hourlyConsumption,
      hourlyWeights: spillageWeights,
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
      simContext,
      solarTimeseriesData: solarTimeseriesData!,
      pvgisProfile,
    });
    
    const batteryConfig: BatteryConfig | undefined = config.batterySizeKwh > 0 ? {
      capacityKwh: config.batterySizeKwh,
      efficiency: 0.9,
      initialSoC: 0,
    } : undefined;
    
    const baseYearElectricity = simulateHourlyEnergyFlow(
      hourlyGeneration,
      hourlyConsumption,
      effectiveTariff,
      batteryConfig,
      true,
      timeStamps,
      hourlyPrices,
      trading,
      config.businessType === 'house', // Enable domestic optimization only for house mode
      config.gridExportCapKw           // Always pass export cap regardless of battery
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
    
  }

  // Calculate tax savings (ACA)
  // ACA is claimed on the capital cost net of grants.
  // It is a tax credit, effectively a cash inflow in Year 1 (or reduction in tax bill).
  const taxRate = financing.isTaxReliefEligible ? (financing.taxRate ?? 0) : 0;
  const year1TaxSavings = netCost * taxRate;

  const finalBatterySavings = annualBatteryToLoadSavings;

  const effectiveNetCost = netCost;
  const baseCalendarYear = solarTimeseriesData?.year ?? new Date().getFullYear();

  // 2. Project Cash Flows (with export rate decline applied by default)
  const projection = projectCashFlows({
    year1OperationalSavings: year1ElectricitySavings + year1TradingRevenue,
    year1ExportRevenue: annualExportRevenue,
    year1TaxSavings,
    baseGeneration,
    annualLoanPayment,
    loanTermYears: financing.termYears,
    equityAmount,
    effectiveNetCost,
    analysisYears,
    applyFutureRateChanges: true,
    baseCalendarYear,
  });

  const { cashFlows, simplePayback, npv, irr, annualSavings } = projection;

  const sampleCount = 100;

  const solarSample = solarTimeseriesData.timesteps.slice(0, sampleCount).map((ts) => ({
    hourKey: ts.hourKey,
    stamp: ts.stamp,
    irradianceWm2: ts.irradianceWm2,
    sourceIndex: ts.sourceIndex
  }));

  const consumptionSample =
    simContext.consumptionSource === 'override'
      ? hourlyConsumption.slice(0, sampleCount).map((kwh, idx) => ({
          hourKey: solarTimeseriesData.timesteps[idx]?.hourKey ?? String(idx),
          consumptionKwh: kwh
        }))
      : undefined;

  const pricesSample = hourlyPrices
    ? hourlyPrices.slice(0, sampleCount).map((eurPerKwh, idx) => ({
        hourKey: solarTimeseriesData.timesteps[idx]?.hourKey ?? String(idx),
        priceEurPerKwh: eurPerKwh
      }))
    : undefined;

  return {
    systemCost: effectiveSystemCost,
    netCost,
    annualGeneration: baseGeneration,
    annualSelfConsumption,
    annualExport,
    annualSavings,
    annualSolarToLoadSavings,
    annualBatteryToLoadSavings: finalBatterySavings,
    annualExportRevenue,
    year1TaxSavings,
    equityAmount,
    effectiveNetCost,
    simplePayback,
    npv,
    irr,
    cashFlows,
    solarSpillageAnalysis,
    sensitivityAnalysis: sensitivityAnalysisResult,
    audit,
    inputsUsed: {
      config: {
        annualProductionKwh: config.annualProductionKwh,
        numberOfPanels: config.numberOfPanels,
        systemSizeKwp: config.systemSizeKwp,
        batterySizeKwh: config.batterySizeKwh,
        gridExportCapKw: config.gridExportCapKw,
        installationCost: config.installationCost,
        location: config.location,
        businessType: config.businessType,
        excludeVat: config.excludeVat
      },
      tariff: {
        id: tariff.id,
        supplier: tariff.supplier,
        product: tariff.product,
        type: tariff.type,
        standingCharge: tariff.standingCharge,
        rates: tariff.rates,
        exportRate: tariff.exportRate,
        psoLevy: tariff.psoLevy,
        // Domestic optional fields (only present on some tariffs)
        flatRate: tariff.flatRate,
        nightRate: tariff.nightRate,
        peakRate: tariff.peakRate,
        evRate: tariff.evRate,
        evTimeWindow: tariff.evTimeWindow,
        freeElectricityWindow: tariff.freeElectricityWindow
      },
      financing,
      grants: grants.map((g) => ({ id: g.id, name: g.name, type: g.type })),
      trading,
      simulation: {
        year: solarTimeseriesData.year,
        totalHours: solarTimeseriesData.timesteps.length,
        consumptionSource: simContext.consumptionSource,
        marketPricesProvided: !!hourlyPrices
      },
      corrections: {
        consumption: simContext.consumptionNormalization,
        prices: simContext.priceNormalization
      },
      samples: {
        solar: solarSample,
        consumption: consumptionSample,
        prices: pricesSample
      }
    },
    diagnostics: {
      warnings: diagnosticsWarnings
    }
  };
}

