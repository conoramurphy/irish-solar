import { useMemo, useState } from 'react';
import type { CalculationResult, HourlyEnergyFlow } from '../types';
import { formatCurrencyPrecise as formatCurrency, formatKwh } from '../utils/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape((r as any)[h])).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function hourToMonthIndexFallback(hour: number, totalHoursInYear: number): number {
  const febDays = totalHoursInYear === 8784 ? 29 : 28;
  const daysPerMonth = [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let cumulativeHours = 0;
  for (let m = 0; m < 12; m++) {
    const monthHours = daysPerMonth[m] * 24;
    if (hour < cumulativeHours + monthHours) return m;
    cumulativeHours += monthHours;
  }
  return 11;
}

export function AuditModal({ audit, onClose }: { audit: NonNullable<CalculationResult['audit']>; onClose: () => void }) {
  const [tab, setTab] = useState<'hourly' | 'monthly'>('monthly');
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 200;

  const bucketOptions = useMemo(() => {
    const set = new Set(audit.hourly.map((h) => h.tariffBucket));
    return Array.from(set).sort();
  }, [audit.hourly]);

  const filteredHourly = useMemo(() => {
    const q = query.trim().toLowerCase();

    return audit.hourly.filter((h) => {
      if (bucket && h.tariffBucket !== bucket) return false;
      if (!q) return true;

      // Simple search over a few high-signal columns.
      const monthIndex = typeof h.monthIndex === 'number' ? h.monthIndex : hourToMonthIndexFallback(h.hour, audit.hourly.length);
      const month = MONTHS[monthIndex] ?? '';
      const hay = `${h.hour} ${month} ${h.tariffBucket}`.toLowerCase();
      return hay.includes(q);
    });
  }, [audit.hourly, query, bucket]);

  const pageCount = Math.max(1, Math.ceil(filteredHourly.length / pageSize));
  const pagedHourly = useMemo(() => {
    const p = Math.max(1, Math.min(page, pageCount));
    const start = (p - 1) * pageSize;
    return filteredHourly.slice(start, start + pageSize);
  }, [filteredHourly, page, pageCount]);

  const hourlyCsvRows = useMemo(() => {
    return audit.hourly.map((h) => ({
      hour: h.hour,
      hourKey: h.hourKey ?? '',
      month: MONTHS[typeof h.monthIndex === 'number' ? h.monthIndex : hourToMonthIndexFallback(h.hour, audit.hourly.length)],
      tariffBucket: h.tariffBucket,
      generationKwh: h.generation,
      consumptionKwh: h.consumption,
      gridImportKwh: h.gridImport,
      gridExportKwh: h.gridExport,
      batteryChargeKwh: h.batteryCharge,
      batteryDischargeKwh: h.batteryDischarge,
      batterySoCKwh: h.batterySoC,
      baselineCostEur: h.baselineCost,
      importCostEur: h.importCost,
      exportRevenueEur: h.exportRevenue,
      savingsEur: h.savings
    }));
  }, [audit.hourly]);

  const monthlyCsvRows = useMemo(() => {
    return audit.monthly.map((m) => ({
      monthIndex: m.monthIndex,
      month: MONTHS[m.monthIndex],
      generationKwh: m.generation,
      consumptionKwh: m.consumption,
      gridImportKwh: m.gridImport,
      gridExportKwh: m.gridExport,
      selfConsumptionKwh: m.selfConsumption,
      baselineCostEur: m.baselineCost,
      importCostEur: m.importCost,
      exportRevenueEur: m.exportRevenue,
      savingsEur: m.savings,
      debtPaymentEur: m.debtPayment,
      netOutOfPocketEur: m.netOutOfPocket
    }));
  }, [audit.monthly]);

  const totals = useMemo(() => {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    return {
      generation: sum(audit.hourly.map((h) => h.generation)),
      consumption: sum(audit.hourly.map((h) => h.consumption)),
      gridImport: sum(audit.hourly.map((h) => h.gridImport)),
      gridExport: sum(audit.hourly.map((h) => h.gridExport)),
      baselineCost: sum(audit.hourly.map((h) => h.baselineCost)),
      importCost: sum(audit.hourly.map((h) => h.importCost)),
      exportRevenue: sum(audit.hourly.map((h) => h.exportRevenue)),
      savings: sum(audit.hourly.map((h) => h.savings))
    };
  }, [audit.hourly]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/60" onClick={onClose} />

      <div className="absolute inset-4 md:inset-8 rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-serif font-bold text-slate-900">Auditor Mode</h2>
            <p className="text-sm text-slate-500 mt-1">
              Read-only debug view. Hourly table is the source of truth; monthly is strict aggregation.
            </p>
            {audit.year && <p className="text-xs text-slate-400 mt-1">Solar timeseries year: {audit.year}</p>}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => downloadCsv('audit-hourly.csv', hourlyCsvRows)}
            >
              Export hourly CSV
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => downloadCsv('audit-monthly.csv', monthlyCsvRows)}
            >
              Export monthly CSV
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              className={`px-3 py-2 text-sm ${tab === 'monthly' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
              onClick={() => setTab('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm ${tab === 'hourly' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
              onClick={() => setTab('hourly')}
            >
              Hourly
            </button>
          </div>

          <div className="text-xs text-slate-600">
            Totals: {formatKwh(totals.generation)} kWh gen · {formatKwh(totals.consumption)} kWh load ·{' '}
            {formatCurrency(totals.savings)} savings
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {tab === 'hourly' && (
              <>
                <input
                  className="rounded-md border-slate-300 text-sm"
                  placeholder="Search (hour / month / bucket)"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
                <select
                  className="rounded-md border-slate-300 text-sm"
                  value={bucket}
                  onChange={(e) => {
                    setBucket(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All buckets</option>
                  {bucketOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {tab === 'monthly' ? (
            <MonthlyTable monthly={audit.monthly} />
          ) : (
            <>
              <HourlyTable rows={pagedHourly} />
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
                <div className="text-xs text-slate-500">
                  Showing {pagedHourly.length.toLocaleString()} of {filteredHourly.length.toLocaleString()} rows (page {page} / {pageCount}).
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-600 space-y-1">
          <div>
            <span className="font-semibold text-slate-700">Hourly definition:</span> {audit.provenance.hourlyDefinition}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Monthly aggregation:</span> {audit.provenance.monthlyAggregationDefinition}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthlyTable({ monthly }: { monthly: NonNullable<CalculationResult['audit']>['monthly'] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="sticky top-0 bg-white">
        <tr className="border-b border-slate-200">
          <th className="px-4 py-3 text-left font-semibold text-slate-700">Month</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Gen (kWh)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Load (kWh)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Import (kWh)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Export (kWh)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Self-cons (kWh)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Baseline (€)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Import cost (€)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Export rev (€)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Savings (€)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Debt pay (€)</th>
          <th className="px-4 py-3 text-right font-semibold text-slate-700">Out of pocket (€)</th>
        </tr>
      </thead>
      <tbody>
        {monthly.map((m) => (
          <tr key={m.monthIndex} className="border-b border-slate-100">
            <td className="px-4 py-2 text-left text-slate-700">{MONTHS[m.monthIndex]}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatKwh(m.generation)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatKwh(m.consumption)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatKwh(m.gridImport)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatKwh(m.gridExport)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatKwh(m.selfConsumption)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.baselineCost)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.importCost)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.exportRevenue)}</td>
            <td className={`px-4 py-2 text-right tabular-nums ${m.savings >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(m.savings)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.debtPayment)}</td>
            <td className={`px-4 py-2 text-right tabular-nums ${m.netOutOfPocket >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(m.netOutOfPocket)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HourlyTable({ rows }: { rows: HourlyEnergyFlow[] }) {
  return (
    <table className="min-w-full text-xs">
      <thead className="sticky top-0 bg-white">
        <tr className="border-b border-slate-200">
          <th className="px-3 py-2 text-left font-semibold text-slate-700">Hour</th>
          <th className="px-3 py-2 text-left font-semibold text-slate-700">Hour key</th>
          <th className="px-3 py-2 text-left font-semibold text-slate-700">Month</th>
          <th className="px-3 py-2 text-left font-semibold text-slate-700">Bucket</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Gen</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Load</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Import</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Export</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">SoC</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Baseline €</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Import €</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Export €</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-700">Savings €</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.hour} className="border-b border-slate-100">
            <td className="px-3 py-2 text-left tabular-nums">{h.hour}</td>
            <td className="px-3 py-2 text-left font-mono text-[10px] text-slate-500">{h.hourKey ?? '—'}</td>
            <td className="px-3 py-2 text-left">{MONTHS[typeof h.monthIndex === 'number' ? h.monthIndex : hourToMonthIndexFallback(h.hour, rows.length)]}</td>
            <td className="px-3 py-2 text-left">{h.tariffBucket}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatKwh(h.generation)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatKwh(h.consumption)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatKwh(h.gridImport)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatKwh(h.gridExport)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatKwh(h.batterySoC)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(h.baselineCost)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(h.importCost)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(h.exportRevenue)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${h.savings >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(h.savings)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
