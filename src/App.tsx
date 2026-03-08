import { useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { SharedReportView } from './components/SharedReportView';
import { migrateReport } from './utils/migrateReport';
import { endSpan, logError, logInfo, startSpan } from './utils/logger';
import rawGrantsData from './data/grants.json';
import rawTariffsData from './data/tariffs.json';
import { domesticTariffs } from './utils/domesticTariffParser';
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
  TradingConfig,
  UploadSummary,
} from './types';
import type { ParsedSolarData } from './utils/solarTimeseriesParser';
import type { ParsedPriceData } from './utils/priceTimeseriesParser';

import { CalendarSidebar } from './components/CalendarSidebar';
import { SavedReportsList } from './components/SavedReportsList';
import { useSavedReports } from './hooks/useSavedReports';
import type { SavedReport } from './types/savedReports';
import { Landing } from './components/Landing';
import { UnifiedWizardBar } from './components/UnifiedWizardBar';

import { TariffModeller } from './components/TariffModeller';
import { Step0BuildingType } from './components/steps/Step0BuildingType';
import { Step1DigitalTwin } from './components/steps/Step1DigitalTwin';
import { Step2Solar } from './components/steps/Step2Solar';
import { Step3Battery } from './components/steps/Step3Battery';
import { Step4Finance } from './components/steps/Step4Finance';
import { ResultsSection } from './components/ResultsSection';
import type { ExampleMonth, TariffConfiguration } from './types/billing';
import { loadSolarData } from './utils/solarDataLoader';
import { endSpan as endSolarSpan, logError as logSolarError, logInfo as logSolarInfo, logWarn, startSpan as startSolarSpan } from './utils/logger';
import { listSolarTimeseriesYears, normalizeSolarTimeseriesYear, type SolarNormalizationCorrections } from './utils/solarTimeseriesParser';
import type { BuildingTypeSelection } from './types';

const grantsData = rawGrantsData as unknown as Grant[];
const tariffsData = rawTariffsData as unknown as Tariff[];
const historicalSolarData = rawHistoricalSolarData as unknown as Record<string, HistoricalSolarData>;
const historicalTariffData = rawHistoricalTariffData as unknown as HistoricalTariffData[];

type AppMode = 'solar-battery' | 'tariff' | null;

function WizardApp() {
  const [appMode, setAppMode] = useState<AppMode>(null);

  // Saved Reports (solar & battery mode only)
  const { reports, saveReport, deleteReport, clearReports, importReports } = useSavedReports();
  const [showSavedReports, setShowSavedReports] = useState(false);

  // Building type selection (Step 0)
  const [, setBuildingTypeSelection] = useState<BuildingTypeSelection | null>(null);

  const [config, setConfig] = useState<SystemConfiguration>({
    annualProductionKwh: 0,
    batterySizeKwh: 0,
    installationCost: 0,
    location: '',
    businessType: 'hotel'
  });

  // Billing profile from Step 1
  const [exampleMonths, setExampleMonths] = useState<ExampleMonth[]>([]);
  const [tariffConfig, setTariffConfig] = useState<TariffConfiguration | null>(null);
  const [curvedMonthlyKwh, setCurvedMonthlyKwh] = useState<number[]>([]);
  const [hourlyConsumptionOverride, setHourlyConsumptionOverride] = useState<number[] | undefined>(undefined);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | undefined>(undefined);
  const [selectedDomesticTariff, setSelectedDomesticTariff] = useState<Tariff | undefined>(undefined);
  const [previousBusinessType, setPreviousBusinessType] = useState<SystemConfiguration['businessType']>(config.businessType);
  const [isEditingReport, setIsEditingReport] = useState(false);

  const [tariffId] = useState<string>(tariffsData[0]?.id ?? '');
  // Base tariff from database (used for defaults/fallbacks like export rates)
  const baseTariff: Tariff | undefined = useMemo(() => tariffsData.find((t) => t.id === tariffId), [tariffId]);

  // Effective tariff: combines base tariff defaults with user's Step 1 configuration
  const tariff: Tariff | undefined = useMemo(() => {
    // If house mode OR using a preset tariff in other modes, use the selected tariff directly
    if (config.businessType === 'house' || (tariffConfig && tariffConfig.type === 'preset')) {
      if (selectedDomesticTariff) return selectedDomesticTariff;
    }
    
    if (!baseTariff) return undefined;
    if (!tariffConfig) return baseTariff;

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
    
    // Use selected tariff directly for house mode OR when using a preset tariff in other modes
    if (config.businessType === 'house' || (tariffConfig && tariffConfig.type === 'preset')) {
      if (selectedDomesticTariff) {
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
    }
    
    return [];
  }, [curvedMonthlyKwh, tariffConfig, config.businessType, selectedDomesticTariff]);

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
  const [tariffComparisonResults, setTariffComparisonResults] = useState<Array<{ tariff: Tariff; result: CalculationResult }> | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);

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
    setTariffComparisonResults(null);
    setIsEditingReport(false); // New report generated, no longer "editing"
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
      const validConsumptionLengths = [8760, 8784, 17520, 17568];
      if (!validConsumptionLengths.includes(n)) {
        setCalculationError(
          `Imported consumption must have 8,760/8,784 (hourly) or 17,520/17,568 (half-hourly) slots. Received ${n}. ` +
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

    setReportGenerating(true);
    const spanId = startSpan('engine', 'Run calculations', {
      analysisYears: 25,
      location: cfg.location,
      dual: trading.enabled && !!priceTimeseriesData
    });

    const runReport = () => {
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

      // Run tariff comparison: same system against every available business tariff
      const comparisonResults: Array<{ tariff: Tariff; result: CalculationResult }> = [];
      for (const compTariff of tariffsData) {
        try {
          const compBase = runCalculation(
            cfg,
            selectedGrants,
            financing,
            compTariff,
            { enabled: false },
            historicalSolarData as any,
            historicalTariffData as any,
            25,
            consumptionProfile,
            solarTimeseriesData || undefined,
            undefined,
            hourlyConsumptionOverride
          );
          comparisonResults.push({ tariff: compTariff, result: compBase });
        } catch (compErr) {
          logError('engine', 'Tariff comparison run failed', { tariffId: compTariff.id, error: String(compErr) });
        }
      }
      setTariffComparisonResults(comparisonResults);

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
    } finally {
      setReportGenerating(false);
    }
    };
    setTimeout(runReport, 0);
  };

  // Load solar data when location is set in Step 1
  useEffect(() => {
    if (!config.location) {
      setRawSolarData(null);
      setSolarTimeseriesData(null);
      setSolarNormalizationCorrections(null);
      setAvailableYears([]);
      return;
    }

    // Immediately clear stale data when location changes
    setRawSolarData(null);
    setSolarTimeseriesData(null);
    setSolarNormalizationCorrections(null);
    setAvailableYears([]);

    setSolarDataLoading(true);
    logSolarInfo('solar', 'Loading solar timeseries from location', { location: config.location });

    const year = 2020;
    loadSolarData(config.location, year)
      .then((parsed) => {
        logSolarInfo('solar', 'Loaded solar timeseries', { totalRows: parsed.timesteps.length, year: parsed.year });
        setRawSolarData(parsed);
        
        const years = listSolarTimeseriesYears(parsed);
        setAvailableYears(years);
        
        // Prefer 2024 if available, then most recent, then first
        const PREFERRED_YEAR = 2024;
        const defaultYear = years.length > 0
          ? (years.includes(PREFERRED_YEAR) ? PREFERRED_YEAR : years[years.length - 1])
          : year;
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
      // Map 'hotel-year-round' -> 'hotel', 'farm' -> 'farm', etc.
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
      // Only overwrite consumption data when fresh hourly data was parsed.
      // If the user navigated back without re-uploading, curvedMonthlyKwh is undefined —
      // preserve whatever App.tsx already has so the calculation can still proceed.
      if (data.curvedMonthlyKwh !== undefined) {
        setCurvedMonthlyKwh(data.curvedMonthlyKwh);
      }
      setTariffConfig(data.tariffConfig);
      
      // Only overwrite hourlyConsumptionOverride when fresh data is present.
      if (data.hourlyConsumptionOverride !== undefined) {
        setHourlyConsumptionOverride(data.hourlyConsumptionOverride);
      }
      setUploadSummary(data.uploadSummary);
      
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
    const report = migrateReport(saved as unknown as Record<string, unknown>);
    setCalculationError(null);
    setIsEditingReport(true); // Loading a report puts us in editing mode if we go back
    // 1. Restore all state
    setConfig(report.config);
    setFinancing(report.financing);
    setSelectedGrantIds(report.selectedGrantIds);
    setTrading(report.trading);
    // tariffId is stateful but derived from const in this MVP (only 1 tariff supported mostly), 
    // but if we had multiple tariffs we'd set it here.
    // setTariffId(report.tariffId);

    setExampleMonths(report.exampleMonths);
    setTariffConfig(report.tariffConfig);
    setCurvedMonthlyKwh(report.curvedMonthlyKwh);
    
    // Restore house mode data if available
    setHourlyConsumptionOverride(report.hourlyConsumptionOverride);
    if (report.selectedDomesticTariffId) {
      const found = domesticTariffs.find(t => t.id === report.selectedDomesticTariffId);
      setSelectedDomesticTariff(found);
    } else {
      setSelectedDomesticTariff(undefined);
    }
    
    // estimatedMonthlyBills is derived, no need to set
    
    if (report.selectedYear) {
      setSelectedYear(report.selectedYear);
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
    if (report.result) {
      setStandardResult(report.result);
      setMarketResult(null);
      setTariffComparisonResults(null); // Saved reports pre-date comparison feature
    } else {
      setStandardResult(null);
      setMarketResult(null);
      setTariffComparisonResults(null);
    }
    
    // 5. If we have a location, we need to ensure solar data loads.
    // The existing useEffect on config.location will trigger loadSolarData.
    // That's good.
    
    // 6. Go to last step (Finance) or results?
    // If we have a result, show it.
    // If not, go to Finance step.
    if (report.result) {
        // Results are shown when result != null
        // And we scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        setCurrentStep(4);
    }

    logInfo('ui', 'Loaded saved report', { reportId: report.id, name: report.name });
  };

  const handleSaveReport = (name: string) => {
    if (!standardResult) return;

    saveReport({
        name,
        schemaVersion: 1,
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

  const handleShareReport = async (): Promise<void> => {
    if (!standardResult) throw new Error('No result to share');

    const payload = {
      name: 'Solar ROI Report',
      schemaVersion: 1,
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
      result: standardResult,
    };

    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.name, report: payload }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { id } = await res.json() as { id: string };

    const url = `${window.location.origin}/r/${id}`;
    await navigator.clipboard.writeText(url);
    logInfo('ui', 'Shared report', { id, url });
  };

  const handleBackFromResults = () => {
    setStandardResult(null);
    setMarketResult(null);
    setTariffComparisonResults(null);
    setIsEditingReport(true);
    // Go back to the last step (Finance)
    setCurrentStep(4);
    // Ensure it's marked as completed so we can navigate freely
    setCompletedSteps(prev => new Set(prev).add(4));
  };

  const handleStartNewReport = () => {
    // Fully reset all state
    setAppMode('solar-battery');
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setStandardResult(null);
    setMarketResult(null);
    setTariffComparisonResults(null);
    setIsEditingReport(false);
    setCalculationError(null);
    
    // Reset inputs
    setConfig({
      annualProductionKwh: 0,
      batterySizeKwh: 0,
      installationCost: 0,
      location: '',
      businessType: 'hotel'
    });
    setExampleMonths([]);
    setTariffConfig(null);
    setCurvedMonthlyKwh([]);
    setHourlyConsumptionOverride(undefined);
    setUploadSummary(undefined);
    setSelectedDomesticTariff(undefined);
    setSelectedGrantIds([]);
    setFinancing({
      equity: 0,
      interestRate: 0.05,
      termYears: 10
    });
    setTrading({ enabled: false });
    setPriceTimeseriesData(null);
    setRawSolarData(null);
    setSolarTimeseriesData(null);
    setSolarNormalizationCorrections(null);
    setAvailableYears([]);
    setSelectedYear(undefined);
  };

  const showSolarBattery = appMode === 'solar-battery';

  return (
    <div className="min-h-screen font-sans text-slate-600 app-root">
      {appMode === null ? (
        <Landing
          onSelectSolarBattery={() => {
            setAppMode('solar-battery');
            setCurrentStep(0);
            setCompletedSteps(new Set());
            setStandardResult(null);
            setMarketResult(null);
          }}
          onSelectTariff={() => setAppMode('tariff')}
        />
      ) : (
        <UnifiedWizardBar
          appMode={appMode}
          onBack={() => {
            if (appMode === 'solar-battery' && currentStep > 0 && !standardResult) {
              handleBackStep();
            } else {
              setAppMode(null);
              setIsEditingReport(false);
            }
          }}
          onExit={() => {
            setAppMode(null);
            setIsEditingReport(false);
          }}
          onStartNew={handleStartNewReport}
          onRecalculate={handleCalculate}
          isEditing={isEditingReport}
          onOpenSavedReports={showSolarBattery ? () => setShowSavedReports(true) : undefined}
          showExit={appMode === 'solar-battery' && (currentStep > 0 || standardResult !== null)}
          steps={appMode === 'solar-battery' && currentStep > 0 && !standardResult ? steps : undefined}
          currentStep={currentStep > 0 && !standardResult ? currentStep : undefined}
          completedSteps={completedSteps}
        />
      )}

      {/* Saved Reports List Modal (solar & battery mode only) */}
      {showSolarBattery && (
        <SavedReportsList
            isOpen={showSavedReports}
            reports={reports}
            onClose={() => setShowSavedReports(false)}
            onLoad={handleLoadReport}
            onDelete={deleteReport}
            onClearAll={clearReports}
            onImport={importReports}
          />
      )}

      <main className="mx-auto max-w-7xl px-4 md:px-6 py-6 md:py-8 relative z-20">

        {appMode === 'tariff' && <TariffModeller />}

        {showSolarBattery && (
          <>
            {calculationError && (
              <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <div className="font-semibold">Could not generate report</div>
                <div className="mt-1">{calculationError}</div>
              </div>
            )}

            {/* Full-page report */}
            {standardResult ? (
              <div className="max-w-5xl mx-auto">
                <ResultsSection
                  standardResult={standardResult}
                  marketResult={marketResult}
                  tariffComparisonResults={tariffComparisonResults}
                  config={config}
                  tariff={tariff}
                  availableYears={availableYears}
                  selectedYear={selectedYear}
                  onSelectYear={(y) => {
                    setSelectedYear(y);
                  }}
                  onSelectSimulation={(newKwh, newBatterySizeKwh) => {
                    if (config.annualProductionKwh <= 0) return;
                    const ratio = newKwh / config.annualProductionKwh;

                    const newConfig: SystemConfiguration = {
                      ...config,
                      annualProductionKwh: newKwh,
                      // Scale system size and cost linearly as a first-order approximation
                      systemSizeKwp: config.systemSizeKwp ? Number((config.systemSizeKwp * ratio).toFixed(1)) : undefined,
                      numberOfPanels: config.numberOfPanels ? Math.round(config.numberOfPanels * ratio) : undefined,
                      installationCost: Number((config.installationCost * ratio).toFixed(0)),
                      // Override battery size if the clicked cell specifies one
                      ...(newBatterySizeKwh !== undefined ? { batterySizeKwh: newBatterySizeKwh } : {}),
                    };

                    setConfig(newConfig);
                    handleCalculate(newConfig);

                    // Scroll to top to show updated results
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onBack={handleBackFromResults}
                  onSaveReport={handleSaveReport}
                  existingReportNames={reports.map((r) => r.name)}
                  onShare={handleShareReport}
                />
              </div>
            ) : currentStep === 0 ? (
              /* Step 0: full-width building type selector, no calendar sidebar */
              <Step0BuildingType
                onNext={(data) => handleNextStep(0, data)}
                currentSelection={
                  completedSteps.has(0)
                    ? (config.businessType === 'hotel' ? 'hotel-year-round' : config.businessType as BuildingTypeSelection)
                    : null
                }
              />
            ) : (
              /* Steps 1–4: full-width, calendar table above stepper */
              <>
                {/* Compact monthly calendar table */}
                <div className="mb-4">
                  <CalendarSidebar
                    months={Array.from({ length: 12 }, (_, monthIndex) => ({
                      monthIndex,
                      consumptionKwh: curvedMonthlyKwh.length === 12 ? curvedMonthlyKwh[monthIndex] : undefined,
                      estimatedBillEur: estimatedMonthlyBills.length === 12 ? estimatedMonthlyBills[monthIndex] : undefined,
                      solarGenerationKwh:
                        monthlySolarGeneration?.length === 12 ? monthlySolarGeneration[monthIndex] : undefined
                    }))}
                    annualTotalBillEur={
                      estimatedMonthlyBills.length === 12 ? estimatedMonthlyBills.reduce((a, b) => a + b, 0) : undefined
                    }
                    annualTotalConsumptionKwh={
                      curvedMonthlyKwh.length === 12 ? curvedMonthlyKwh.reduce((a, b) => a + b, 0) : undefined
                    }
                    annualTotalSolarKwh={
                      monthlySolarGeneration?.length === 12 ? monthlySolarGeneration.reduce((a, b) => a + b, 0) : undefined
                    }
                  />
                </div>

                {/* Step Content — max-w constrained for comfortable reading */}
                <div className="max-w-3xl mx-auto w-full mt-6">
                  {currentStep === 1 && (
                    <Step1DigitalTwin
                      businessType={config.businessType}
                      onNext={(data) => handleNextStep(1, data)}
                      initialLocation={config.location}
                      initialTariffConfig={tariffConfig}
                      initialSelectedDomesticTariff={selectedDomesticTariff}
                      initialUploadSummary={uploadSummary}
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
                      initialCorrections={solarNormalizationCorrections}
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
                      annualConsumptionKwh={
                        curvedMonthlyKwh.length === 12 ? curvedMonthlyKwh.reduce((a, b) => a + b, 0) : undefined
                      }
                      onNext={() => handleNextStep(3)}
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
                      reportGenerating={reportGenerating}
                      annualConsumptionKwh={
                        curvedMonthlyKwh.length === 12
                          ? curvedMonthlyKwh.reduce((a, b) => a + b, 0)
                          : hourlyConsumptionOverride != null && hourlyConsumptionOverride.length > 0
                            ? hourlyConsumptionOverride.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
                            : undefined
                      }
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-20">
        <div className="mx-auto max-w-5xl px-6 text-center text-sm text-slate-400">
          <p className="mb-2 font-semibold tracking-widest uppercase">Watt Profit</p>
          <p>MVP calculator — assumptions are simplified (especially self-consumption and trading).</p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/r/:id/edit" element={<SharedReportView editMode />} />
      <Route path="/r/:id" element={<SharedReportView />} />
      <Route path="/*" element={<WizardApp />} />
    </Routes>
  );
}

export default App;
