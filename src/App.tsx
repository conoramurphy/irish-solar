import { useMemo, useState } from 'react';
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
import { Step1ConsumptionBilling } from './components/steps/Step1ConsumptionBilling';
import { Step2SolarInstallation } from './components/steps/Step2SolarInstallation';
import { Step3CostsAndFinancing } from './components/steps/Step3CostsAndFinancing';
import { ResultsSection } from './components/ResultsSection';
import type { ExampleMonth, TariffConfiguration } from './types/billing';

const grantsData = rawGrantsData as unknown as Grant[];
const tariffsData = rawTariffsData as unknown as Tariff[];
const historicalSolarData = rawHistoricalSolarData as unknown as Record<string, HistoricalSolarData>;
const historicalTariffData = rawHistoricalTariffData as unknown as HistoricalTariffData[];

function App() {
  const [config, setConfig] = useState<SystemConfiguration>({
    annualProductionKwh: 22500,
    batterySizeKwh: 10,
    installationCost: 35000,
    location: 'Cavan',
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

  // Solar timeseries data from Step 2
  const [solarTimeseriesData, setSolarTimeseriesData] = useState<ParsedSolarData | null>(null);

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

  // Step management
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const steps = [
    { id: 1, label: 'Consumption Profile' },
    { id: 2, label: 'Solar Installation' },
    { id: 3, label: 'Costs & Financing' }
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

  const handleNextStep = (step: number, data?: any) => {
    logInfo('ui', `Step ${step} completed`, { step });

    if (step === 1 && data) {
      // Store billing data from Step 1
      setExampleMonths(data.exampleMonths);
      setTariffConfig(data.tariffConfig);
      setCurvedMonthlyKwh(data.curvedMonthlyKwh);
      setEstimatedMonthlyBills(data.estimatedMonthlyBills);
    }
    if (step === 2 && data?.solarData) {
      // Store solar timeseries data from Step 2
      setSolarTimeseriesData(data.solarData);
      logInfo('solar', 'Solar timeseries stored from Step 2', {
        year: data.solarData.year,
        timesteps: data.solarData.timesteps?.length
      });
    }
    setCompletedSteps(prev => new Set(prev).add(step));
    setCurrentStep(step + 1);
  };

  const handleBackStep = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
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
        {/* Step Indicator (hide once report is generated) */}
        {!result && (
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
              {currentStep === 1 && <Step1ConsumptionBilling onNext={(data) => handleNextStep(1, data)} />}

              {currentStep === 2 && (
                <Step2SolarInstallation
                  config={config}
                  setConfig={setConfig}
                  onNext={(data) => handleNextStep(2, data)}
                  onBack={handleBackStep}
                />
              )}

              {currentStep === 3 && (
                <Step3CostsAndFinancing
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
