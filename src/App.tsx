import { useEffect, useMemo, useState } from 'react';
import { endSpan, logError, logInfo, startSpan } from './utils/logger';
import rawGrantsData from './data/grants.json';
import rawTariffsData from './data/tariffs.json';
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
import type { ExampleMonth, TariffConfiguration } from './types/billing';
import { loadSolarData } from './utils/solarDataLoader';
import { endSpan as endSolarSpan, logError as logSolarError, logInfo as logSolarInfo, logWarn, startSpan as startSolarSpan } from './utils/logger';
import { listSolarTimeseriesYears, normalizeSolarTimeseriesYear } from './utils/solarTimeseriesParser';
import type { BuildingTypeSelection } from './types';

const grantsData = rawGrantsData as unknown as Grant[];
const tariffsData = rawTariffsData as unknown as Tariff[];
const historicalSolarData = rawHistoricalSolarData as unknown as Record<string, HistoricalSolarData>;
const historicalTariffData = rawHistoricalTariffData as unknown as HistoricalTariffData[];

function App() {
  // Saved Reports
  const { reports, saveReport, deleteReport } = useSavedReports();
  const [showSavedReports, setShowSavedReports] = useState(false);

  // Building type selection (Step 0)
  const [, setBuildingTypeSelection] = useState<BuildingTypeSelection | null>(null);

  const [config, setConfig] = useState<SystemConfiguration>({
    annualProductionKwh: 22500,
    batterySizeKwh: 10,
    installationCost: 35000,
    location: '',
    businessType: 'hotel'
  });

  const [tariffId] = useState<string>(tariffsData[0]?.id ?? '');
  const tariff: Tariff | undefined = useMemo(() => tariffsData.find((t) => t.id === tariffId), [tariffId]);

  const eligibleGrants = useMemo(() => getEligibleGrants(config.businessType, grantsData), [config.businessType]);
  const [selectedGrantIds, setSelectedGrantIds] = useState<string[]>([]);

  const [financing, setFinancing] = useState<Financing>({
    equity: 15000,
    interestRate: 0.05,
    termYears: 10
  });

  const [trading, setTrading] = useState<TradingConfig>({ enabled: false });
  const [priceTimeseriesData, setPriceTimeseriesData] = useState<ParsedPriceData | null>(null);

  // Billing profile from Step 1
  const [, setExampleMonths] = useState<ExampleMonth[]>([]);
  const [, setTariffConfig] = useState<TariffConfiguration | null>(null);
  const [curvedMonthlyKwh, setCurvedMonthlyKwh] = useState<number[]>([]);
  const [estimatedMonthlyBills, setEstimatedMonthlyBills] = useState<number[]>([]);

  // Solar timeseries data - loaded in App when location is set in Step 1
  const [rawSolarData, setRawSolarData] = useState<ParsedSolarData | null>(null);
  const [solarTimeseriesData, setSolarTimeseriesData] = useState<ParsedSolarData | null>(null);
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

  const [result, setResult] = useState<CalculationResult | null>(null);

  // Step management - starts at 0 (building type)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Steps for stepper (1-4, Step 0 not shown in stepper)
  const steps = [
    { id: 1, label: 'Digital Twin' },
    { id: 2, label: 'Solar' },
    { id: 3, label: 'Batteries & Tariffs' },
    { id: 4, label: 'Finance' }
  ];

  const selectedGrants: Grant[] = useMemo(
    () => eligibleGrants.filter((g) => selectedGrantIds.includes(g.id)),
    [eligibleGrants, selectedGrantIds]
  );

  const handleCalculate = (configOverride?: SystemConfiguration) => {
    setResult(null);
    const cfg = configOverride || config;

    logInfo('ui', 'Generate report clicked', {
      currentStep,
      hasSolarTimeseries: !!solarTimeseriesData,
      hasConsumptionProfile: curvedMonthlyKwh.length === 12,
      isOverride: !!configOverride
    });

    if (!tariff) {
      logError('ui', 'Tariff missing when generating report');
      return;
    }

    const spanId = startSpan('engine', 'Run calculation', {
      analysisYears: 25,
      location: cfg.location
    });

    try {
      logInfo(
        'engine',
        'runCalculation start',
        {
          annualProductionKwh: cfg.annualProductionKwh,
          batterySizeKwh: cfg.batterySizeKwh,
          installationCost: cfg.installationCost,
          location: cfg.location,
          analysisYears: 25
        },
        { spanId }
      );

      const r = runCalculation(
        cfg,
        selectedGrants,
        financing,
        tariff,
        trading,
        historicalSolarData as any,
        historicalTariffData as any,
        25,
        consumptionProfile,
        solarTimeseriesData || undefined
      );
      setResult(r);
      logInfo(
        'engine',
        'runCalculation success',
        {
          annualGeneration: r.annualGeneration,
          annualSavings: r.annualSavings,
          audit: r.audit ? { mode: r.audit.mode, totalHours: r.audit.totalHours } : null
        },
        { spanId }
      );

      if (r.audit?.corrections?.warnings?.length) {
        logInfo('engine', 'Solar timeseries normalization warnings', r.audit.corrections, { spanId });
      }

      endSpan(spanId, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Calculation failed.';
      logError('engine', 'runCalculation failed', { message: msg }, { spanId });
      endSpan(spanId, 'error', { message: msg });
    }
  };

  // Load solar data when location is set in Step 1
  useEffect(() => {
    if (!config.location) {
      setSolarTimeseriesData(null);
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
        setAvailableYears([]);
      })
      .finally(() => setSolarDataLoading(false));
  }, [config.location]);

  // Normalize solar data when raw data or selected year changes
  useEffect(() => {
    if (!rawSolarData || !selectedYear) {
      setSolarTimeseriesData(null);
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
      endSolarSpan(spanId, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Normalization failed';
      logSolarError('solar', 'Normalization failed', { message: msg }, { spanId });
      endSolarSpan(spanId, 'error', { message: msg });
      setSolarTimeseriesData(null);
    }
  }, [rawSolarData, selectedYear, config.location]);

  // Auto-recalculate when solar data changes (e.g. year selection) IF we already have a result
  useEffect(() => {
    if (result && solarTimeseriesData) {
      // Check if we need to update based on year mismatch
      if (result.audit?.year !== solarTimeseriesData.year) {
         handleCalculate();
      }
    }
  }, [solarTimeseriesData]);

  const handleNextStep = (step: number, data?: any) => {
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
        // Not officially supported in type yet but fallback
        businessType = 'other';
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
      setTariffConfig(data.tariffConfig);
      setCurvedMonthlyKwh(data.curvedMonthlyKwh);
      setEstimatedMonthlyBills(data.estimatedMonthlyBills);
      setCompletedSteps(prev => new Set(prev).add(step));
      setCurrentStep(2);
      return;
    }
    
    if (step === 2 && data?.solarData) {
      // Step 2: Solar - store solar data
      setSolarTimeseriesData(data.solarData);
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
    setEstimatedMonthlyBills(saved.estimatedMonthlyBills);
    
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
      setResult(saved.result);
    } else {
      // If no result snapshot, user has to click "Generate"
      setResult(null);
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
    if (!result) return;

    saveReport({
        name,
        config,
        financing,
        selectedGrantIds,
        trading,
        tariffId,
        exampleMonths: [], // We don't strictly need these if we have curvedMonthlyKwh, but good to have
        tariffConfig: null, // Same
        curvedMonthlyKwh,
        estimatedMonthlyBills,
        selectedYear,
        result // Snapshot
    });
    
    logInfo('ui', 'Saved report', { name });
  };

  const handleBackFromResults = () => {
    setResult(null);
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
      />

      <main className="mx-auto max-w-7xl px-6 py-10 -mt-10 relative z-20">
      {/* Step Indicator (hide on Step 0 and when report is generated) */}
        {!result && currentStep > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 md:p-4 mb-6">
            <StepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
          </div>
        )}

        {/* Full-page report */}
        {result ? (
          <div className="max-w-5xl mx-auto">
            <ResultsSection 
              result={result} 
              config={config} 
              availableYears={availableYears}
              selectedYear={selectedYear}
              onSelectYear={(y) => {
                setSelectedYear(y);
                // Trigger recalculation if result is already showing
                // Note: The normalization useEffect will fire first, updating solarTimeseriesData.
                // We need to wait for that? Or just let the user click "Generate" again?
                // The user probably expects the result to update immediately.
                // However, solarTimeseriesData update is async via useEffect.
                // A better pattern: just update selectedYear. The effect updates solarTimeseriesData.
                // Then another effect could trigger calculation? Or just let the user re-run?
                // For a smooth UX, we should probably auto-recalculate if result is present.
                // But handleCalculate depends on the NEW solarTimeseriesData which isn't ready yet.
                // Quick fix: clear result so they have to click generate, or use a ref/effect to auto-run.
                // Given the instruction "dropdown that has years... and I can select from them",
                // implying instant update.
                // But complex state updates are tricky.
                // Let's just update the year. The report will likely need regeneration.
                // Ideally, we pass a callback that updates year AND triggers calc when data ready.
                // For now, let's just update the year. The ResultsSection will re-render with new dropdown value.
                // If we want auto-update, we need a useEffect on solarTimeseriesData that checks if result!=null.
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
