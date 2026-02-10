import { useState, type ReactNode, useMemo } from 'react';
import type { CalculationResult, SystemConfiguration } from '../types';
import { AuditModal } from './AuditModal';
import { EnergyAnalyticsChart } from './EnergyAnalyticsChart';

interface ResultsSectionProps {
  result: CalculationResult | null;
  config?: SystemConfiguration;
  onSelectSimulation?: (annualProduction: number) => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(value);
}

function formatSignedCurrency(value: number) {
  const sign = value >= 0 ? '+' : '−';
  const abs = Math.abs(value);
  return `${sign}${formatCurrency(abs)}`;
}

function formatPercentFraction(fraction: number, digits = 1) {
  const f = Number.isFinite(fraction) ? fraction : 0;
  return `${(f * 100).toFixed(digits)}%`;
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

export function ResultsSection({ result, config, onSelectSimulation }: ResultsSectionProps) {
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

  const analyticsYear = useMemo(() => {
    const y = result.audit?.year;
    if (typeof y === 'number') return y;
    const hk = result.audit?.hourly?.[0]?.hourKey;
    if (hk) {
      const maybeYear = Number(hk.slice(0, 4));
      if (Number.isFinite(maybeYear)) return maybeYear;
    }
    return new Date().getFullYear();
  }, [result.audit?.hourly, result.audit?.year]);

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
        {/* 1. Energy Analytics Chart (Top) */}
        {result.audit?.hourly && result.audit.hourly.length > 0 && (
          <div className="mb-8">
            <EnergyAnalyticsChart hourlyData={result.audit.hourly} year={analyticsYear} />
          </div>
        )}

        {/* Savings Breakdown Compact Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
             <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Total Annual Savings</div>
             <div className="text-2xl font-bold text-emerald-700">{formatCurrency(result.annualSavings)}</div>
             <div className="text-xs text-emerald-600/80 mt-1">Bill Reduction + Revenue</div>
          </div>
          
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
             <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Solar Displacement</div>
             <div className="text-xl font-bold text-slate-700">{formatCurrency(result.annualSolarToLoadSavings)}</div>
             <div className="text-xs text-slate-400 mt-1">Direct to Load</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
             <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Battery Displacement</div>
             <div className="text-xl font-bold text-slate-700">{formatCurrency(result.annualBatteryToLoadSavings)}</div>
             <div className="text-xs text-slate-400 mt-1">Stored & Discharged</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
             <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Export Income</div>
             <div className="text-xl font-bold text-slate-700">{formatCurrency(result.annualExportRevenue)}</div>
             <div className="text-xs text-slate-400 mt-1">Feed-in / Market</div>
          </div>
        </div>

        {/* 2. Combined Financial & Performance Metrics */}
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">System Performance & Financials</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {/* Left Column: Financials */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Financial Overview</div>
              <MetricRow
                label="System Cost"
                value={formatCurrency(result.systemCost)}
                hint="Total installed cost before any grants or financing."
              />
              <MetricRow
                label="Net Cost"
                value={formatCurrency(result.netCost)}
                hint="Effective cost after eligible grants."
              />
              <MetricRow
                label="Annual Savings"
                value={formatCurrency(result.annualSavings)}
                hint="Estimated Year 1 bill reduction."
                valueClassName="text-emerald-600 font-bold"
              />
              <MetricRow
                label="Simple Payback"
                value={Number.isFinite(result.simplePayback) ? `${result.simplePayback.toFixed(1)} years` : '∞'}
                hint="Net Cost ÷ Annual Savings."
              />
              <MetricRow
                label="IRR (25y)"
                value={Number.isFinite(result.irr) ? `${(result.irr * 100).toFixed(1)}%` : '—'}
                hint="Internal Rate of Return over 25 years."
              />
              <MetricRow
                label="NPV (25y)"
                value={formatCurrency(result.npv)}
                hint="Net Present Value."
              />
            </div>

            {/* Right Column: Performance */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Technical Performance</div>
              <MetricRow
                label="Annual Generation"
                value={`${formatNumber(result.annualGeneration)} kWh`}
                hint="Total solar energy produced."
              />
              {config?.numberOfPanels && (
                <MetricRow
                  label="South-Facing Panels"
                  value={formatNumber(config.numberOfPanels)}
                  hint="Number of panels configured."
                />
              )}
              <MetricRow
                label="Exported Energy"
                value={`${formatNumber(result.annualExport)} kWh`}
                hint="Solar energy sent to grid."
              />
              
              {/* Battery Metrics */}
              {config?.batterySizeKwh ? (
                <>
                  <MetricRow
                    label="Battery Capacity"
                    value={`${formatNumber(config.batterySizeKwh)} kWh`}
                    hint="Installed energy storage."
                  />
                  <MetricRow
                    label="Self-Consumption"
                    value={formatPercentFraction(result.annualSelfConsumption / (result.annualGeneration || 1))}
                    hint="Solar energy used on-site (boosted by battery)."
                    valueClassName="text-emerald-600 font-bold"
                  />
                </>
              ) : (
                <MetricRow
                  label="Self-Consumption"
                  value={formatPercentFraction(result.annualSelfConsumption / (result.annualGeneration || 1))}
                  hint="Solar energy used on-site."
                />
              )}

              {/* Spillage Callout */}
              <MetricRow
                label="Export (Spillage) %"
                value={(() => {
                  const spill = result.annualExport / (result.annualGeneration || 1);
                  const isHigh = spill > 0.3;
                  return (
                    <span className={isHigh ? 'text-amber-600 font-bold' : ''}>
                      {formatPercentFraction(spill)}
                      {isHigh && <span className="ml-2 text-xs font-normal text-amber-600">(High)</span>}
                    </span>
                  );
                })()}
                hint="Percentage of generation exported. >30% typically indicates oversizing."
              />
            </div>
          </div>
        </div>

        {/* Monthly payment vs savings (Year 1) */}
        {result.audit?.monthly && result.audit.monthly.length === 12 && (
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Monthly Cashflow (Year 1)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Estimated loan payments vs bill savings for the next calendar year.</p>
              </div>
              <div className="text-xs font-medium text-slate-400">{new Date().getFullYear() + 1}</div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Month</th>
                    <th className="px-6 py-3 text-right">Payment</th>
                    <th className="px-6 py-3 text-right">Savings</th>
                    <th className="px-6 py-3 text-right">Net Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.audit.monthly.map((m) => {
                    const monthName = new Date(2000, m.monthIndex, 1).toLocaleString('en-IE', { month: 'short' });
                    const payment = m.debtPayment ?? 0;
                    const savings = m.savings ?? 0;
                    const net = (m.netOutOfPocket ?? (savings - payment));
                    const isPositive = net >= 0;
                    
                    return (
                      <tr key={m.monthIndex} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-700">{monthName}</td>
                        <td className="px-6 py-3 text-right text-slate-600 tabular-nums">{formatCurrency(payment)}</td>
                        <td className="px-6 py-3 text-right text-slate-600 tabular-nums">{formatCurrency(savings)}</td>
                        <td className={`px-6 py-3 text-right font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatSignedCurrency(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Solar Spillage Sensitivity Analysis */}
        {result.solarSpillageAnalysis && (
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Solar Sizing Sensitivity</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click a row to simulate that system size.
                </p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">PV Size (Annual kWh)</th>
                    <th className="px-6 py-3 text-right">Scale Factor</th>
                    <th className="px-6 py-3 text-right">Exported</th>
                    <th className="px-6 py-3 text-right">Spillage %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.solarSpillageAnalysis.curve.map((p) => {
                    const isCurrent = Math.abs(p.scaleFactor - 1.0) < 0.01;
                    const isHighSpill = p.spillageFraction > 0.3;
                    
                    return (
                      <tr 
                        key={p.scaleFactor} 
                        onClick={() => !isCurrent && onSelectSimulation?.(p.annualGenerationKwh)}
                        className={`transition-colors ${
                          isCurrent 
                            ? 'bg-slate-50/80 font-medium cursor-default' 
                            : 'hover:bg-indigo-50 cursor-pointer group'
                        }`}
                      >
                        <td className="px-6 py-3 tabular-nums text-slate-700 group-hover:text-indigo-700">
                          {formatNumber(p.annualGenerationKwh)}
                          {isCurrent && <span className="ml-2 text-xs font-normal text-tines-purple bg-tines-purple/10 px-2 py-0.5 rounded-full">Current</span>}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-slate-600">{p.scaleFactor.toFixed(2)}×</td>
                        <td className="px-6 py-3 text-right tabular-nums text-slate-600">{formatNumber(p.exportKwh)} kWh</td>
                        <td className={`px-6 py-3 text-right tabular-nums font-medium ${isHighSpill ? 'text-amber-600' : 'text-slate-700'}`}>
                          {formatPercentFraction(p.spillageFraction)}
                          {isHighSpill && <span className="ml-2 text-xs font-normal text-amber-600">⚠️</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div>
            {result.audit ? (
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-tines-purple transition-colors"
                onClick={() => setAuditOpen(true)}
              >
                Open detailed auditor view
              </button>
            ) : (
              <span className="text-xs text-slate-400">Auditor view unavailable (no hourly data)</span>
            )}
          </div>

          <button className="inline-flex items-center gap-2 rounded-lg bg-tines-purple px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download PDF Report
          </button>
        </div>

        {auditOpen && result.audit && <AuditModal audit={result.audit} onClose={() => setAuditOpen(false)} />}
      </div>
    </section>
  );
}
