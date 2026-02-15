import React, { useState, useEffect, useMemo } from 'react';
import type { SystemConfiguration, TradingConfig } from '../../types';
import type { ExampleMonth, TariffConfiguration, TariffSlot } from '../../types/billing';
import { type ParsedPriceData, parsePriceTimeseriesCSV } from '../../utils/priceTimeseriesParser';
import { calculateAverageFlatRate, curveConsumption } from '../../utils/billingCalculations';
import { Field } from '../Field';

interface Step3Props {
  config: SystemConfiguration;
  setConfig: (config: SystemConfiguration) => void;
  trading: TradingConfig;
  setTrading: (trading: TradingConfig) => void;
  priceData: ParsedPriceData | null;
  setPriceData: (data: ParsedPriceData | null) => void;
  exampleMonths: ExampleMonth[];
  setExampleMonths: (months: ExampleMonth[]) => void;
  tariffConfig: TariffConfiguration | null;
  setTariffConfig: (config: TariffConfiguration) => void;
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
  setExampleMonths,
  tariffConfig,
  setTariffConfig,
  onNext,
  onBack
}: Step3Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  // Mode state: Derived from trading.enabled
  const tariffMode = trading.enabled ? 'market' : 'standard';

  // Local state for Standard Tariff Builder
  const [localTariffType, setLocalTariffType] = useState<'flat' | 'custom'>(
    tariffConfig?.type === 'custom' ? 'custom' : 'flat'
  );
  const [customSlots, setCustomSlots] = useState<TariffSlot[]>(
    tariffConfig?.customSlots || []
  );
  const [standingCharge, setStandingCharge] = useState<number>(
    tariffConfig?.standingChargePerDay ?? 0.9
  );

  // Sync Standard Tariff changes to parent
  useEffect(() => {
    if (tariffMode === 'standard') {
      if (localTariffType === 'flat') {
        const flatRate = calculateAverageFlatRate(exampleMonths);
        // Only update if changed to avoid loops
        if (tariffConfig?.type !== 'flat' || Math.abs((tariffConfig.flatRate || 0) - flatRate) > 0.0001 || tariffConfig.standingChargePerDay !== standingCharge) {
           setTariffConfig({ type: 'flat', flatRate, standingChargePerDay: standingCharge });
        }
      } else {
        // Custom
        setTariffConfig({ type: 'custom', customSlots, standingChargePerDay: standingCharge });
      }
    }
  }, [tariffMode, localTariffType, customSlots, standingCharge, exampleMonths, setTariffConfig, tariffConfig]);

  // Auto-load price data when trading is enabled (Market Mode)
  useEffect(() => {
    if (tariffMode === 'market' && !priceData && !loading) {
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
  }, [tariffMode, priceData, loading, setPriceData]);

  const handleModeChange = (mode: 'standard' | 'market') => {
    if (mode === 'market') {
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
  };

  // Standard Tariff Helpers
  const addTariffSlot = () => {
    const newSlot: TariffSlot = {
      id: `slot-${Date.now()}`,
      name: `Time Slot ${customSlots.length + 1}`,
      startHour: 0,
      endHour: 23,
      ratePerKwh: 0.20
    };
    setCustomSlots([...customSlots, newSlot]);
  };

  const updateTariffSlot = (id: string, updates: Partial<TariffSlot>) => {
    setCustomSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeTariffSlot = (id: string) => {
    setCustomSlots(prev => prev.filter(s => s.id !== id));
    // Remove usage from months
    const newMonths = exampleMonths.map(m => ({
      ...m,
      tariffSlotUsage: Object.fromEntries(
        Object.entries(m.tariffSlotUsage).filter(([slotId]) => slotId !== id)
      )
    }));
    setExampleMonths(newMonths);
  };

  const updateSlotUsage = (monthIndex: number, slotId: string, percentage: number) => {
    const newMonths = exampleMonths.map(m => 
      m.monthIndex === monthIndex 
        ? { ...m, tariffSlotUsage: { ...m.tariffSlotUsage, [slotId]: percentage / 100 } }
        : m
    );
    setExampleMonths(newMonths);
  };

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
          Batteries & Tariffs
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Configure energy storage and define how you interact with the grid.
        </p>
      </div>

      {/* Battery Section */}
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

      {/* Tariff Strategy Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 mr-2 text-emerald-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Tariff Strategy
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => handleModeChange('standard')}
            className={`flex items-start p-4 rounded-lg border-2 transition-all text-left ${
              tariffMode === 'standard'
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mr-3 ${
              tariffMode === 'standard' ? 'border-indigo-600' : 'border-slate-400'
            }`}>
              {tariffMode === 'standard' && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
            </div>
            <div>
              <div className={`font-semibold ${tariffMode === 'standard' ? 'text-indigo-900' : 'text-slate-700'}`}>Standard Tariff</div>
              <p className="text-sm text-slate-500 mt-1">Flat Rate or Time-of-Use (Day/Night/Peak). System optimizes self-consumption.</p>
            </div>
          </button>

          <button
            onClick={() => handleModeChange('market')}
            className={`flex items-start p-4 rounded-lg border-2 transition-all text-left ${
              tariffMode === 'market'
                ? 'border-emerald-600 bg-emerald-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mr-3 ${
              tariffMode === 'market' ? 'border-emerald-600' : 'border-slate-400'
            }`}>
              {tariffMode === 'market' && <div className="w-2 h-2 rounded-full bg-emerald-600" />}
            </div>
            <div>
              <div className={`font-semibold ${tariffMode === 'market' ? 'text-emerald-900' : 'text-slate-700'}`}>Dynamic Market Pricing</div>
              <p className="text-sm text-slate-500 mt-1">Day-Ahead Arbitrage. Charge when cheap, discharge when expensive.</p>
            </div>
          </button>
        </div>

        {/* --- STANDARD TARIFF BUILDER --- */}
        {tariffMode === 'standard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setLocalTariffType('flat')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  localTariffType === 'flat'
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Flat Rate
              </button>
              <button
                type="button"
                onClick={() => setLocalTariffType('custom')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  localTariffType === 'custom'
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Time-of-Use
              </button>
            </div>

            {/* Standing Charge - shown for both flat and custom */}
            <div className="mb-6">
              <Field label="Standing Charge (€/day)">
                <input
                  className={inputClass}
                  type="number"
                  step={0.01}
                  value={standingCharge}
                  onChange={(e) => setStandingCharge(Number(e.target.value) || 0)}
                  placeholder="e.g., 0.90"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Daily standing charge from your supplier (typically €0.80-€1.20/day).
                </p>
              </Field>
            </div>

            {localTariffType === 'flat' && (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-700">
                <p>
                  Estimated Flat Rate based on your consumption inputs: {' '}
                  <span className="font-bold text-indigo-700">
                    €{tariffConfig?.flatRate?.toFixed(3) || '0.000'}/kWh
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Calculated from Total Bill / Total kWh.</p>
              </div>
            )}

            {localTariffType === 'custom' && (
              <div className="space-y-4">
                {customSlots.map(slot => (
                  <div key={slot.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <Field label="Slot Name">
                        <input
                          className={inputClass}
                          type="text"
                          value={slot.name}
                          onChange={(e) => updateTariffSlot(slot.id, { name: e.target.value })}
                          placeholder="e.g., Peak"
                        />
                      </Field>
                      <Field label="Start (0-23)">
                        <input
                          className={inputClass}
                          type="number"
                          min={0} max={23}
                          value={slot.startHour}
                          onChange={(e) => updateTariffSlot(slot.id, { startHour: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="End (0-23)">
                        <input
                          className={inputClass}
                          type="number"
                          min={0} max={23}
                          value={slot.endHour}
                          onChange={(e) => updateTariffSlot(slot.id, { endHour: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Rate (€/kWh)">
                        <input
                          className={inputClass}
                          type="number"
                          step={0.001}
                          value={slot.ratePerKwh}
                          onChange={(e) => updateTariffSlot(slot.id, { ratePerKwh: Number(e.target.value) })}
                        />
                      </Field>
                    </div>
                    {/* Usage sliders */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                      {exampleMonths.map(month => (
                        <Field key={month.monthIndex} label={`${month.monthName} usage (%)`}>
                          <input
                            className={inputClass}
                            type="number"
                            min={0} max={100} step={1}
                            value={Math.round((month.tariffSlotUsage[slot.id] || 0) * 100)}
                            onChange={(e) => updateSlotUsage(month.monthIndex, slot.id, Number(e.target.value))}
                          />
                        </Field>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => removeTariffSlot(slot.id)} className="text-xs text-red-600 hover:underline">Remove Slot</button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTariffSlot}
                  className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-indigo-500 hover:text-indigo-600"
                >
                  + Add Tariff Slot
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- MARKET TRADING BUILDER --- */}
        {tariffMode === 'market' && (
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
                    className={inputClass}
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
                  className={inputClass}
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
          disabled={tariffMode === 'market' && !priceData}
          className={`px-8 py-3 rounded-lg font-bold text-white shadow-lg transition-all transform hover:-translate-y-0.5 ${
            tariffMode === 'market' && !priceData
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
