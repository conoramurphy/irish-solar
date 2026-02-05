import { Field } from '../Field';
import { MONTH_LABELS } from '../../utils/consumption';
import type { ConsumptionProfile } from '../../types';

interface Step1ConsumptionProfileProps {
  winterMonthlyKwh: number;
  setWinterMonthlyKwh: (v: number) => void;
  summerMonthlyKwh: number;
  setSummerMonthlyKwh: (v: number) => void;
  consumptionProfile: ConsumptionProfile;
  onNext: () => void;
}

export function Step1ConsumptionProfile({
  winterMonthlyKwh,
  setWinterMonthlyKwh,
  summerMonthlyKwh,
  setSummerMonthlyKwh,
  consumptionProfile,
  onNext
}: Step1ConsumptionProfileProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  const handleContinue = () => {
    if (winterMonthlyKwh > 0 && summerMonthlyKwh > 0) {
      onNext();
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Preamble */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-tines-purple to-indigo-600 mb-6 shadow-lg shadow-indigo-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Understanding Your Energy Usage
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Your consumption profile is the <span className="font-semibold text-tines-purple">foundation</span> of an accurate ROI calculation. 
          By understanding your energy patterns, we can precisely model how solar generation will offset your costs throughout the year.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500 bg-indigo-50 px-4 py-2 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-tines-purple">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          This typically takes 2 minutes
        </div>
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-2">Monthly Consumption</h3>
        <p className="text-sm text-slate-500 mb-8">
          Enter your typical winter and summer monthly electricity usage. We'll generate a complete seasonal profile.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="relative">
            <Field label="Winter Peak (kWh/month)">
              <input
                className={inputClass}
                type="number"
                step={100}
                value={winterMonthlyKwh}
                onChange={(e) => setWinterMonthlyKwh(Number(e.target.value))}
                placeholder="e.g., 60000"
              />
            </Field>
            <p className="mt-2 text-xs text-slate-400 italic">Typical months: December, January, February</p>
          </div>

          <div className="relative">
            <Field label="Summer Low (kWh/month)">
              <input
                className={inputClass}
                type="number"
                step={100}
                value={summerMonthlyKwh}
                onChange={(e) => setSummerMonthlyKwh(Number(e.target.value))}
                placeholder="e.g., 45000"
              />
            </Field>
            <p className="mt-2 text-xs text-slate-400 italic">Typical months: June, July, August</p>
          </div>
        </div>

        {/* Preview of Monthly Profile */}
        {winterMonthlyKwh > 0 && summerMonthlyKwh > 0 && (
          <div className="border-t border-slate-100 pt-6">
            <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Projected Monthly Load Profile
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
              {consumptionProfile.months.map((m) => (
                <div key={m.monthIndex} className="text-center p-3 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 transition-all hover:shadow-md hover:scale-105">
                  <div className="text-slate-500 mb-2 font-medium">{MONTH_LABELS[m.monthIndex]}</div>
                  <div className="font-bold text-slate-900 text-sm">{m.totalKwh.toLocaleString()}</div>
                  <div className="text-slate-400 text-xs mt-1">kWh</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!winterMonthlyKwh || !summerMonthlyKwh}
          className="px-8 py-3 bg-tines-purple text-white font-medium rounded-lg shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
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
