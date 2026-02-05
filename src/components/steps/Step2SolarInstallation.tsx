import { useMemo, useState, useEffect } from 'react';
import { Field } from '../Field';
import type { SystemConfiguration } from '../../types';
import { MONTH_LABELS } from '../../utils/consumption';
import {
  expectedHoursInYear,
  listSolarTimeseriesYears,
  parseSolarTimeseriesCSV,
  sliceSolarTimeseriesYear,
  distributeAnnualProductionTimeseries,
  aggregateToMonthly,
  type ParsedSolarData
} from '../../utils/solarTimeseriesParser';

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
  
  // Load the CSV file for the selected location
  useEffect(() => {
    if (!config.location || !availableLocations.includes(config.location)) {
      setSolarData(null);
      return;
    }
    
    setLoading(true);
    
    // Dynamically import the CSV file
    import(`../../data/timeseries_solar_${config.location}.csv?raw`)
      .then((module) => {
        const csvContent = module.default;
        const parsed = parseSolarTimeseriesCSV(csvContent, config.location);

        const years = listSolarTimeseriesYears(parsed);
        setAvailableYears(years);

        // Force explicit selection if multiple years exist.
        if (years.length > 1) {
          setSelectedYear(null);
          setSolarData(null);
        } else {
          const y = years[0] ?? parsed.year;
          setSelectedYear(y);
          setSolarData(sliceSolarTimeseriesYear(parsed, y));
        }

        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load solar data:', err);
        setSolarData(null);
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

                        // Re-parse and slice to avoid keeping multi-year data in state.
                        setLoading(true);
                        import(`../../data/timeseries_solar_${config.location}.csv?raw`)
                          .then((module) => {
                            const parsed = parseSolarTimeseriesCSV(module.default, config.location);
                            setSolarData(sliceSolarTimeseriesYear(parsed, y));
                            setLoading(false);
                          })
                          .catch((err) => {
                            console.error('Failed to load solar data:', err);
                            setSolarData(null);
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

          {/* Monthly Production Breakdown */}
          {monthlyProduction && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-6 border border-amber-200">
              <div className="mb-4">
                <h4 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-amber-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                  </svg>
                  Monthly Production Distribution
                </h4>
                <p className="text-xs text-amber-700">
                  Based on {solarData ? `${solarData.timesteps.length.toLocaleString()} hourly timesteps from ${solarData.year}` : 'typical'} solar irradiance data for {config.location}
                </p>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                {monthlyProduction.map((month) => (
                  <div key={month.monthIndex} className="text-center p-2 rounded bg-white/70 border border-amber-100">
                    <div className="text-amber-700 font-medium mb-1">{MONTH_LABELS[month.monthIndex]}</div>
                    <div className="font-bold text-amber-900">{Math.round(month.productionKwh).toLocaleString()}</div>
                    <div className="text-amber-600 text-xs">kWh</div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-amber-200 flex items-center justify-between">
                <span className="text-sm text-amber-800">Peak Month (June)</span>
                <span className="text-sm font-bold text-amber-900">
                  {monthlyProduction[5] ? Math.round(monthlyProduction[5].productionKwh).toLocaleString() : 0} kWh
                </span>
              </div>
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
