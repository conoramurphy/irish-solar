import { useState, useMemo, useRef } from 'react';
import { logInfo, logError } from '../../utils/logger';
import { Field } from '../Field';
import { MONTH_LABELS } from '../../utils/consumption';
import { curveConsumption, calculateAverageFlatRate, calculateMonthlyBill } from '../../utils/billingCalculations';
import type { ExampleMonth, TariffConfiguration, TariffSlot } from '../../types/billing';
import type { BusinessType, Tariff } from '../../types';
import { parseEsbUsageProfile } from '../../utils/usageProfileParser';
import { DomesticTariffSelector } from '../DomesticTariffSelector';
import domesticTariffsData from '../../data/domesticTariffs.json';

const domesticTariffs = domesticTariffsData as Tariff[];

interface Step1DigitalTwinProps {
  businessType: BusinessType;
  onNext: (data: {
    location: string;
    exampleMonths: ExampleMonth[];
    curvedMonthlyKwh: number[];
    tariffConfig: TariffConfiguration;
    hourlyConsumptionOverride?: number[];
    selectedDomesticTariff?: Tariff;
  }) => void;
  onBack?: () => void;
}

const MONTHS = MONTH_LABELS.map((name, index) => ({ index, name }));

export function Step1DigitalTwin({ businessType, onNext, onBack }: Step1DigitalTwinProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";
  const selectClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  // Available locations
  const availableLocations = ['Cavan'];

  // Location
  const [location, setLocation] = useState<string>('');

  // --- HOUSE MODE STATE ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedProfile, setParsedProfile] = useState<{
    hourly: number[];
    year: number;
    totalKwh: number;
    warnings: string[];
  } | null>(null);
  // Default to Electric Ireland Home Electric+ for domestic
  const [selectedDomesticTariff, setSelectedDomesticTariff] = useState<Tariff | null>(
    domesticTariffs.find(t => t.id === 'electric-ireland-home-electric-smart') || domesticTariffs[0] || null
  );

  // --- COMMERCIAL MODE STATE ---
  // Example months (default: January and July, initially empty)
  const [exampleMonths, setExampleMonths] = useState<ExampleMonth[]>([
    { monthIndex: 0, monthName: 'January', totalKwh: 0, totalBillEur: 0, tariffSlotUsage: {} },
    { monthIndex: 6, monthName: 'July', totalKwh: 0, totalBillEur: 0, tariffSlotUsage: {} }
  ]);

  const loadExampleData = () => {
    setExampleMonths([
      { monthIndex: 0, monthName: 'January', totalKwh: 60000, totalBillEur: 12000, tariffSlotUsage: {} },
      { monthIndex: 6, monthName: 'July', totalKwh: 45000, totalBillEur: 9000, tariffSlotUsage: {} }
    ]);
    setTariffType('flat');
  };

  // Tariff configuration
  const [tariffType, setTariffType] = useState<'flat' | 'custom'>('flat');
  const [customSlots, setCustomSlots] = useState<TariffSlot[]>([]);
  const [standingCharge, setStandingCharge] = useState<number>(0.9);

  // Curved consumption
  const curvedMonthlyKwh = useMemo(() => curveConsumption(exampleMonths), [exampleMonths]);

  // Build tariff config
  const tariffConfig: TariffConfiguration = useMemo(() => {
    if (tariffType === 'flat') {
      const flatRate = calculateAverageFlatRate(exampleMonths);
      return { type: 'flat', flatRate }; // No standing charge for flat rate
    }
    return { type: 'custom', customSlots, standingChargePerDay: standingCharge };
  }, [tariffType, exampleMonths, customSlots, standingCharge]);
  
  const updateExampleMonth = (index: number, updates: Partial<ExampleMonth>) => {
    setExampleMonths(prev => prev.map((m, i) => i === index ? { ...m, ...updates } : m));
  };

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
    // 1. Remove the slot definition
    const newSlots = customSlots.filter(s => s.id !== id);
    setCustomSlots(newSlots);

    // 2. Remove usage from months and recalculate totals
    const newMonths = exampleMonths.map(m => {
      const newUsage = Object.fromEntries(
        Object.entries(m.tariffSlotUsage).filter(([slotId]) => slotId !== id)
      );
      
      // Recalculate totalKwh based on remaining slots
      const newTotal = newSlots.reduce((sum, slot) => {
        return sum + (newUsage[slot.id] || 0);
      }, 0);

      return {
        ...m,
        tariffSlotUsage: newUsage,
        totalKwh: newTotal
      };
    });
    setExampleMonths(newMonths);
  };

  const updateSlotUsage = (monthIndex: number, slotId: string, kwhValue: number) => {
    setExampleMonths(prev => prev.map(m => {
      if (m.monthIndex !== monthIndex) return m;
      
      const newUsage = { ...m.tariffSlotUsage, [slotId]: kwhValue };
      
      // Auto-update totalKwh when slot usage changes
      const newTotal = customSlots.reduce((sum, slot) => {
        return sum + (newUsage[slot.id] || 0);
      }, 0);

      return { 
        ...m, 
        tariffSlotUsage: newUsage,
        totalKwh: newTotal 
      };
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setParsedProfile(null);

    try {
      const text = await file.text();
      const result = parseEsbUsageProfile(text);
      
      setParsedProfile({
        hourly: result.hourlyConsumption,
        year: result.year,
        totalKwh: result.totalKwh,
        warnings: result.warnings
      });
      
      logInfo('ui', 'Usage profile uploaded', { year: result.year, totalKwh: result.totalKwh });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      setUploadError(msg);
      logError('ui', 'File upload failed', { error: msg });
    }
  };

  const handleContinue = () => {
    // Branch A: Domestic / Real Usage
    if (businessType === 'house') {
      if (!parsedProfile) return;

      // For compatibility, we still populate curve/months with dummy or aggregated data
      // so the rest of the app doesn't crash, but the engine will prefer 'hourlyConsumptionOverride'.
      
      // Create a dummy monthly profile from the real hourly data for display in calendar
      // We can aggregate hourly -> monthly
      const monthlyKwh = new Array(12).fill(0);
      // Rough aggregation (ignoring exact day-of-month alignment for now, just 8760/12 chunks? No, let's do it properly if possible)
      // Actually, we don't strictly need accurate monthly breakdown for the engine if we pass override.
      // But the UI calendar sidebar uses curvedMonthlyKwh.
      // Let's do a simple aggregation.
      let hIdx = 0;
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // approx
      for (let m = 0; m < 12; m++) {
        const hours = daysInMonth[m] * 24;
        for (let h = 0; h < hours; h++) {
          if (hIdx < parsedProfile.hourly.length) {
            monthlyKwh[m] += parsedProfile.hourly[hIdx++];
          }
        }
      }

      onNext({
        location,
        exampleMonths: [], // Not used for house mode
        curvedMonthlyKwh: monthlyKwh, // Used for sidebar display
        tariffConfig: { type: 'flat', flatRate: 0.25 }, // Dummy tariff for compatibility
        hourlyConsumptionOverride: parsedProfile.hourly,
        selectedDomesticTariff: selectedDomesticTariff || undefined
      });
      return;
    }

    // Branch B: Commercial / Digital Twin
    // The `tariffSlotUsage` state stores absolute kWh for easy editing in the UI.
    // However, the rest of the app expects fractional usage (0-1).
    // We must normalize it before passing it to the next step to prevent calculation errors.
    const normalizedExampleMonths = exampleMonths.map(month => {
      if (tariffType !== 'custom' || !customSlots.length) {
        return { ...month, tariffSlotUsage: {} }; // Clear usage if not applicable
      }
      
      const totalSlotKwh = customSlots.reduce((sum, slot) => {
        return sum + (month.tariffSlotUsage[slot.id] || 0);
      }, 0);

      const normalizedSlotUsage: Record<string, number> = {};
      for (const slot of customSlots) {
        const kwh = month.tariffSlotUsage[slot.id] || 0;
        normalizedSlotUsage[slot.id] = totalSlotKwh > 0 ? kwh / totalSlotKwh : 0;
      }

      return {
        ...month,
        totalKwh: totalSlotKwh, // Also update the month's total kWh to match the sum of slots
        tariffSlotUsage: normalizedSlotUsage
      };
    });

    logInfo('ui', 'Step 1 (Digital Twin) continue clicked', {
      location,
      exampleMonths: normalizedExampleMonths,
      curvedMonthlyKwhTotal: curvedMonthlyKwh.reduce((a, b) => a + b, 0),
      tariffConfig
    });

    onNext({
      location,
      exampleMonths: normalizedExampleMonths,
      curvedMonthlyKwh,
      tariffConfig
    });
  };

  // Validation depends on mode
  const canContinue = useMemo(() => {
    if (!location) return false;
    
    if (businessType === 'house') {
      return !!parsedProfile && !!selectedDomesticTariff;
    }

    return (
      exampleMonths.length >= 2 && 
      (
        tariffType === 'flat' 
          ? exampleMonths.every(m => m.totalKwh > 0 && m.totalBillEur > 0)
          : (customSlots.length > 0 && exampleMonths.every(m => m.totalKwh > 0))
      )
    );
  }, [location, businessType, parsedProfile, exampleMonths, tariffType, customSlots]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Preamble */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-tines-purple to-indigo-600 mb-6 shadow-lg shadow-indigo-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
          </svg>
        </div>
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Building Your Digital Twin
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Let's model your current building's energy profile. We need your <span className="font-semibold text-tines-purple">location</span> and <span className="font-semibold text-tines-purple">consumption patterns</span>.
        </p>
      </div>

      {/* Section A: Location */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">Location</h3>
        <p className="text-sm text-slate-500 mb-6">
          Your location determines the solar irradiance patterns we'll use to model generation.
        </p>

        <Field label="County / Solar Region">
          <select
            className={selectClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">Select location...</option>
            {availableLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-400 italic">
            Used to load real solar irradiance timeseries data
          </p>
        </Field>
      </div>

      {/* Section B: Consumption & Tariff Profile */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">Consumption & Tariff Profile</h3>
        
        {businessType === 'house' ? (
          <div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-900 mb-2">Upload your Usage Data</h4>
              <p className="text-sm text-blue-800">
                For accurate domestic analysis, please upload your ESB Networks HDF (Historical Data File).
                You can download this from your ESB Networks account.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">ESB Networks CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-tines-purple file:text-white
                  hover:file:bg-indigo-600
                "
              />
              {uploadError && (
                <p className="mt-2 text-sm text-rose-600">{uploadError}</p>
              )}
            </div>

            {parsedProfile && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span className="font-semibold text-emerald-900">File processed successfully</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                  <div>
                    <span className="text-emerald-700 block text-xs uppercase tracking-wide">Year</span>
                    <span className="font-medium text-emerald-900">{parsedProfile.year}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 block text-xs uppercase tracking-wide">Total Consumption</span>
                    <span className="font-medium text-emerald-900">{Math.round(parsedProfile.totalKwh).toLocaleString()} kWh</span>
                  </div>
                </div>
                {parsedProfile.warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-800 mb-1">Notes:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {parsedProfile.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-emerald-700">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {parsedProfile && (
              <div className="mt-6">
                <DomesticTariffSelector
                  selectedTariffId={selectedDomesticTariff?.id}
                  onSelect={setSelectedDomesticTariff}
                />
              </div>
            )}
          </div>
        ) : (
          /* Tariff Type Selector for Commercial */
          <>
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setTariffType('flat')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tariffType === 'flat'
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Simple (Flat Rate)
              </button>
              <button
                type="button"
                onClick={() => setTariffType('custom')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tariffType === 'custom'
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Time-of-Use
              </button>
            </div>

            {/* Simple Mode - Just totals */}
            {tariffType === 'flat' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <p className="text-sm text-slate-500">
                    Select two different months (typically one winter, one summer) and enter your actual usage and bill amounts.
                  </p>
                  <button
                    type="button"
                    onClick={loadExampleData}
                    className="text-xs text-tines-purple hover:underline font-medium"
                  >
                    Load Example Data
                  </button>
                </div>

                <div className="space-y-6">
                  {exampleMonths.map((month, idx) => (
                    <div key={idx} className="p-6 rounded-lg border-2 border-slate-200 bg-slate-50">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Field label="Month">
                          <select
                            className={selectClass}
                            value={month.monthIndex}
                            onChange={(e) => {
                              const newIndex = Number(e.target.value);
                              updateExampleMonth(idx, {
                                monthIndex: newIndex,
                                monthName: MONTHS[newIndex].name
                              });
                            }}
                          >
                            {MONTHS.map(m => (
                              <option key={m.index} value={m.index}>{m.name}</option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Total kWh">
                          <input
                            className={inputClass}
                            type="number"
                            step={100}
                            value={month.totalKwh}
                            onChange={(e) => updateExampleMonth(idx, { totalKwh: Number(e.target.value) })}
                            placeholder="e.g., 60000"
                          />
                        </Field>

                        <Field label="Total Bill (€)">
                          <input
                            className={inputClass}
                            type="number"
                            step={10}
                            value={month.totalBillEur}
                            onChange={(e) => updateExampleMonth(idx, { totalBillEur: Number(e.target.value) })}
                            placeholder="e.g., 12000"
                          />
                        </Field>
                      </div>

                      {month.totalKwh > 0 && month.totalBillEur > 0 && (
                        <div className="mt-4 text-sm text-slate-600 bg-white p-3 rounded border border-slate-200">
                          <span className="font-medium">Implied rate:</span>{' '}
                          <span className="font-bold text-tines-purple">
                            €{(month.totalBillEur / month.totalKwh).toFixed(3)}/kWh
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Time-of-Use Mode - Breakdown by slots */}
            {tariffType === 'custom' && (
              <div>
                <p className="text-sm text-slate-500 mb-6">
                  Define time-of-use tariff slots and enter kWh consumed in each slot for two example months.
                </p>

                {/* Standing Charge */}
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

                {/* Tariff Slots Definition */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-4">Tariff Time Slots</h4>
                  <div className="space-y-4">
                    {customSlots.map(slot => (
                      <div key={slot.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                </div>

                {/* Example Months with kWh breakdown by slot */}
                <div className="space-y-6">
                  <h4 className="text-sm font-semibold text-slate-700">Example Month Consumption</h4>
                  {exampleMonths.map((month, idx) => {
                    // Calculate auto total from slots
                    const slotTotal = customSlots.reduce((sum, slot) => {
                      return sum + (month.tariffSlotUsage[slot.id] || 0);
                    }, 0);
                    
                    // Calculate bill from tariff config
                    const calculatedBill = calculateMonthlyBill(
                      slotTotal,
                      tariffConfig,
                      // Convert absolute kWh to fractions for calculation
                      Object.fromEntries(
                        customSlots.map(s => [s.id, slotTotal > 0 ? (month.tariffSlotUsage[s.id] || 0) / slotTotal : 0])
                      ),
                      month.monthIndex
                    );

                    return (
                      <div key={idx} className="p-6 rounded-lg border-2 border-slate-200 bg-slate-50">
                        <div className="mb-4">
                          <Field label="Month">
                            <select
                              className={selectClass}
                              value={month.monthIndex}
                              onChange={(e) => {
                                const newIndex = Number(e.target.value);
                                updateExampleMonth(idx, {
                                  monthIndex: newIndex,
                                  monthName: MONTHS[newIndex].name
                                });
                              }}
                            >
                              {MONTHS.map(m => (
                                <option key={m.index} value={m.index}>{m.name}</option>
                              ))}
                            </select>
                          </Field>
                        </div>

                        {/* kWh breakdown by slot */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                          {customSlots.map(slot => (
                            <Field key={slot.id} label={`${slot.name} (kWh)`}>
                              <input
                                className={inputClass}
                                type="number"
                                step={100}
                                value={month.tariffSlotUsage[slot.id] || 0}
                                onChange={(e) => updateSlotUsage(month.monthIndex, slot.id, Number(e.target.value))}
                              />
                            </Field>
                          ))}
                        </div>

                        {/* Auto-calculated totals */}
                        <div className="mt-4 p-4 bg-white rounded border border-slate-200">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-slate-600">Total kWh:</span>{' '}
                              <span className="font-bold text-slate-700">{slotTotal.toFixed(0)}</span>
                            </div>
                            <div>
                              <span className="font-medium text-slate-600">Calculated Bill:</span>{' '}
                              <span className="font-bold text-tines-purple">€{calculatedBill.toFixed(2)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 mt-2">Bill includes standing charge. Verify this matches your actual bill.</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        {onBack && (
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
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="px-8 py-3 bg-tines-purple text-white font-medium rounded-lg shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 ml-auto"
        >
          Continue to Solar Configuration
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Step1DigitalTwin;
