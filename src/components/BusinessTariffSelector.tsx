import type { Tariff } from '../types';
import rawTariffsData from '../data/tariffs.json';

const businessTariffs = rawTariffsData as unknown as Tariff[];

interface BusinessTariffSelectorProps {
  selectedTariffId?: string;
  onSelect: (tariff: Tariff) => void;
}

function formatRate(rate: number | undefined): string {
  if (rate === undefined) return 'N/A';
  return `${(rate * 100).toFixed(2)}c/kWh`;
}

function formatStandingCharge(daily: number): string {
  return `€${(daily * 365).toFixed(0)}/yr`;
}

export function BusinessTariffSelector({ selectedTariffId, onSelect }: BusinessTariffSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Select your business electricity tariff</h4>
        <p className="text-xs text-slate-500">
          Choose the tariff that best matches your business electricity plan.
        </p>
      </div>

      {businessTariffs.map((tariff) => {
        const isSelected = tariff.id === selectedTariffId;
        const dayRate = tariff.rates.find(r => r.period === 'day')?.rate;
        const nightRate = tariff.rates.find(r => r.period === 'night')?.rate;
        const peakRate = tariff.rates.find(r => r.period === 'peak')?.rate;
        const allDayRate = tariff.rates.find(r => r.period === 'all-day')?.rate;

        return (
          <button
            key={tariff.id}
            type="button"
            onClick={() => onSelect(tariff)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              isSelected
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`font-semibold text-sm ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                    {tariff.supplier}
                  </span>
                  <span className={`text-sm ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                    — {tariff.product}
                  </span>
                  {tariff.type === 'time-of-use' && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                      Time-of-Use
                    </span>
                  )}
                  {tariff.type === '24-hour' && (
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                      Flat Rate
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                  {allDayRate !== undefined && (
                    <span>Rate: <strong>{formatRate(allDayRate)}</strong></span>
                  )}
                  {dayRate !== undefined && (
                    <span>Day: <strong>{formatRate(dayRate)}</strong></span>
                  )}
                  {nightRate !== undefined && (
                    <span>Night: <strong>{formatRate(nightRate)}</strong></span>
                  )}
                  {peakRate !== undefined && (
                    <span>Peak: <strong>{formatRate(peakRate)}</strong></span>
                  )}
                  <span>Standing: <strong>{formatStandingCharge(tariff.standingCharge)}</strong></span>
                  {tariff.exportRate && (
                    <span>Export: <strong>{formatRate(tariff.exportRate)}</strong></span>
                  )}
                </div>
              </div>

              <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
              }`}>
                {isSelected && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
