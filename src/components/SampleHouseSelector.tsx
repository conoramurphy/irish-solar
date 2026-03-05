/**
 * SampleHouseSelector — shared UI component used by both the Solar Wizard
 * (Step1DigitalTwin, house mode) and the Tariff Comparator (TariffModeller).
 *
 * Renders three buttons for the Irish domestic sample profiles defined in
 * src/data/sampleHouses.ts. Clicking a button fetches the corresponding CSV
 * from /public/data/usages/, parses it via parseEsbUsageProfile(), and calls
 * onLoad with the result.
 */

import { useState } from 'react';
import { SAMPLE_HOUSES } from '../data/sampleHouses';
import { parseEsbUsageProfile } from '../utils/usageProfileParser';

export interface SampleHouseLoadResult {
  houseId: string;
  hourly: number[];
  year: number;
  totalKwh: number;
  warnings: string[];
  filename: string;
}

interface SampleHouseSelectorProps {
  /** Called once the CSV has been fetched and parsed. */
  onLoad: (result: SampleHouseLoadResult) => void;
  /** ID of the currently active sample (if any), for visual indication. */
  activeId?: string | null;
}

const ICONS: Record<string, string> = {
  'house-small-traditional': '🏠',
  'house-large-traditional': '🏡',
  'house-heat-pump': '♨️',
};

export function SampleHouseSelector({ onLoad, activeId }: SampleHouseSelectorProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (houseId: string, csvPath: string, label: string) => {
    setLoadingId(houseId);
    setError(null);
    try {
      const response = await fetch(csvPath);
      if (!response.ok) throw new Error(`Could not load sample (HTTP ${response.status})`);
      const text = await response.text();
      const result = parseEsbUsageProfile(text);
      onLoad({
        houseId,
        hourly: result.hourlyConsumption,
        year: result.year,
        totalKwh: result.totalKwh,
        warnings: result.warnings,
        filename: label,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        No file to hand? Load a research-backed Irish house sample:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SAMPLE_HOUSES.map((house) => {
          const isActive = activeId === house.id;
          const isLoading = loadingId === house.id;
          const isDisabled = loadingId !== null;

          return (
            <button
              key={house.id}
              type="button"
              disabled={isDisabled}
              onClick={() => handleSelect(house.id, house.csvPath, house.label)}
              className={[
                'flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left text-sm font-medium transition-all',
                isActive
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-900 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40',
                isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <span className="flex items-center gap-2 font-semibold text-slate-800">
                {isLoading ? (
                  <svg
                    className="animate-spin w-4 h-4 text-indigo-500"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                ) : (
                  <span>{ICONS[house.id]}</span>
                )}
                {house.label}
              </span>
              <span className="text-xs text-slate-500 leading-snug">{house.tagline}</span>
              {isActive && (
                <span className="mt-1 text-xs font-medium text-indigo-600">✓ Loaded</span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 text-sm font-medium text-rose-600 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}

      <p className="text-xs text-slate-400 mt-3 leading-relaxed">
        Profiles based on SEAI Energy in Ireland 2024, CSO Household Energy Survey, and SEAI Heat
        Pump Monitoring Report 2023. Year 2025 profile.
      </p>
    </div>
  );
}
