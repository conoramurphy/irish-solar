import { useState, type ReactNode } from 'react';
import type { CalculationResult } from '../types';
import { AuditModal } from './AuditModal';

interface ResultsSectionProps {
  result: CalculationResult | null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(value);
}

function MetricRow({
  label,
  value,
  hint,
  valueClassName
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-sm font-medium text-slate-700 leading-snug">{label}</div>
        <div className={`shrink-0 text-right text-lg font-semibold text-slate-900 tabular-nums whitespace-nowrap ${valueClassName ?? ''}`}>
          {value}
        </div>
      </div>
      {hint && <div className="mt-2 text-xs text-slate-400 leading-snug">{hint}</div>}
    </div>
  );
}

export function ResultsSection({ result }: ResultsSectionProps) {
  const [auditOpen, setAuditOpen] = useState(false);

  if (!result) {
    return (
      <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-10 text-center h-full flex flex-col items-center justify-center text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-4 opacity-50">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p>Run a calculation to generate the ROI report.</p>
      </div>
    );
  }

  const reportDate = new Date().toLocaleDateString();
  const year1NetCashflow = result.cashFlows[0]?.netCashFlow ?? 0;

  return (
    <section className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      <div className="px-8 py-7 md:px-10 md:py-8 border-b border-slate-100">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl font-serif font-bold text-tines-dark leading-tight">Projected Impact Report</h2>
            <p className="mt-1 text-sm text-slate-500">Summary of costs, savings, and returns based on your inputs.</p>
          </div>
          <div className="text-sm font-medium text-slate-400 shrink-0">{reportDate}</div>
        </div>
      </div>

      <div className="p-6 md:p-8">
        {/*
          NOTE: ResultsSection often renders in the right sidebar (narrow column).
          Use a single-column layout by default; only split into two columns on very wide screens.
        */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <div className="rounded-xl border border-slate-100 bg-white">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Financial Overview</h3>
              </div>
              <div className="px-4 divide-y divide-slate-100">
                <MetricRow
                  label="System Cost"
                  value={formatCurrency(result.systemCost)}
                  hint="Total installed cost before any grants or financing."
                />
                <MetricRow
                  label="Net Cost (after grants)"
                  value={formatCurrency(result.netCost)}
                  hint="Your effective project cost after eligible grants are applied."
                />
                <MetricRow
                  label="Annual Savings"
                  value={formatCurrency(result.annualSavings)}
                  hint="Estimated reduction in electricity bill in a typical year (Year 1 baseline)."
                  valueClassName="text-emerald-600 text-2xl"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="rounded-xl border border-slate-100 bg-white">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Performance Metrics</h3>
              </div>
              <div className="px-4 divide-y divide-slate-100">
                <MetricRow
                  label="Annual Generation"
                  value={
                    <span>
                      {formatNumber(result.annualGeneration)}
                      <span className="ml-2 text-sm text-slate-400 font-medium">kWh</span>
                    </span>
                  }
                  hint="Total solar energy produced over the selected solar year."
                />

                <MetricRow
                  label="Exported Energy"
                  value={
                    <span>
                      {formatNumber(result.annualExport)}
                      <span className="ml-2 text-sm text-slate-400 font-medium">kWh</span>
                    </span>
                  }
                  hint="Solar energy sent back to the grid (not used on-site)."
                />

                <MetricRow
                  label="Simple Payback"
                  value={Number.isFinite(result.simplePayback) ? `${result.simplePayback.toFixed(1)} years` : '∞'}
                  hint="Net Cost ÷ Annual Savings (ignores discounting and financing)."
                />

                <MetricRow
                  label="IRR"
                  value={Number.isFinite(result.irr) ? `${(result.irr * 100).toFixed(2)}%` : '—'}
                  hint="Internal rate of return over the full analysis period (annualized)."
                />

                <MetricRow
                  label="NPV (25y)"
                  value={formatCurrency(result.npv)}
                  hint="Net present value of all cashflows over 25 years, discounted at the model rate."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xs font-bold tracking-wider text-slate-400 uppercase">First Year Cashflow</div>
              <div className="mt-1 text-sm text-slate-600">Year 1 net cashflow = savings + export revenue − loan payments (if any).</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Net cashflow (Year 1)</div>
              <div className="mt-0.5 text-xl font-bold text-slate-900">{formatCurrency(year1NetCashflow)}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            {result.audit ? (
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setAuditOpen(true)}
              >
                Auditor Mode
              </button>
            ) : (
              <p className="text-xs text-slate-400">Auditor Mode becomes available when an 8,760-hour solar timeseries is provided.</p>
            )}
          </div>

          <button className="text-sm text-tines-purple font-medium hover:text-indigo-700 flex items-center gap-1 transition-colors">
            Download Full PDF Report
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>

        {auditOpen && result.audit && <AuditModal audit={result.audit} onClose={() => setAuditOpen(false)} />}
      </div>
    </section>
  );
}
