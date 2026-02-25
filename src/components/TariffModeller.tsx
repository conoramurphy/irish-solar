import { useMemo, useRef, useState } from 'react';
import { domesticTariffs } from '../utils/domesticTariffParser';
import { compareDomesticTariffsForUsage } from '../utils/tariffComparison';
import { formatCurrency } from '../utils/format';
import { parseEsbUsageProfile } from '../utils/usageProfileParser';

function formatUnitRate(value: number) {
  return `€${value.toFixed(4)}/kWh`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function TariffModeller() {
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
    <div className="max-w-5xl mx-auto pb-4">
      {/* Page header */}
      <div className="mb-10">
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 tracking-tight">Electricity Tariff Comparer</h2>
        <p className="mt-3 text-base text-slate-500 max-w-2xl font-light leading-relaxed">
          Upload your ESB Networks usage file and we'll rank every Irish domestic tariff by what your annual bill would be — applied to your actual hourly consumption.
        </p>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-200/80 shadow-[0_2px_12px_rgb(0,0,0,0.03)] p-8">
        {/* File upload section */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-slate-900 mb-2">Your usage file</label>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            Download your HDF data from{' '}
            <a href="https://myaccount.esbnetworks.ie/" target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-700 underline decoration-indigo-200 underline-offset-2">ESB Networks My Account</a>, 
            then upload the CSV file here.
          </p>
          <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-2xl p-6 transition-colors group bg-slate-50/50 hover:bg-indigo-50/30">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex items-center justify-center gap-4 pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-sm font-medium text-slate-700">
                Click to browse <span className="text-slate-400 font-normal">or drag and drop your CSV</span>
              </div>
            </div>
          </div>
          {uploadError && <p className="mt-4 text-sm font-medium text-rose-600 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>
            {uploadError}
          </p>}
        </div>

        {/* Empty state — shown before any file is uploaded */}
        {!parsedProfile && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-5">How it works</p>
            <ul className="space-y-4">
              {[
                'Your usage data is read at half-hourly resolution and aggregated to hourly intervals.',
                'Each tariff\'s rate windows — including EV night rates and free-hour slots — are applied hour by hour.',
                'Tariffs are ranked by estimated annual bill, so you can see exactly how much each plan would have cost you.',
              ].map((point) => (
                <li key={point} className="flex items-start gap-4 text-sm text-slate-600 leading-relaxed">
                  <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-5 border-t border-slate-200/60">
              <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Your data is processed entirely in your browser. Nothing is sent to a server.
              </p>
            </div>
          </div>
        )}

        {/* Parsed profile summary */}
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

        {/* Results table */}
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
      </div>
    </div>
  );
}
