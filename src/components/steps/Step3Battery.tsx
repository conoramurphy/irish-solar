import React, { useState, useEffect, useMemo } from 'react';
import type { SystemConfiguration, TradingConfig } from '../../types';
import type { ExampleMonth } from '../../types/billing';
import { type ParsedPriceData, parsePriceTimeseriesCSV } from '../../utils/priceTimeseriesParser';
import { curveConsumption } from '../../utils/billingCalculations';

interface Step3Props {
  config: SystemConfiguration;
  setConfig: (config: SystemConfiguration) => void;
  trading: TradingConfig;
  setTrading: (trading: TradingConfig) => void;
  priceData: ParsedPriceData | null;
  setPriceData: (data: ParsedPriceData | null) => void;
  exampleMonths: ExampleMonth[];
  onNext: () => void;
  onBack: () => void;
}

export function Step3Battery({
  config,
  setConfig,
  trading,
  setTrading,
  priceData,
  setPriceData,
  exampleMonths,
  onNext,
  onBack
}: Step3Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load price data when trading is enabled
  useEffect(() => {
    if (trading.enabled && !priceData && !loading) {
      setLoading(true);
      setError(null);
      fetch('/data/dayahead_prices/Lookback2_mkt_filtered.csv')
        .then(res => {
          if (!res.ok) throw new Error('Failed to load default price data');
          return res.text();
        })
        .then(text => {
          const parsed = parsePriceTimeseriesCSV(text);
          if (parsed.timesteps.length === 0) {
            throw new Error('No valid price data found in default CSV');
          }
          setPriceData(parsed);
        })
        .catch(e => {
          console.error(e);
          setError('Failed to load market price data');
        })
        .finally(() => setLoading(false));
    }
  }, [trading.enabled, priceData, loading, setPriceData]);

  // Calculate average hourly consumption for guidance
  const avgHourlyKw = useMemo(() => {
    if (!exampleMonths || exampleMonths.length === 0) return 0;
    const monthlyKwh = curveConsumption(exampleMonths);
    const annualKwh = monthlyKwh.reduce((sum, m) => sum + m, 0);
    return annualKwh / 8760;
  }, [exampleMonths]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Battery Storage
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Configure energy storage and optionally enable market rate modeling for advanced arbitrage.
        </p>
      </div>

      {/* Battery Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2 text-indigo-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Battery Capacity
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Battery Capacity (kWh)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={config.batterySizeKwh}
                onChange={(e) => setConfig({ ...config, batterySizeKwh: parseFloat(e.target.value) || 0 })}
                className="block w-full rounded-lg border-slate-300 pl-4 pr-12 py-3 focus:border-indigo-500 focus:ring-indigo-500 text-lg shadow-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <span className="text-slate-500">kWh</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Set to 0 to disable battery.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-6 flex flex-col justify-center">
             <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">
               Site Load Context
             </div>
             <div className="flex items-baseline gap-2">
               <span className="text-3xl font-bold text-slate-700">
                 {avgHourlyKw.toFixed(1)}
               </span>
               <span className="text-sm font-medium text-slate-500">kW</span>
             </div>
             <div className="text-sm text-slate-500 mt-2">
               Average hourly consumption. <br/>
               A {Math.round(avgHourlyKw * 2)}-{(Math.round(avgHourlyKw * 4))} kWh battery would cover 2-4 hours of load.
             </div>
          </div>
        </div>
      </div>

      {/* Market Rate Toggle */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2 text-emerald-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Advanced Market Modeling (Optional)
        </h3>

        <div className="mb-6">
          <label className="flex items-start p-4 rounded-lg border-2 border-slate-200 hover:border-emerald-400 transition-all cursor-pointer">
            <input
              type="checkbox"
              checked={trading.enabled}
              onChange={(e) => {
                if (e.target.checked) {
                  setTrading({
                    ...trading,
                    enabled: true,
                    importMargin: trading.importMargin ?? 0.05,
                    exportMargin: 0,
                    hoursWindow: trading.hoursWindow ?? 4
                  });
                } else {
                  setTrading({ ...trading, enabled: false });
                }
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="ml-3 flex-1">
              <div className="font-semibold text-slate-700">Also model market rate</div>
              <p className="text-sm text-slate-500 mt-1">
                Enable day-ahead market pricing for battery arbitrage. The system will optimize charging/discharging based on hourly market prices.
              </p>
            </div>
          </label>
        </div>

        {/* Market Settings (shown when enabled) */}
        {trading.enabled && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-800">
              <p className="font-medium mb-1">Market Strategy Active</p>
              <p>
                The system will use hourly Day-Ahead Market prices to optimize battery charging and discharging.
                Arbitrage window: <strong>{trading.hoursWindow || 4} hours</strong> (Cheapest Charge / Most Expensive Discharge).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Import Margin (€/kWh)</label>
                <div className="relative">
                  <input
                    type="number" step="0.001"
                    value={trading.importMargin}
                    onChange={(e) => setTrading({ ...trading, importMargin: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-md border-slate-200 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Added to market price for imports.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Arbitrage Window (Hours)</label>
                <input
                  type="number" min="1" max="12"
                  value={trading.hoursWindow}
                  onChange={(e) => setTrading({ ...trading, hoursWindow: parseInt(e.target.value) || 4 })}
                  className="w-full rounded-md border-slate-200 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2"
                />
              </div>
            </div>

            {/* Price Data Loader Status */}
            <div className="border-t border-slate-200 pt-4">
              {loading && <div className="text-sm text-slate-500">Loading market prices...</div>}
              {error && <div className="text-sm text-red-600">{error}</div>}
              {priceData && !loading && (
                <div className="flex items-center text-sm text-emerald-700">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Price data loaded ({priceData.timesteps.length} hours, {priceData.year})
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={trading.enabled && !priceData}
          className={`px-8 py-3 rounded-lg font-bold text-white shadow-lg transition-all transform hover:-translate-y-0.5 ${
            trading.enabled && !priceData
              ? 'bg-slate-400 cursor-not-allowed shadow-none' 
              : 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400'
          }`}
        >
          Next Step
        </button>
      </div>
    </div>
  );
}
