import React, { useState } from 'react';
import type { SystemConfiguration, TradingConfig } from '../../types';
import { type ParsedPriceData, parsePriceTimeseriesCSV } from '../../utils/priceTimeseriesParser';

interface Step3Props {
  config: SystemConfiguration;
  setConfig: (config: SystemConfiguration) => void;
  trading: TradingConfig;
  setTrading: (trading: TradingConfig) => void;
  priceData: ParsedPriceData | null;
  setPriceData: (data: ParsedPriceData | null) => void;
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
  onNext,
  onBack
}: Step3Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load price data when trading is enabled
  React.useEffect(() => {
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
          // Disable trading if data load fails
          setTrading({ ...trading, enabled: false });
        })
        .finally(() => setLoading(false));
    }
  }, [trading.enabled, priceData, loading, setPriceData, setTrading]);

  const handleTradingToggle = (enabled: boolean) => {
    setTrading({
      ...trading,
      enabled,
      // Set defaults if enabling for first time
      importMargin: trading.importMargin ?? 0.02,
      exportMargin: 0, // No export margin as requested
      hoursWindow: trading.hoursWindow ?? 4
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Batteries & Market Trading
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Configure energy storage and optional market trading strategies (Day Ahead Price Arbitrage).
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2 text-indigo-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Battery Storage
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
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2 text-emerald-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            Market Trading
          </h3>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={trading.enabled} 
              onChange={(e) => handleTradingToggle(e.target.checked)}
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            <span className="ml-3 text-sm font-medium text-slate-700">Enable</span>
          </label>
        </div>

        {trading.enabled && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
              <p>
                <strong>Trading Strategy:</strong> Day Ahead Price Arbitrage.
                The system will automatically charge from the grid during the cheapest <strong>{trading.hoursWindow || 4}</strong> hours 
                and discharge during the most expensive hours of each day.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Import Margin (added to price)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={trading.importMargin}
                    onChange={(e) => setTrading({ ...trading, importMargin: parseFloat(e.target.value) || 0 })}
                    className="block w-full rounded-lg border-slate-300 pl-4 pr-16 py-3 focus:border-indigo-500 focus:ring-indigo-500 shadow-sm"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <span className="text-slate-500">€/kWh</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Arbitrage Window (Hours per day)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    value={trading.hoursWindow}
                    onChange={(e) => setTrading({ ...trading, hoursWindow: parseInt(e.target.value) || 4 })}
                    className="block w-full rounded-lg border-slate-300 pl-4 pr-4 py-3 focus:border-indigo-500 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <p className="text-sm text-slate-500 mb-4">
                Market price data is automatically loaded from historical records (2021).
              </p>
              
              {loading && (
                 <div className="text-sm text-indigo-600 flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading price data...
                 </div>
              )}

              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
              
              {priceData && !loading && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-emerald-800 font-medium flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-2">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    Valid Price Data Loaded
                  </p>
                  <ul className="mt-2 text-sm text-emerald-700 space-y-1">
                    <li>Source Year: {priceData.year}</li>
                    <li>Total Hours: {priceData.timesteps.length}</li>
                  </ul>
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
