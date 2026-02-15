import { useState, useMemo } from 'react';
import { logInfo } from '../../utils/logger';
import { Field } from '../Field';
import { MONTH_LABELS } from '../../utils/consumption';
import { curveConsumption, calculateAverageFlatRate, estimateAnnualBills } from '../../utils/billingCalculations';
import type { ExampleMonth, TariffConfiguration, TariffSlot } from '../../types/billing';

interface Step1DigitalTwinProps {
  onNext: (data: {
    location: string;
    exampleMonths: ExampleMonth[];
    curvedMonthlyKwh: number[];
  }) => void;
  onBack?: () => void;
}

const MONTHS = MONTH_LABELS.map((name, index) => ({ index, name }));

export function Step1DigitalTwin({ onNext, onBack }: Step1DigitalTwinProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";
  const selectClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  // Available locations
  const availableLocations = ['Cavan'];

  // Location
  const [location, setLocation] = useState<string>('');

  // Example months (default: January and July)
  const [exampleMonths, setExampleMonths] = useState<ExampleMonth[]>([
    { monthIndex: 0, monthName: 'January', totalKwh: 60000, totalBillEur: 12000, tariffSlotUsage: {} },
    { monthIndex: 6, monthName: 'July', totalKwh: 45000, totalBillEur: 9000, tariffSlotUsage: {} }
  ]);

  // Curved consumption
  const curvedMonthlyKwh = useMemo(() => curveConsumption(exampleMonths), [exampleMonths]);
  
  const updateExampleMonth = (index: number, updates: Partial<ExampleMonth>) => {
    setExampleMonths(prev => prev.map((m, i) => i === index ? { ...m, ...updates } : m));
  };

  const handleContinue = () => {
    logInfo('ui', 'Step 1 (Digital Twin) continue clicked', {
      location,
      exampleMonths,
      curvedMonthlyKwhTotal: curvedMonthlyKwh.reduce((a, b) => a + b, 0)
    });

    onNext({
      location,
      exampleMonths,
      curvedMonthlyKwh
    });
  };

  const canContinue = location && 
    exampleMonths.length >= 2 && 
    exampleMonths.every(m => m.totalKwh > 0 && m.totalBillEur > 0);

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

      {/* Section B: Consumption Profile */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">Consumption Profile</h3>
        <p className="text-sm text-slate-500 mb-6">
          Select two different months (typically one winter, one summer) and enter your actual usage and bill amounts.
        </p>

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
