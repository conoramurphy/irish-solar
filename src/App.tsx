import { useMemo, useState } from 'react';
import rawGrantsData from './data/grants.json';
import rawTariffsData from './data/tariffs.json';
import rawHistoricalSolarData from './data/historical/solar-irradiance.json';
import rawHistoricalTariffData from './data/historical/tariff-history.json';
import { getEligibleGrants } from './models/grants';
import { runCalculation } from './utils/calculations';
import { getTariffBucketKeys, normalizeSharesToOne } from './utils/consumption';
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

    if (!tariff) {
      console.error('Please select a tariff.');
      return;
    }

    try {
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
    } catch (e) {
      console.error(e instanceof Error ? e.message : 'Calculation failed.');
    }
  };

  const handleNextStep = (step: number, data?: any) => {
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

      <main className="mx-auto max-w-7xl px-6 py-12 -mt-20 relative z-20">
        {/* Step Indicator */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 mb-8">
          <StepIndicator steps={steps} currentStep={currentStep} completedSteps={completedSteps} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Step Content */}
          <div className="lg:col-span-7">
            {currentStep === 1 && (
              <Step1ConsumptionBilling
                onNext={(data) => handleNextStep(1, data)}
              />
            )}

            {currentStep === 2 && (
              <Step2SolarInstallation
                config={config}
                setConfig={setConfig}
                onNext={() => handleNextStep(2)}
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

          {/* Right Column: Context (Sticky) */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-8">
              {/* Show consumption & billing chart after step 1 is completed */}
              {completedSteps.has(1) && !result && curvedMonthlyKwh.length === 12 && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8">
                  <div className="mb-6">
                    <h3 className="text-2xl font-serif font-bold text-tines-dark mb-2">Building Your Report</h3>
                    <p className="text-sm text-slate-500">Annual consumption & billing profile</p>
                  </div>
                  
                  <div className="space-y-3">
                    {curvedMonthlyKwh.map((kwh, monthIndex) => {
                      const maxKwh = Math.max(...curvedMonthlyKwh);
                      const heightPercent = (kwh / maxKwh) * 100;
                      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      
                      return (
                        <div key={monthIndex} className="flex items-center gap-4">
                          <div className="w-12 text-xs font-medium text-slate-500 text-right">
                            {monthNames[monthIndex]}
                          </div>
                          
                          <div className="flex-1 bg-slate-100 rounded-full h-8 relative overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-tines-purple to-indigo-500 rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-3"
                              style={{ width: `${heightPercent}%` }}
                            >
                              {heightPercent > 30 && (
                                <span className="text-xs font-semibold text-white">
                                  {Math.round(kwh).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {heightPercent <= 30 && (
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-semibold text-slate-700">
                                {Math.round(kwh).toLocaleString()}
                              </span>
                            )}
                          </div>
                          
                          <div className="w-20 text-xs text-right">
                            <div className="font-bold text-emerald-600">€{Math.round(estimatedMonthlyBills[monthIndex]).toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 font-medium">Annual Total</span>
                      <div className="text-right">
                        <div className="text-xl font-bold text-tines-purple">
                          €{Math.round(estimatedMonthlyBills.reduce((a, b) => a + b, 0)).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-400">
                          {Math.round(curvedMonthlyKwh.reduce((a, b) => a + b, 0)).toLocaleString()} kWh
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Show results after calculation */}
              {result && <ResultsSection result={result} />}

              {/* Show placeholder before step 1 is complete */}
              {!completedSteps.has(1) && !result && (
                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-12 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto mb-4 text-slate-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                  </svg>
                  <p className="text-slate-400">Your report will build as you progress through the steps</p>
                </div>
              )}
            </div>
          </div>
        </div>
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
