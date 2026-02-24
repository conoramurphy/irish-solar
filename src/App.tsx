import { useEffect, useMemo, useState } from 'react';
import { endSpan, logError, logInfo, startSpan } from './utils/logger';
import rawGrantsData from './data/grants.json';
import rawTariffsData from './data/tariffs.json';
import domesticTariffsData from './data/domesticTariffs.json';
import rawHistoricalSolarData from './data/historical/solar-irradiance.json';
import rawHistoricalTariffData from './data/historical/tariff-history.json';
import { getEligibleGrants } from './models/grants';
import { runCalculation } from './utils/calculations';
import { getTariffBucketKeys, normalizeSharesToOne } from './utils/consumption';
import { aggregateToMonthly, distributeAnnualProductionTimeseries } from './utils/solarTimeseriesParser';
import type {
  // BusinessType, // Removed unused import
  CalculationResult,
  ConsumptionProfile,
  Financing,
  Grant,
  HistoricalSolarData,
  HistoricalTariffData,
  SystemConfiguration,
  Tariff,
  TradingConfig
} from './types';
import type { ParsedSolarData } from './utils/solarTimeseriesParser';
import type { ParsedPriceData } from './utils/priceTimeseriesParser';

import { CalendarSidebar } from './components/CalendarSidebar';
import { SavedReportsList } from './components/SavedReportsList';
import { useSavedReports } from './hooks/useSavedReports';
import type { SavedReport } from './types/savedReports';
import { Hero } from './components/Hero';
import { StepIndicator } from './components/StepIndicator';
import { Step0BuildingType } from './components/steps/Step0BuildingType';
import { Step1DigitalTwin } from './components/steps/Step1DigitalTwin';
import { Step2Solar } from './components/steps/Step2Solar';
import { Step3Battery } from './components/steps/Step3Battery';
import { Step4Finance } from './components/steps/Step4Finance';
import { ResultsSection } from './components/ResultsSection';
import { estimateAnnualBills } from './utils/billingCalculations';
import type { ExampleMonth, TariffConfiguration } from './types/billing';
import { loadSolarData } from './utils/solarDataLoader';
import { endSpan as endSolarSpan, logError as logSolarError, logInfo as logSolarInfo, logWarn, startSpan as startSolarSpan } from './utils/logger';
import { listSolarTimeseriesYears, normalizeSolarTimeseriesYear, type SolarNormalizationCorrections } from './utils/solarTimeseriesParser';
import type { BuildingTypeSelection } from './types';

const grantsData = rawGrantsData as unknown as Grant[];
const tariffsData = rawTariffsData as unknown as Tariff[];
const domesticTariffs = domesticTariffsData as Tariff[];
const historicalSolarData = rawHistoricalSolarData as unknown as Record<string, HistoricalSolarData>;
const historicalTariffData = rawHistoricalTariffData as unknown as HistoricalTariffData[];

function App() {
  // Saved Reports
  const { reports, saveReport, deleteReport, clearReports, importReports } = useSavedReports();
  const [showSavedReports, setShowSavedReports] = useState(false);

  // Building type selection (Step 0)
  const [, setBuildingTypeSelection] = useState<BuildingTypeSelection | null>(null);

  const [config, setConfig] = useState<SystemConfiguration>({
    annualProductionKwh: 0,
    batterySizeKwh: 0,
    installationCost: 0,
    location: '',
    businessType: 'hotel' // Updated by Step 0
  });

  // Billing profile from Step 1
  const [exampleMonths, setExampleMonths] = useState<ExampleMonth[]>([]);
  const [tariffConfig, setTariffConfig] = useState<TariffConfiguration | null>(null);
  const [curvedMonthlyKwh, setCurvedMonthlyKwh] = useState<number[]>([]);
  const [hourlyConsumptionOverride, setHourlyConsumptionOverride] = useState<number[] | undefined>(undefined);
  const [selectedDomesticTariff, setSelectedDomesticTariff] = useState<Tariff | undefined>(undefined);
  const [previousBusinessType, setPreviousBusinessType] = useState<SystemConfiguration['businessType']>(config.businessType);

  const [tariffId] = useState<string>(tariffsData[0]?.id ?? '');
  // Base tariff from database (used for defaults/fallbacks like export rates)
  const baseTariff: Tariff | undefined = useMemo(() => tariffsData.find((t) => t.id === tariffId), [tariffId]);

  // Effective tariff: combines base tariff defaults with user's Step 1 configuration
  const tariff: Tariff | undefined = useMemo(() => {
    // For domestic house mode, use selected domestic tariff if available
    if (config.businessType === 'house' && selectedDomesticTariff) {
      return selectedDomesticTariff;
    }
    
    if (!baseTariff) return undefined;
    if (!tariffConfig) return baseTariff;

    // 1. Flat Rate Override
    if (tariffConfig.type === 'flat' && tariffConfig.flatRate) {
      return {
        ...baseTariff,
        id: 'user-custom-flat',
        supplier: 'User Defined',
        product: 'Flat Rate',
        type: '24-hour',
        // Flat rate mode has no standing charge in input, but we preserve base or use 0?
        // Step 1 removed standing charge from flat mode UI.
        // If we want to strictly match "implied rate", we should arguably set standing charge to 0
        // and let the flat rate cover everything. Or keep it separate.
        // Given the user says "Total bill 9500", if we calculate rate = 9500/kwh, that rate is "all-inclusive".
        // So standing charge should be 0 to avoid double counting.
        standingCharge: 0,
        // User enters all-inclusive rates, so PSO levy should be 0 (already included in user's rates)
        psoLevy: 0,
        rates: [{ period: 'all-day', rate: tariffConfig.flatRate }]
      };
    }

    // 2. Custom Time-of-Use Override
    if (tariffConfig.type === 'custom' && tariffConfig.customSlots) {
      const customRates = tariffConfig.customSlots.map(slot => {
        // Convert integer hours (inclusive 0-23) to "HH:MM-HH:MM" range string (end exclusive)
        const start = slot.startHour.toString().padStart(2, '0') + ':00';
        let endH = slot.endHour + 1;
        // Handle 24:00 as 00:00 for the string format if needed, or 24:00 if parser supports it.
        // parseTimeRanges splits by :, parseInt. 24 is valid.
        const end = endH.toString().padStart(2, '0') + ':00';
        
        return {
          period: slot.id, // Use slot ID as period name (e.g. "slot-123")
          hours: `${start}-${end}`,
          rate: slot.ratePerKwh
        };
      });

      return {
        ...baseTariff,
        id: 'user-custom-tou',
        supplier: 'User Defined',
        product: 'Time-of-Use',
        type: 'time-of-use',
        // User enters €/day in UI. Tariff expects €/day.
        standingCharge: tariffConfig.standingChargePerDay ?? baseTariff.standingCharge,
        // User enters all-inclusive rates (€/kWh), so PSO levy should be 0 (already included in user's rates)
        psoLevy: 0,
        rates: customRates
      };
    }

    return baseTariff;
  }, [baseTariff, tariffConfig]);

  const eligibleGrants = useMemo(() => getEligibleGrants(config.businessType, grantsData), [config.businessType]);
  const [selectedGrantIds, setSelectedGrantIds] = useState<string[]>([]);

  const [financing, setFinancing] = useState<Financing>({
    equity: 0,
    interestRate: 0.05,
    termYears: 10
  });

  const [trading, setTrading] = useState<TradingConfig>({ enabled: false });
  const [priceTimeseriesData, setPriceTimeseriesData] = useState<ParsedPriceData | null>(null);

  
  // Estimated monthly bills (derived)
  const estimatedMonthlyBills = useMemo(() => {
    if (curvedMonthlyKwh.length !== 12) {
      return [];
    }
    
    // House mode: Calculate bills using selected domestic tariff
    if (config.businessType === 'house' && selectedDomesticTariff) {
      return curvedMonthlyKwh.map((monthKwh, monthIndex) => {
        // Get days in month
        const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIndex];
        
        // Standing charge cost
        const standingChargeCost = selectedDomesticTariff.standingCharge * daysInMonth;
        
        // Energy cost using flat rate (most domestic tariffs use this)
        // For simplicity, we'll use the first rate or flatRate if available
        const rate = selectedDomesticTariff.flatRate || 
                    (selectedDomesticTariff.rates[0]?.rate ?? 0.25);
        const energyCost = monthKwh * rate;
        
        // PSO levy if applicable
        const psoLevy = (selectedDomesticTariff.psoLevy || 0) * monthKwh;
        
        return standingChargeCost + energyCost + psoLevy;
      });
    }
    
    // Commercial mode: Use tariff configuration and example months
    if (!tariffConfig || exampleMonths.length === 0) {
      return [];
    }
    return estimateAnnualBills(curvedMonthlyKwh, tariffConfig, exampleMonths);
  }, [curvedMonthlyKwh, tariffConfig, exampleMonths, config.businessType, selectedDomesticTariff]);

  // Solar timeseries data - loaded in App when location is set in Step 1
  const [rawSolarData, setRawSolarData] = useState<ParsedSolarData | null>(null);
  const [solarTimeseriesData, setSolarTimeseriesData] = useState<ParsedSolarData | null>(null);
  const [solarNormalizationCorrections, setSolarNormalizationCorrections] = useState<SolarNormalizationCorrections | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [solarDataLoading, setSolarDataLoading] = useState(false);

  const monthlySolarGeneration = useMemo(() => {
    if (!solarTimeseriesData) return null;
    if (!config.annualProductionKwh || config.annualProductionKwh <= 0) return null;

    const hourly = distributeAnnualProductionTimeseries(config.annualProductionKwh, solarTimeseriesData);
    const months = aggregateToMonthly(hourly, solarTimeseriesData);
    return months.map((m) => m.productionKwh);
  }, [config.annualProductionKwh, solarTimeseriesData]);

  const bucketKeys = useMemo(() => (tariff ? getTariffBucketKeys(tariff) : []), [tariff]);

  const consumptionProfile: ConsumptionProfile = useMemo(() => {
    if (curvedMonthlyKwh.length !== 12) {
      // Fallback to empty profile
      return {
        months: Array.from({ length: 12 }, (_, monthIndex) => ({
          monthIndex,
          totalKwh: 0,
          bucketShares: {}
        }))
      };
    }

    const shares = bucketKeys.length > 0 
      ? normalizeSharesToOne({}, bucketKeys)
      : {};

    return {
      months: curvedMonthlyKwh.map((totalKwh, monthIndex) => ({
        monthIndex,
        totalKwh,
        bucketShares: shares
      }))
    };
  }, [curvedMonthlyKwh, bucketKeys]);

  const [standardResult, setStandardResult] = useState<CalculationResult | null>(null);
  const [marketResult, setMarketResult] = useState<CalculationResult | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Step management - starts at 0 (building type)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Steps for stepper (1-4, Step 0 not shown in stepper)
  const steps = [
    { id: 1, label: 'Consumption & Tariff' },
    { id: 2, label: 'Solar' },
    { id: 3, label: 'Battery & Market' },
    { id: 4, label: 'Finance' }
  ];

  const selectedGrants: Grant[] = useMemo(
    () => eligibleGrants.filter((g) => selectedGrantIds.includes(g.id)),
    [eligibleGrants, selectedGrantIds]
  );

  const handleCalculate = (configOverride?: SystemConfiguration) => {
    setCalculationError(null);
    setStandardResult(null);
    setMarketResult(null);
    const cfg = configOverride || config;

    // Fail fast on missing/invalid inputs (no silent fallbacks)
    if (!tariff) {
      setCalculationError('Tariff is missing. Please complete the Consumption & Tariff step.');
      return;
    }

    if (!solarTimeseriesData) {
      setCalculationError(
        `Solar timeseries data is missing for location "${cfg.location}". ` +
          'Please go back to the Solar step and ensure a valid timeseries year is selected.'
      );
      return;
    }

    if (!cfg.annualProductionKwh || cfg.annualProductionKwh <= 0) {
      setCalculationError('Annual solar production must be greater than 0.');
      return;
    }

    // Consumption must be provided either via an imported hourly override OR a non-zero monthly profile.
    if (hourlyConsumptionOverride) {
      const n = hourlyConsumptionOverride.length;
      if (n !== 8760 && n !== 8784) {
        setCalculationError(
          `Imported hourly consumption must have 8,760 or 8,784 hours. Received ${n}. ` +
            'Please re-import a full-year file.'
        );
        return;
      }
    } else {
      if (curvedMonthlyKwh.length !== 12) {
        setCalculationError('Monthly consumption profile is incomplete. Please finish the Consumption step.');
        return;
      }
      const annualConsumption = curvedMonthlyKwh.reduce((a, b) => a + b, 0);
      if (annualConsumption <= 0) {
        setCalculationError('Annual consumption must be greater than 0. Please review your Consumption inputs.');
        return;
      }
    }

    logInfo('ui', 'Generate report clicked', {
      currentStep,
      hasSolarTimeseries: !!solarTimeseriesData,
      hasConsumptionProfile: curvedMonthlyKwh.length === 12,
      isOverride: !!configOverride,
      marketRateEnabled: trading.enabled
    });

    // (Tariff guard moved to fail-fast validation above)

    const spanId = startSpan('engine', 'Run calculations', {
      analysisYears: 25,
      location: cfg.location,
      dual: trading.enabled && !!priceTimeseriesData
    });

    try {
      // Always run standard calculation (with tariff, no market prices)
      logInfo(
        'engine',
        'runCalculation (standard) start',
        {
          annualProductionKwh: cfg.annualProductionKwh,
          batterySizeKwh: cfg.batterySizeKwh,
          installationCost: cfg.installationCost,
          location: cfg.location,
          analysisYears: 25
        },
        { spanId }
      );

      const standardConfig: TradingConfig = { enabled: false };
      const standardBase = runCalculation(
        cfg,
        selectedGrants,
        financing,
        tariff,
        standardConfig,
        historicalSolarData as any,
        historicalTariffData as any,
        25,
        consumptionProfile,
        solarTimeseriesData || undefined,
        undefined, // No price data for standard
        hourlyConsumptionOverride
      );

      const standard: CalculationResult = {
        ...standardBase,
        audit: standardBase.audit
          ? {
              ...standardBase.audit,
              corrections: solarNormalizationCorrections ?? standardBase.audit.corrections
            }
          : standardBase.audit,
        inputsUsed: standardBase.inputsUsed
          ? {
              ...standardBase.inputsUsed,
              corrections: {
                ...(standardBase.inputsUsed.corrections ?? {}),
                solar: solarNormalizationCorrections ?? standardBase.inputsUsed.corrections?.solar
              }
            }
          : undefined,
        diagnostics: {
          warnings: [
            ...(standardBase.diagnostics?.warnings ?? []),
            ...(solarNormalizationCorrections?.warnings?.map((w) => `Solar timeseries: ${w}`) ?? [])
          ]
        }
      };

      setStandardResult(standard);
      logInfo(
        'engine',
        'runCalculation (standard) success',
        {
          annualGeneration: standard.annualGeneration,
          annualSavings: standard.annualSavings,
          audit: standard.audit ? { mode: standard.audit.mode, totalHours: standard.audit.totalHours } : null
        },
        { spanId }
      );

      if (standard.audit?.corrections?.warnings?.length) {
        logInfo('engine', 'Solar timeseries normalization warnings (standard)', standard.audit.corrections, { spanId });
      }

      // If market rate enabled and price data available, also run market calculation
      if (trading.enabled && priceTimeseriesData) {
        logInfo(
          'engine',
          'runCalculation (market) start',
          {
            annualProductionKwh: cfg.annualProductionKwh,
            batterySizeKwh: cfg.batterySizeKwh
          },
          { spanId }
        );

        const marketBase = runCalculation(
          cfg,
          selectedGrants,
          financing,
          tariff,
          trading,
          historicalSolarData as any,
          historicalTariffData as any,
          25,
          consumptionProfile,
          solarTimeseriesData || undefined,
          priceTimeseriesData,
          hourlyConsumptionOverride
        );

        const market: CalculationResult = {
          ...marketBase,
          audit: marketBase.audit
            ? {
                ...marketBase.audit,
                corrections: solarNormalizationCorrections ?? marketBase.audit.corrections
              }
            : marketBase.audit,
          inputsUsed: marketBase.inputsUsed
            ? {
                ...marketBase.inputsUsed,
                corrections: {
                  ...(marketBase.inputsUsed.corrections ?? {}),
                  solar: solarNormalizationCorrections ?? marketBase.inputsUsed.corrections?.solar
                }
              }
            : undefined,
          diagnostics: {
            warnings: [
              ...(marketBase.diagnostics?.warnings ?? []),
              ...(solarNormalizationCorrections?.warnings?.map((w) => `Solar timeseries: ${w}`) ?? [])
            ]
          }
        };

        setMarketResult(market);
        logInfo(
          'engine',
          'runCalculation (market) success',
          {
            annualGeneration: market.annualGeneration,
            annualSavings: market.annualSavings,
            audit: market.audit ? { mode: market.audit.mode, totalHours: market.audit.totalHours } : null
          },
          { spanId }
        );
      }

      endSpan(spanId, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Calculation failed.';
      setCalculationError(msg);
      logError('engine', 'runCalculation failed', { message: msg }, { spanId });
      endSpan(spanId, 'error', { message: msg });
    }
  };

  // Load solar data when location is set in Step 1
  useEffect(() => {
    if (!config.location) {
      setSolarTimeseriesData(null);
      setSolarNormalizationCorrections(null);
      return;
    }

    setSolarDataLoading(true);
    logSolarInfo('solar', 'Loading solar timeseries from location', { location: config.location });

    const year = 2020;
    loadSolarData(config.location, year)
      .then((parsed) => {
        logSolarInfo('solar', 'Loaded solar timeseries', { totalRows: parsed.timesteps.length, year: parsed.year });
        setRawSolarData(parsed);
        
        const years = listSolarTimeseriesYears(parsed);
        setAvailableYears(years);
        
        // Default to first available year if current selectedYear is invalid
        const defaultYear = years.length > 0 ? years[0] : year;
        if (!selectedYear || !years.includes(selectedYear)) {
          setSelectedYear(defaultYear);
        }
      })
      .catch((err) => {
        logSolarError('solar', 'Failed to load solar data', { error: String(err) });
        setRawSolarData(null);
        setSolarTimeseriesData(null);
        setSolarNormalizationCorrections(null);
        setAvailableYears([]);
      })
      .finally(() => setSolarDataLoading(false));
  }, [config.location]);

  // Normalize solar data when raw data or selected year changes
  useEffect(() => {
    if (!rawSolarData || !selectedYear) {
      setSolarTimeseriesData(null);
      setSolarNormalizationCorrections(null);
      return;
    }

    const spanId = startSolarSpan('solar', 'Solar normalization', { year: selectedYear, location: config.location });
    try {
      const norm = normalizeSolarTimeseriesYear(rawSolarData, selectedYear);
      logSolarInfo('solar', 'Normalized solar timeseries', norm.corrections, { spanId });
      if (norm.corrections.warnings.length) {
        logWarn('solar', 'Normalization warnings', norm.corrections, { spanId });
      }
      setSolarTimeseriesData(norm.normalized);
      setSolarNormalizationCorrections(norm.corrections);
      endSolarSpan(spanId, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Normalization failed';
      logSolarError('solar', 'Normalization failed', { message: msg }, { spanId });
      endSolarSpan(spanId, 'error', { message: msg });
      setSolarTimeseriesData(null);
      setSolarNormalizationCorrections(null);
    }
  }, [rawSolarData, selectedYear, config.location]);

  // Clear mode-specific state when businessType changes
  useEffect(() => {
    if (config.businessType !== previousBusinessType) {
      logInfo('ui', 'Business type changed, clearing mode-specific state', {
        from: previousBusinessType,
        to: config.businessType
      });
      
      // Clear state that's mode-specific
      if (config.businessType === 'house') {
        // Switching TO house mode: clear commercial data
        setExampleMonths([]);
        setTariffConfig(null);
      } else {
        // Switching FROM house mode: clear domestic data
        setHourlyConsumptionOverride(undefined);
        setSelectedDomesticTariff(undefined);
      }
      
      // Disable trading when switching to house mode
      if (config.businessType === 'house' && trading.enabled) {
        setTrading({ enabled: false });
        logInfo('ui', 'Disabled trading for house mode');
      }
      
      // Clear any calculation results
      setStandardResult(null);
      setMarketResult(null);
      
      setPreviousBusinessType(config.businessType);
    }
  }, [config.businessType, previousBusinessType, trading.enabled]);


  const handleNextStep = (step: number, data?: any) => {
    setCalculationError(null);
    logInfo('ui', `Step ${step} completed`, { step });

    if (step === 0 && data) {
      // Step 0: Building type selected
      setBuildingTypeSelection(data.buildingType);
      
      // Update config.businessType based on selection
      // Map 'hotel-year-round'/'hotel-seasonal' -> 'hotel', 'farm' -> 'farm', etc.
      let businessType: SystemConfiguration['businessType'] = 'hotel';
      if (data.buildingType === 'farm') {
        businessType = 'farm';
      } else if (data.buildingType === 'commercial') {
        businessType = 'commercial';
      } else if (data.buildingType === 'house') {
        businessType = 'house';
      }
      
      setConfig(prev => ({ ...prev, businessType }));
      
      setCompletedSteps(prev => new Set(prev).add(step));
      setCurrentStep(1);
      return;
    }

    if (step === 1 && data) {
      // Step 1: Digital Twin (location + consumption + tariff)
      setConfig({ ...config, location: data.location });
      setExampleMonths(data.exampleMonths);
      setCurvedMonthlyKwh(data.curvedMonthlyKwh);
      setTariffConfig(data.tariffConfig);
      
      // If we have an override (Domestic mode), store it.
      // If not, clear it so we don't accidentally carry it over if user switches type.
      setHourlyConsumptionOverride(data.hourlyConsumptionOverride);
      
      // Store selected domestic tariff if provided (house mode)
      if (data.selectedDomesticTariff) {
        setSelectedDomesticTariff(data.selectedDomesticTariff);
      } else {
        setSelectedDomesticTariff(undefined);
      }
      
      setCompletedSteps(prev => new Set(prev).add(step));
      setCurrentStep(2);
      return;
    }
    
    if (step === 2 && data?.solarData) {
      // Step 2: Solar - store solar data
      setSolarTimeseriesData(data.solarData);
      setSolarNormalizationCorrections(data.corrections ?? null);
      logInfo('solar', 'Solar timeseries stored from Step 2', {
        year: data.solarData.year,
        timesteps: data.solarData.timesteps?.length
      });
      setCompletedSteps(prev => new Set(prev).add(step));
      // Go to Step 3
      setCurrentStep(3);
      return;
    }

    if (step === 3) {
      // Step 3: Battery & Trading
      setCompletedSteps(prev => new Set(prev).add(step));
      setCurrentStep(4);
      return;
    }

    // Default: next step
    setCompletedSteps(prev => new Set(prev).add(step));
    setCurrentStep(step + 1);
  };

  const handleBackStep = () => {
    setCalculationError(null);
    if (currentStep === 1) {
      // Back to Step 0 (building type)
      setCurrentStep(0);
    } else if (currentStep === 4) {
      // Back from Step 4 -> Step 3
      setCurrentStep(3);
    } else {
      setCurrentStep(prev => Math.max(0, prev - 1));
    }
  };

  const handleLoadReport = (saved: SavedReport) => {
    setCalculationError(null);
    // 1. Restore all state
    setConfig(saved.config);
    setFinancing(saved.financing);
    setSelectedGrantIds(saved.selectedGrantIds);
    setTrading(saved.trading);
    // tariffId is stateful but derived from const in this MVP (only 1 tariff supported mostly), 
    // but if we had multiple tariffs we'd set it here.
    // setTariffId(saved.tariffId);

    setExampleMonths(saved.exampleMonths);
    setTariffConfig(saved.tariffConfig);
    setCurvedMonthlyKwh(saved.curvedMonthlyKwh);
    
    // Restore house mode data if available
    setHourlyConsumptionOverride(saved.hourlyConsumptionOverride);
    if (saved.selectedDomesticTariffId) {
      const found = domesticTariffs.find(t => t.id === saved.selectedDomesticTariffId);
      setSelectedDomesticTariff(found);
    } else {
      setSelectedDomesticTariff(undefined);
    }
    
    // estimatedMonthlyBills is derived, no need to set
    
    if (saved.selectedYear) {
      setSelectedYear(saved.selectedYear);
    }

    // 2. Close modal
    setShowSavedReports(false);

    // 3. Mark steps as complete
    setCompletedSteps(new Set([0, 1, 2, 3, 4]));
    
    // 4. Navigate to results or trigger calculation
    // Ideally we re-run the calculation to ensure freshness
    // But we need to wait for state updates? 
    // State updates are async. We can't call handleCalculate immediately with old state.
    // Option A: Just set result from saved snapshot (if available)
    if (saved.result) {
      setStandardResult(saved.result);
      setMarketResult(null); // Saved reports from before dual-calc don't have marketResult
    } else {
      // If no result snapshot, user has to click "Generate"
      setStandardResult(null);
      setMarketResult(null);
    }
    
    // 5. If we have a location, we need to ensure solar data loads.
    // The existing useEffect on config.location will trigger loadSolarData.
    // That's good.
    
    // 6. Go to last step (Finance) or results?
    // If we have a result, show it.
    // If not, go to Finance step.
    if (saved.result) {
        // Results are shown when result != null
        // And we scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        setCurrentStep(4);
    }

    logInfo('ui', 'Loaded saved report', { reportId: saved.id, name: saved.name });
  };

  const handleSaveReport = (name: string) => {
    if (!standardResult) return;

    saveReport({
        name,
        config,
        financing,
        selectedGrantIds,
        trading,
        tariffId,
        exampleMonths,
        tariffConfig,
        curvedMonthlyKwh,
        estimatedMonthlyBills,
        selectedYear,
        hourlyConsumptionOverride,
        selectedDomesticTariffId: selectedDomesticTariff?.id,
        result: standardResult // Snapshot (save standard result for now)
    });
    
    logInfo('ui', 'Saved report', { name });
  };

  const handleBackFromResults = () => {
    setStandardResult(null);
    setMarketResult(null);
    // Go back to the last step (Finance)
    setCurrentStep(4);
    // Ensure it's marked as completed so we can navigate freely
    setCompletedSteps(prev => new Set(prev).add(4));
  };

  return (
    <div className="min-h-screen bg-tines-light font-sans text-slate-600">
      <Hero />
      
      {/* Saved Reports Access */ }
      <div className="absolute top-4 right-4 z-30">
        <button
          onClick={() => setShowSavedReports(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/90 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm transition-colors border border-white/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
          </svg>
          Saved Reports
        </button>
      </div>

      <SavedReportsList
        isOpen={showSavedReports}
        reports={reports}
        onClose={() => setShowSavedReports(false)}
        onLoad={handleLoadReport}
        onDelete={deleteReport}
        onClearAll={clearReports}
        onImport={importReports}
      />

      <main className="mx-auto max-w-7xl px-6 py-10 -mt-10 relative z-20">
      {calculationError && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="font-semibold">Could not generate report</div>
          <div className="mt-1">{calculationError}</div>
        </div>
      )}
      {/* Step Indicator (hide on Step 0 and when report is generated) */}
        {!standardResult && currentStep > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 md:p-4 mb-6">
            <StepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
          </div>
        )}

        {/* Full-page report */}
        {standardResult ? (
          <div className="max-w-5xl mx-auto">
            <ResultsSection 
              standardResult={standardResult}
              marketResult={marketResult}
              config={config} 
              tariff={tariff}
              availableYears={availableYears}
              selectedYear={selectedYear}
              onSelectYear={(y) => {
                setSelectedYear(y);
              }}
              onSelectSimulation={(newKwh) => {
                if (config.annualProductionKwh <= 0) return;
                const ratio = newKwh / config.annualProductionKwh;
                
                const newConfig: SystemConfiguration = {
                  ...config,
                  annualProductionKwh: newKwh,
                  // Scale system size and cost linearly as a first-order approximation
                  systemSizeKwp: config.systemSizeKwp ? Number((config.systemSizeKwp * ratio).toFixed(1)) : undefined,
                  numberOfPanels: config.numberOfPanels ? Math.round(config.numberOfPanels * ratio) : undefined,
                  installationCost: Number((config.installationCost * ratio).toFixed(0))
                };
                
                setConfig(newConfig);
                handleCalculate(newConfig);
                
                // Scroll to top to show updated results
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onBack={handleBackFromResults}
              onSaveReport={handleSaveReport}
              existingReportNames={reports.map(r => r.name)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Step Content */}
            <div className="lg:col-span-7">
              {currentStep === 0 && (
                <Step0BuildingType onNext={(data) => handleNextStep(0, data)} />
              )}

              {currentStep === 1 && (
                <Step1DigitalTwin
                  businessType={config.businessType}
                  onNext={(data) => handleNextStep(1, data)}
                  onBack={handleBackStep}
                />
              )}

              {currentStep === 2 && (
                <Step2Solar
                  config={config}
                  setConfig={setConfig}
                  locationFromStep1={config.location}
                  solarData={solarTimeseriesData}
                  loading={solarDataLoading}
                  onNext={(data) => handleNextStep(2, data)}
                  onBack={handleBackStep}
                />
              )}

              {currentStep === 3 && (
                <Step3Battery
                  config={config}
                  setConfig={setConfig}
                  trading={trading}
                  setTrading={setTrading}
                  priceData={priceTimeseriesData}
                  setPriceData={setPriceTimeseriesData}
                  exampleMonths={exampleMonths}
                  annualConsumptionKwh={curvedMonthlyKwh.length === 12 ? curvedMonthlyKwh.reduce((a, b) => a + b, 0) : undefined}
                  onNext={() => handleNextStep(3)}
                  onBack={handleBackStep}
                />
              )}

              {currentStep === 4 && (
                <Step4Finance
                  config={config}
                  setConfig={setConfig}
                  eligibleGrants={eligibleGrants}
                  selectedGrantIds={selectedGrantIds}
                  setSelectedGrantIds={setSelectedGrantIds}
                  financing={financing}
                  setFinancing={setFinancing}
                  onGenerateReport={() => handleCalculate()}
                  onBack={handleBackStep}
                />
              )}
            </div>

            {/* Right Column: Permanent month-by-month calendar */}
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-8">
                <CalendarSidebar
                  months={Array.from({ length: 12 }, (_, monthIndex) => ({
                    monthIndex,
                    consumptionKwh: curvedMonthlyKwh.length === 12 ? curvedMonthlyKwh[monthIndex] : undefined,
                    estimatedBillEur: estimatedMonthlyBills.length === 12 ? estimatedMonthlyBills[monthIndex] : undefined,
                    solarGenerationKwh: monthlySolarGeneration?.length === 12 ? monthlySolarGeneration[monthIndex] : undefined
                  }))}
                  annualTotalBillEur={estimatedMonthlyBills.length === 12 ? estimatedMonthlyBills.reduce((a, b) => a + b, 0) : undefined}
                  annualTotalConsumptionKwh={curvedMonthlyKwh.length === 12 ? curvedMonthlyKwh.reduce((a, b) => a + b, 0) : undefined}
                  annualTotalSolarKwh={monthlySolarGeneration?.length === 12 ? monthlySolarGeneration.reduce((a, b) => a + b, 0) : undefined}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-20">
        <div className="mx-auto max-w-5xl px-6 text-center text-sm text-slate-400">
          <p className="mb-2">Solar & Battery ROI Calculator</p>
          <p>MVP calculator — assumptions are simplified (especially self-consumption and trading).</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
