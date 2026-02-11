import { useMemo, useState } from 'react';
import { endSpan, logError, logInfo, logWarn, startSpan } from '../../utils/logger';
import { Field } from '../Field';
import type { SystemConfiguration } from '../../types';
import {
  expectedHoursInYear,
  listSolarTimeseriesYears,
  normalizeSolarTimeseriesYear,
  distributeAnnualProductionTimeseries,
  aggregateToMonthly,
  type ParsedSolarData,
  type SolarNormalizationCorrections
} from '../../utils/solarTimeseriesParser';
import { loadSolarData } from '../../utils/solarDataLoader';

interface Step2SolarProps {
  config: SystemConfiguration;
  setConfig: (c: SystemConfiguration) => void;
  locationFromStep1: string;
  solarData: ParsedSolarData | null;
  loading: boolean;
  onNext: (data?: any) => void;
  onBack: () => void;
}

export function Step2Solar({
  config,
  setConfig,
  locationFromStep1,
  solarData: initialSolarData,
  loading: externalLoading,
  onNext,
  onBack
}: Step2SolarProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";
  const selectClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  const [solarData, setSolarData] = useState<ParsedSolarData | null>(initialSolarData);
  const [loading, setLoading] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(initialSolarData?.year || null);
  const [corrections, setCorrections] = useState<SolarNormalizationCorrections | null>(null);

  // Initialize years when solar data arrives
  useMemo(() => {
    if (initialSolarData) {
      const years = listSolarTimeseriesYears(initialSolarData);
      setAvailableYears(years);
      if (years.length === 1) {
        setSolarData(initialSolarData);
        setSelectedYear(years[0]);
      } else if (years.length > 1) {
        // For multi-year files, use the initialSolarData if it's already normalized
        // (App.tsx loads and normalizes it based on selected year)
        setSolarData(initialSolarData);
        setSelectedYear(initialSolarData.year);
      }
    }
  }, [initialSolarData]);

  const monthlyProduction = useMemo(() => {
    if (!config.annualProductionKwh || !solarData) return null;
    const hourlyProduction = distributeAnnualProductionTimeseries(config.annualProductionKwh, solarData);
    return aggregateToMonthly(hourlyProduction, solarData);
  }, [config.annualProductionKwh, solarData]);

  const selectedYearHoursOk = useMemo(() => {
    if (!solarData) return false;
    const expected = expectedHoursInYear(solarData.year);
    return solarData.timesteps.length === expected;
  }, [solarData]);

  const handleYearChange = async (year: number) => {
    setSelectedYear(year);
    logInfo('solar', 'Year selected for solar timeseries', { year });

    setLoading(true);
    try {
      const parsed = await loadSolarData(locationFromStep1, year);
      const spanId = startSpan('solar', 'Solar normalization', { year, location: locationFromStep1 });
      try {
        const norm = normalizeSolarTimeseriesYear(parsed, year);
        logInfo('solar', 'Normalized solar timeseries', norm.corrections, { spanId });
        if (norm.corrections.warnings.length) {
          logWarn('solar', 'Normalization warnings', norm.corrections, { spanId });
        }
        setSolarData(norm.normalized);
        setCorrections(norm.corrections);
        endSpan(spanId, 'success');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Normalization failed';
        logError('solar', 'Normalization failed', { message: msg }, { spanId });
        endSpan(spanId, 'error', { message: msg });
        setSolarData(null);
        setCorrections(null);
      }
    } catch (err) {
      logError('solar', 'Failed to load solar data', { error: String(err), year });
      setSolarData(null);
      setCorrections(null);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (config.annualProductionKwh > 0 && solarData && selectedYearHoursOk) {
      onNext({ solarData });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 mb-6 shadow-lg shadow-orange-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          </svg>
        </div>
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">Solar Installation Sizing</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Enter your annual solar production. We'll distribute it using real irradiance data from <span className="font-semibold text-tines-purple">{locationFromStep1}</span>.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Need help sizing? Use the <a href="https://pvwatts.nrel.gov/pvwatts.php" target="_blank" rel="noopener noreferrer" className="text-tines-purple hover:underline font-medium">PVWatts Calculator</a> to estimate annual production.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">System Configuration</h3>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Total Annual Production (kWh/year)">
              <input className={inputClass} type="number" step={100} value={config.annualProductionKwh}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  // Auto-estimate system size (kWp) if not set or if user is just starting
                  // Assume ~900 kWh/kWp for Ireland
                  const estimatedKwp = val > 0 ? Number((val / 900).toFixed(1)) : 0;
                  setConfig({ 
                    ...config, 
                    annualProductionKwh: val,
                    systemSizeKwp: estimatedKwp 
                  });
                }}
                placeholder="e.g., 22500" />
              <p className="mt-2 text-xs text-slate-400 italic">Total energy your system will produce annually</p>
            </Field>

            <Field label="Installed System Size (kWp)">
              <input
                className={inputClass}
                type="number"
                step={0.1}
                value={config.systemSizeKwp ?? ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    systemSizeKwp: e.target.value ? Number(e.target.value) : undefined
                  })
                }
                placeholder="e.g., 30"
              />
              <p className="mt-2 text-xs text-slate-400 italic">
                Used for grant calculations (e.g. SEAI Non-Domestic Microgen Solar PV).
              </p>
            </Field>
          </div>

          {(externalLoading || loading) && (
            <div className="flex items-center gap-2 text-sm text-tines-purple">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading solar data...
            </div>
          )}

          {availableYears.length > 1 && (
            <Field label="Timeseries year">
              <select className={selectClass} value={selectedYear ?? ''} onChange={(e) => handleYearChange(Number(e.target.value))}>
                <option value="">Select year...</option>
                {availableYears.map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
              <p className="mt-2 text-xs text-slate-400 italic">Multi-year file detected - select one</p>
            </Field>
          )}

          {solarData && (
            <p className={`text-xs flex items-center gap-1 ${selectedYearHoursOk ? 'text-emerald-600' : 'text-red-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {solarData.timesteps.length.toLocaleString()} hourly timesteps for {solarData.year} (expected {expectedHoursInYear(solarData.year)})
            </p>
          )}

          {corrections && corrections.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="font-semibold mb-1">Timeseries normalized</div>
              <ul className="list-disc pl-4 space-y-1">
                {corrections.warnings.map((w, idx) => (<li key={idx}>{w}</li>))}
              </ul>
            </div>
          )}

          {monthlyProduction && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Monthly solar generation shown in <span className="font-semibold">Annual Calendar</span> →
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        <button type="button" onClick={handleContinue}
          disabled={!config.annualProductionKwh || config.annualProductionKwh <= 0 || !solarData || !selectedYearHoursOk}
          className="px-8 py-3 bg-tines-purple text-white font-medium rounded-lg shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2">
          Continue to Finance
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Step2Solar;
