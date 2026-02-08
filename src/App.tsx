import { useEffect, useMemo, useState } from 'react';
import { LogViewer } from './components/LogViewer';
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

import { CalendarSidebar } from './components/CalendarSidebar';
import { Hero } from './components/Hero';
import { StepIndicator } from './components/StepIndicator';
import { Step0BuildingType } from './components/steps/Step0BuildingType';
import { Step1DigitalTwin } from './components/steps/Step1DigitalTwin';
import { Step2Solar } from './components/steps/Step2Solar';
import { Step3ComingSoon } from './components/steps/Step3ComingSoon';
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

  const [trading] = useState<TradingConfig>({ enabled: false });

  // Billing profile from Step 1
  const [, setExampleMonths] = useState<ExampleMonth[]>([]);
  const [, setTariffConfig] = useState<TariffConfiguration | null>(null);
  const [curvedMonthlyKwh, setCurvedMonthlyKwh] = useState<number[]>([]);
  const [estimatedMonthlyBills, setEstimatedMonthlyBills] = useState<number[]>([]);

  // Solar timeseries data - loaded in App when location set in Step 1
  const [solarTimeseriesData, setSolarTimeseriesData] = useState<ParsedSolarData | null>(null);
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
  const [logOpen, setLogOpen] = useState(false);

  // Step management - starts at 0 (building type)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Steps for stepper (1-4, Step 0 not shown in stepper)
  const steps = [
    { id: 1, label: 'Digital Twin' },
    { id: 2, label: 'Solar' },
    { id: 3, label: 'Batteries & Tariffs', disabled: true },
    { id: 4, label: 'Finance' }
  ];

  const selectedGrants: Grant[] = useMemo(
    () => eligibleGrants.filter((g) => selectedGrantIds.includes(g.id)),
    [eligibleGrants, selectedGrantIds]
  );

  const handleCalculate = () => {
    setResult(null);

    logInfo('ui', 'Generate report clicked', {
      currentStep,
      hasSolarTimeseries: !!solarTimeseriesData,
      hasConsumptionProfile: curvedMonthlyKwh.length === 12
    });

    if (!tariff) {
      logError('ui', 'Tariff missing when generating report');
      setLogOpen(true);
      return;
    }

    const spanId = startSpan('engine', 'Run calculation', {
      analysisYears: 25,
      location: config.location
    });

    try {
      logInfo(
        'engine',
        'runCalculation start',
        {
          annualProductionKwh: config.annualProductionKwh,
          batterySizeKwh: config.batterySizeKwh,
          installationCost: config.installationCost,
          location: config.location,
          analysisYears: 25
        },
        { spanId }
      );

      const r = runCalculation(
        config,
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
      setLogOpen(true);
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
        const years = listSolarTimeseriesYears(parsed);
        
        if (years.length === 1) {
          const y = years[0] ?? parsed.year;
          const spanId = startSolarSpan('solar', 'Solar normalization', { year: y, location: config.location });
          try {
            const norm = normalizeSolarTimeseriesYear(parsed, y);
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
        } else {
          // Multi-year - Step2 will handle year selection
          setSolarTimeseriesData(parsed);
        }
      })
      .catch((err) => {
        logSolarError('solar', 'Failed to load solar data', { error: String(err) });
        setSolarTimeseriesData(null);
      })
      .finally(() => setSolarDataLoading(false));
  }, [config.location]);

  const handleNextStep = (step: number, data?: any) => {
    logInfo('ui', `Step ${step} completed`, { step });

    if (step === 0 && data) {
      // Step 0: Building type selected
      setBuildingTypeSelection(data.buildingType);
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
      // Skip step 3, go to 4
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
      // Back from Step 4 -> skip Step 3, go to Step 2
      setCurrentStep(2);
    } else {
      setCurrentStep(prev => Math.max(0, prev - 1));
    }
  };

  return (
    <div className="min-h-screen bg-tines-light font-sans text-slate-600">
      <Hero />

      {/* Always-available logging UI */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          className="rounded-full bg-slate-900 text-white px-4 py-3 shadow-lg hover:bg-slate-800 text-sm font-semibold"
          onClick={() => setLogOpen(true)}
        >
          Logs
        </button>
      </div>
      <LogViewer open={logOpen} onClose={() => setLogOpen(false)} />

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
            <ResultsSection result={result} />
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

              {currentStep === 3 && <Step3ComingSoon />}

              {currentStep === 4 && (
                <Step4Finance
                  config={config}
                  setConfig={setConfig}
                  eligibleGrants={eligibleGrants}
                  selectedGrantIds={selectedGrantIds}
                  setSelectedGrantIds={setSelectedGrantIds}
                  financing={financing}
                  setFinancing={setFinancing}
                  onGenerateReport={handleCalculate}
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
