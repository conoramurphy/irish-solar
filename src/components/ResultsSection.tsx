import { useState } from 'react';
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

export function ResultsSection({ result }: ResultsSectionProps) {
  const [auditOpen, setAuditOpen] = useState(false);

  if (!result) {
    return (
      <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-12 text-center h-full flex flex-col items-center justify-center text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-4 opacity-50">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p>Run a calculation to generate the ROI report.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden relative">
        <div className="h-2 bg-gradient-to-r from-tines-purple via-indigo-500 to-blue-500"></div>
        <div className="p-8 md:p-10">
            <div className="flex items-baseline justify-between mb-8 border-b border-slate-100 pb-6">
                <h2 className="text-3xl font-serif font-bold text-tines-dark">
                    Projected Impact Report
                </h2>
                <span className="text-sm font-medium text-slate-400">
                    {new Date().toLocaleDateString()}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                     <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Financial Overview</h3>
                     
                     <div className="flex justify-between items-baseline">
                        <span className="text-slate-600">System Cost</span>
                        <span className="text-lg font-medium text-slate-900">{formatCurrency(result.systemCost)}</span>
                     </div>
                     <div className="flex justify-between items-baseline">
                        <span className="text-slate-600">Net Cost <span className="text-xs text-slate-400">(after grants)</span></span>
                        <span className="text-lg font-medium text-slate-900">{formatCurrency(result.netCost)}</span>
                     </div>
                     <div className="flex justify-between items-baseline pt-4 border-t border-slate-50">
                        <span className="text-slate-600">Annual Savings</span>
                        <span className="text-2xl font-bold text-emerald-600">{formatCurrency(result.annualSavings)}</span>
                     </div>
                </div>

                <div className="space-y-6">
                    <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Performance Metrics</h3>

                    <div className="flex justify-between items-baseline">
                        <span className="text-slate-600">Annual Generation</span>
                        <span className="text-lg font-medium text-slate-900">{formatNumber(result.annualGeneration)} <span className="text-sm text-slate-400">kWh</span></span>
                    </div>

                    <div className="bg-pastel-green/30 rounded-lg p-4 flex justify-between items-center">
                         <span className="text-slate-700 font-medium">Simple Payback</span>
                         <span className="text-xl font-bold text-tines-dark">
                            {Number.isFinite(result.simplePayback) ? `${result.simplePayback.toFixed(1)} years` : '∞'}
                         </span>
                    </div>

                     <div className="flex justify-between items-baseline">
                        <span className="text-slate-600">IRR</span>
                        <span className="text-lg font-medium text-slate-900">
                             {Number.isFinite(result.irr) ? `${(result.irr * 100).toFixed(2)}%` : '—'}
                        </span>
                     </div>
                     
                     <div className="flex justify-between items-baseline">
                        <span className="text-slate-600">NPV <span className="text-xs text-slate-400">(25y)</span></span>
                        <span className="text-lg font-medium text-slate-900">{formatCurrency(result.npv)}</span>
                     </div>
                </div>
            </div>

            <div className="mt-10 pt-8 border-t border-slate-100">
                 <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-4">First Year Cashflow</h3>
                 <div className="flex items-center gap-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span>Net cashflow projected: <strong>{formatCurrency(result.cashFlows[0]?.netCashFlow ?? 0)}</strong></span>
                 </div>
            </div>
            
             <div className="mt-10 flex items-center justify-between gap-4">
                <div>
                  {result.audit && (
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => setAuditOpen(true)}
                    >
                      Auditor Mode
                    </button>
                  )}
                  {!result.audit && (
                    <p className="text-xs text-slate-400">
                      Auditor Mode becomes available when an 8,760-hour solar timeseries is provided.
                    </p>
                  )}
                </div>

                <button className="text-sm text-tines-purple font-medium hover:text-indigo-700 flex items-center gap-1 transition-colors">
                    Download Full PDF Report
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                </button>
             </div>

             {auditOpen && result.audit && (
               <AuditModal audit={result.audit} onClose={() => setAuditOpen(false)} />
             )}
        </div>
    </div>
  );
}
