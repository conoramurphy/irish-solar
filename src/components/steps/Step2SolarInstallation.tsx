import { useMemo, useState, useEffect } from 'react';
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

interface Step2SolarInstallationProps {
  config: SystemConfiguration;
  setConfig: (c: SystemConfiguration) => void;
  onNext: (data?: any) => void;
  onBack: () => void;
}

export function Step2SolarInstallation({
  config,
  setConfig,
  onNext,
  onBack
}: Step2SolarInstallationProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";
  const selectClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  // Available locations (only Cavan for now with timeseries data)
  const availableLocations = ['Cavan'];
  
  const [solarData, setSolarData] = useState<ParsedSolarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [corrections, setCorrections] = useState<SolarNormalizationCorrections | null>(null);
  
  // Load the CSV file for the selected location
  useEffect(() => {
    if (!config.location || !availableLocations.includes(config.location)) {
      setSolarData(null);
      return;
    }
    
    setLoading(true);

    logInfo('solar', 'Loading solar timeseries data via fetch', { location: config.location });
    
    // Fetch CSV from static assets (year 2020 for now)
    // TODO: Add year selection UI when multiple years are available
    const year = 2020;
    
    loadSolarData(config.location, year)
      .then((parsed) => {
        logInfo('solar', 'Loaded solar timeseries data', { totalRows: parsed.timesteps.length, year: parsed.year });

        const years = listSolarTimeseriesYears(parsed);
        setAvailableYears(years);

        // Force explicit selection if multiple years exist.
        if (years.length > 1) {
          logInfo('solar', 'Multi-year solar CSV detected; requiring explicit year selection', { years });
          setSelectedYear(null);
          setSolarData(null);
          setCorrections(null);
        } else {
          const y = years[0] ?? parsed.year;
          const spanId = startSpan('solar', 'Solar normalization', { year: y, location: config.location });
          try {
            const norm = normalizeSolarTimeseriesYear(parsed, y);
            logInfo('solar', 'Normalized solar timeseries to canonical year grid', norm.corrections, { spanId });
            if (norm.corrections.warnings.length) {
              logWarn('solar', 'Solar timeseries normalization warnings', norm.corrections, { spanId });
            }
            setSelectedYear(y);
            setSolarData(norm.normalized);
            setCorrections(norm.corrections);
            endSpan(spanId, 'success');
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Solar normalization failed.';
            logError('solar', 'Solar normalization failed', { message: msg }, { spanId });
            endSpan(spanId, 'error', { message: msg });
            setSolarData(null);
            setCorrections(null);
          }
        }

        setLoading(false);
      })
      .catch((err) => {
        logError('solar', 'Failed to load solar data', { error: String(err) });
        setSolarData(null);
        setCorrections(null);
        setLoading(false);
      });
  }, [config.location]);
  
  // Calculate monthly production distribution
  const monthlyProduction = useMemo(() => {
    if (!config.annualProductionKwh || !solarData) {
      return null;
    }
    
    const hourlyProduction = distributeAnnualProductionTimeseries(
      config.annualProductionKwh,
      solarData
    );
    
    return aggregateToMonthly(hourlyProduction, solarData);
  }, [config.annualProductionKwh, solarData]);

  const selectedYearHoursOk = useMemo(() => {
    if (!solarData) return false;
    const expected = expectedHoursInYear(solarData.year);
    return solarData.timesteps.length === expected;
  }, [solarData]);

  const handleContinue = () => {
    if (config.annualProductionKwh > 0 && config.location && config.businessType && solarData && selectedYearHoursOk) {
      onNext({ solarData });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Preamble */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 mb-6 shadow-lg shadow-orange-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          </svg>
        </div>
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Solar Installation Sizing
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Enter your total annual production from your designed system. We'll distribute it across the year using real solar irradiance data to model realistic generation patterns.
        </p>
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">System Configuration</h3>

        <div className="space-y-6">
          <Field label="Total Annual Production (kWh/year)">
            <input
              className={inputClass}
              type="number"
              step={100}
              value={config.annualProductionKwh}
              onChange={(e) => setConfig({ ...config, annualProductionKwh: Number(e.target.value) })}
              placeholder="e.g., 22500"
            />
            <p className="mt-2 text-xs text-slate-400 italic">
              Total energy your solar system will produce annually (designed elsewhere)
            </p>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Location">
              <select
                className={selectClass}
                value={config.location}
                onChange={(e) => setConfig({ ...config, location: e.target.value })}
              >
                <option value="">Select location...</option>
                {availableLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-400 italic">
                Used to distribute production based on real solar irradiance patterns
              </p>
              {loading && (
                <p className="mt-1 text-xs text-tines-purple flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading solar data...
                </p>
              )}
              {availableYears.length > 1 && (
                <div className="mt-3">
                  <Field label="Timeseries year">
                    <select
                      className={selectClass}
                      value={selectedYear ?? ''}
                      onChange={(e) => {
                        const y = Number(e.target.value);
                        if (!Number.isFinite(y)) return;
                        setSelectedYear(y);

                        logInfo('solar', 'Year selected for solar timeseries', { year: y });

                        // Load data for selected year
                        setLoading(true);
                        loadSolarData(config.location, y)
                          .then((parsed) => {
                            const spanId = startSpan('solar', 'Solar normalization', { year: y, location: config.location });
                            try {
                              const norm = normalizeSolarTimeseriesYear(parsed, y);
                              logInfo('solar', 'Normalized solar timeseries to canonical year grid', norm.corrections, { spanId });
                              if (norm.corrections.warnings.length) {
                                logWarn('solar', 'Solar timeseries normalization warnings', norm.corrections, { spanId });
                              }
                              setSolarData(norm.normalized);
                              setCorrections(norm.corrections);
                              endSpan(spanId, 'success');
                              setLoading(false);
                            } catch (e) {
                              const msg = e instanceof Error ? e.message : 'Solar normalization failed.';
                              logError('solar', 'Solar normalization failed', { message: msg }, { spanId });
                              endSpan(spanId, 'error', { message: msg });
                              setSolarData(null);
                              setCorrections(null);
                              setLoading(false);
                            }
                          })
                          .catch((err) => {
                            logError('solar', 'Failed to load solar data for selected year', { error: String(err), year: y });
                            setSolarData(null);
                            setCorrections(null);
                            setLoading(false);
                          });
                      }}
                    >
                      <option value="">Select year...</option>
                      {availableYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-400 italic">
                      This file contains multiple years — you must select one (no monthly approximation fallback).
                    </p>
                  </Field>
                </div>
              )}

              {solarData && (
                <p className={`mt-1 text-xs flex items-center gap-1 ${selectedYearHoursOk ? 'text-emerald-600' : 'text-red-600'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {solarData.timesteps.length.toLocaleString()} hourly timesteps loaded for {solarData.year} (expected {expectedHoursInYear(solarData.year)})
                </p>
              )}

              {corrections && corrections.warnings.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="font-semibold mb-1">Timeseries normalized</div>
                  <ul className="list-disc pl-4 space-y-1">
                    {corrections.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Field>

            <Field label="Business Type">
              <select
                className={selectClass}
                value={config.businessType}
                onChange={(e) => setConfig({ ...config, businessType: e.target.value as any })}
              >
                <option value="hotel">Hotel</option>
                <option value="farm">Farm</option>
                <option value="commercial">Commercial</option>
                <option value="other">Other</option>
              </select>
              <p className="mt-2 text-xs text-slate-400 italic">Determines grant eligibility</p>
            </Field>
          </div>

          {monthlyProduction && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Monthly solar generation is shown in the <span className="font-semibold">Annual Calendar</span> on the right.
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!config.annualProductionKwh || config.annualProductionKwh <= 0 || !config.location || !solarData || !selectedYearHoursOk}
          className="px-8 py-3 bg-tines-purple text-white font-medium rounded-lg shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
        >
          Continue to Costs & Financing
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
