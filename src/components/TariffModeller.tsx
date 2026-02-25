import { useMemo, useRef, useState } from 'react';
import { domesticTariffs } from '../utils/domesticTariffParser';
import { compareDomesticTariffsForUsage } from '../utils/tariffComparison';
import { formatCurrency } from '../utils/format';
import { parseEsbUsageProfile } from '../utils/usageProfileParser';

interface TariffModellerProps {
  onBackToModes: () => void;
}

function formatUnitRate(value: number) {
  return `€${value.toFixed(4)}/kWh`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function TariffModeller({ onBackToModes }: TariffModellerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedProfile, setParsedProfile] = useState<{
    hourly: number[];
    year: number;
    totalKwh: number;
    warnings: string[];
  } | null>(null);

  const [selectedTariffId, setSelectedTariffId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!parsedProfile) return [];

    return compareDomesticTariffsForUsage({
      hourlyConsumption: parsedProfile.hourly,
      year: parsedProfile.year,
      tariffs: domesticTariffs
    });
  }, [parsedProfile]);

  const selectedRow = useMemo(() => {
    if (!selectedTariffId) return null;
    return rows.find((r) => r.tariff.id === selectedTariffId) ?? null;
  }, [rows, selectedTariffId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setParsedProfile(null);
    setSelectedTariffId(null);

    try {
      const text = await file.text();
      const result = parseEsbUsageProfile(text);

      setParsedProfile({
        hourly: result.hourlyConsumption,
        year: result.year,
        totalKwh: result.totalKwh,
        warnings: result.warnings
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      setUploadError(msg);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-serif font-bold text-tines-dark">Tariff Modeller (Domestic)</h2>
          <p className="mt-1 text-slate-600">
            Upload your ESB Networks HDF usage CSV. We’ll estimate your annual bill for every domestic tariff and rank them.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToModes}
          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
        >
          Back to mode select
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">ESB Networks CSV File</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-tines-purple file:text-white hover:file:bg-indigo-600"
          />
          {uploadError && <p className="mt-2 text-sm text-rose-600">{uploadError}</p>}
        </div>

        {parsedProfile && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 mb-8">
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="text-sm font-semibold text-emerald-900">File processed</div>
                <div className="text-sm text-emerald-800 mt-1">
                  Year: <span className="font-medium">{parsedProfile.year}</span> · Total usage:{' '}
                  <span className="font-medium">{Math.round(parsedProfile.totalKwh).toLocaleString()} kWh</span>
                </div>
              </div>
              <div className="text-sm text-emerald-700">Comparing {domesticTariffs.length} tariffs</div>
            </div>

            {parsedProfile.warnings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <div className="text-xs font-semibold text-emerald-900 mb-1">Notes</div>
                <ul className="list-disc pl-5 space-y-1">
                  {parsedProfile.warnings.map((w, idx) => (
                    <li key={idx} className="text-xs text-emerald-800">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Supplier</th>
                    <th className="px-4 py-3 text-left font-semibold">Plan</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Annual bill</th>
                    <th className="px-4 py-3 text-right font-semibold">Δ vs best</th>
                    <th className="px-4 py-3 text-right font-semibold">Standing</th>
                    <th className="px-4 py-3 text-right font-semibold">All-in rate</th>
                    <th className="px-4 py-3 text-right font-semibold">Cheapest</th>
                    <th className="px-4 py-3 text-right font-semibold">Max</th>
                    <th className="px-4 py-3 text-right font-semibold">Rates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((r, idx) => {
                    const isSelected = r.tariff.id === selectedTariffId;
                    return (
                      <tr
                        key={r.tariff.id}
                        onClick={() => setSelectedTariffId(r.tariff.id)}
                        className={
                          'cursor-pointer hover:bg-slate-50 ' +
                          (isSelected ? 'bg-indigo-50/50' : 'bg-white')
                        }
                      >
                        <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.tariff.supplier}</td>
                        <td className="px-4 py-3 text-slate-700">{r.tariff.product}</td>
                        <td className="px-4 py-3 text-slate-700">{r.tariff.type}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(r.annualCostEur)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {idx === 0 ? (
                            <span className="text-emerald-700 font-medium">Best</span>
                          ) : (
                            <span>
                              {formatCurrency(r.deltaVsBestEur)} ({formatPercent(r.deltaVsBestPct)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(r.annualStandingEur)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatUnitRate(r.effectiveAllInImportRateEurPerKwh)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {formatUnitRate(r.minUnitRate)} · {formatPercent(r.pctKwhAtCheapestRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {formatUnitRate(r.maxUnitRate)} · {formatPercent(r.pctKwhAtMaxRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{r.distinctRateCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedRow && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <div className="text-lg font-serif font-bold text-tines-dark">{selectedRow.tariff.supplier}</div>
                    <div className="text-slate-600">{selectedRow.tariff.product}</div>
                    <div className="mt-2 text-sm text-slate-600">
                      Annual bill: <span className="font-semibold text-slate-900">{formatCurrency(selectedRow.annualCostEur)}</span>
                      <span className="text-slate-400"> · </span>
                      Standing: <span className="font-medium">{formatCurrency(selectedRow.annualStandingEur)}</span>
                      <span className="text-slate-400"> · </span>
                      Energy rate: <span className="font-medium">{formatUnitRate(selectedRow.effectiveAllInImportRateEurPerKwh)}</span>
                    </div>
                  </div>

                  <div className="text-sm text-slate-600">
                    <div>EV window: {selectedRow.hasEvWindow ? 'Yes' : 'No'}</div>
                    <div>Free window: {selectedRow.hasFreeWindow ? 'Yes' : 'No'}</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-slate-700 mb-2">Usage by effective bucket</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(selectedRow.kwhByEffectiveBucket)
                      .sort((a, b) => b[1] - a[1])
                      .map(([bucket, kwh]) => (
                        <div key={bucket} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs uppercase tracking-wide text-slate-500">{bucket}</div>
                          <div className="text-sm font-semibold text-slate-900">{Math.round(kwh).toLocaleString()} kWh</div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!parsedProfile && (
          <div className="mt-10 text-sm text-slate-500">
            Tip: this uses your actual hourly usage (from ESB’s half-hourly reads aggregated to hours) and applies each tariff’s
            rate windows (including EV/free windows where present).
          </div>
        )}
      </div>
    </div>
  );
}
