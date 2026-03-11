import type { CalculationResult, Tariff } from '../types';
import { formatCurrency } from '../utils/format';

export interface TariffComparisonRow {
  tariff: Tariff;
  result: CalculationResult;
}

interface TariffComparisonTabProps {
  rows: TariffComparisonRow[];
  activeTariffId?: string;
  marketResult?: CalculationResult | null;
  excludeVat?: boolean;
}

function fmt(n: number) {
  return formatCurrency(n);
}

function fmtPayback(years: number) {
  if (!Number.isFinite(years) || years <= 0) return '—';
  return `${years.toFixed(1)} yrs`;
}

function fmtIrr(irr: number) {
  if (!Number.isFinite(irr)) return '—';
  return `${(irr * 100).toFixed(1)}%`;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 1) return <span className="text-slate-400 text-xs">—</span>;
  const positive = delta > 0;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      {positive ? '+' : '−'}{fmt(Math.abs(delta))}
    </span>
  );
}

export function TariffComparisonTab({ rows, activeTariffId, marketResult, excludeVat }: TariffComparisonTabProps) {
  // Sort rows by annual savings descending
  const sorted = [...rows].sort((a, b) => b.result.annualSavings - a.result.annualSavings);

  const best = sorted[0]?.result.annualSavings ?? 0;

  // Active row savings (for delta vs selected)
  const activeRow = rows.find(r => r.tariff.id === activeTariffId);
  const activeSavings = activeRow?.result.annualSavings ?? best;

  const vatLabel = excludeVat ? ' (Ex. VAT)' : '';

  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-6">
        <h3 className="text-lg font-serif font-semibold text-slate-800 mb-1">Tariff Comparison</h3>
        <p className="text-sm text-slate-500">
          Same solar and battery system modelled against every available business tariff. Ranked by annual savings.
          {excludeVat && <span className="ml-1 font-medium" style={{ color: '#1E8A5E' }}>All figures ex. VAT.</span>}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-700"></span>
          <span className="text-slate-500">Active tariff</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"></span>
          <span className="text-slate-500">Best savings</span>
        </span>
        {marketResult && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-500"></span>
            <span className="text-slate-500">Market rate</span>
          </span>
        )}
        <span className="ml-auto text-slate-400 italic">Delta = vs your active tariff</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-600 w-[260px]">Tariff</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Annual Savings{vatLabel}</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">vs Active</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Payback</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">IRR</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">NPV (25yr)</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Export</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const isActive = row.tariff.id === activeTariffId;
              const isBest = idx === 0;
              const delta = row.result.annualSavings - activeSavings;

              return (
                <tr
                  key={row.tariff.id}
                  className={`border-b border-slate-100 transition-colors ${
                    isActive
                      ? 'bg-emerald-50/60'
                      : isBest && !isActive
                      ? 'bg-amber-50/40'
                      : 'bg-white hover:bg-slate-50/60'
                  }`}
                >
                  {/* Tariff name + badges */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full" style={{ background: '#1E8A5E' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-white inline-block"></span>
                            Active
                          </span>
                        )}
                        {isBest && !isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-full">
                            ★ Best
                          </span>
                        )}
                      </div>
                      <span className={`font-semibold leading-tight ${isActive ? '' : 'text-slate-800'}`} style={isActive ? { color: '#145735' } : {}}>
                        {row.tariff.supplier}
                      </span>
                      <span className={`text-xs leading-tight ${isActive ? '' : 'text-slate-500'}`} style={isActive ? { color: '#1E8A5E' } : {}}>
                        {row.tariff.product}
                        {row.tariff.type === 'time-of-use' && (
                          <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">TOU</span>
                        )}
                      </span>
                    </div>
                  </td>

                  {/* Annual Savings */}
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-bold text-base ${isActive ? '' : isBest ? 'text-emerald-700' : 'text-slate-700'}`} style={isActive ? { color: '#145735' } : {}}>
                      {fmt(row.result.annualSavings)}
                    </span>
                  </td>

                  {/* Delta vs active */}
                  <td className="px-4 py-3.5 text-right">
                    {isActive ? (
                      <span className="text-xs text-slate-400 italic">baseline</span>
                    ) : (
                      <DeltaBadge delta={delta} />
                    )}
                  </td>

                  {/* Payback */}
                  <td className="px-4 py-3.5 text-right text-slate-600 font-medium">
                    {fmtPayback(row.result.simplePayback)}
                  </td>

                  {/* IRR */}
                  <td className="px-4 py-3.5 text-right text-slate-600 font-medium">
                    {fmtIrr(row.result.irr)}
                  </td>

                  {/* NPV */}
                  <td className="px-4 py-3.5 text-right text-slate-600 font-medium">
                    {fmt(row.result.npv)}
                  </td>

                  {/* Export Revenue */}
                  <td className="px-4 py-3.5 text-right text-slate-500 text-xs font-medium">
                    {fmt(row.result.annualExportRevenue)}
                  </td>
                </tr>
              );
            })}

            {/* Market Rate row (if available) */}
            {marketResult && (
              <tr className="border-b border-violet-100 bg-violet-50/40">
                <td className="px-4 py-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-violet-600 text-white px-2 py-0.5 rounded-full w-fit">
                      Market
                    </span>
                    <span className="font-semibold text-violet-800 leading-tight">Day-Ahead Market</span>
                    <span className="text-xs text-violet-600 leading-tight">SEMO hourly prices</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-bold text-base text-violet-700">{fmt(marketResult.annualSavings)}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <DeltaBadge delta={marketResult.annualSavings - activeSavings} />
                </td>
                <td className="px-4 py-3.5 text-right text-violet-700 font-medium">
                  {fmtPayback(marketResult.simplePayback)}
                </td>
                <td className="px-4 py-3.5 text-right text-violet-700 font-medium">
                  {fmtIrr(marketResult.irr)}
                </td>
                <td className="px-4 py-3.5 text-right text-violet-700 font-medium">
                  {fmt(marketResult.npv)}
                </td>
                <td className="px-4 py-3.5 text-right text-violet-500 text-xs font-medium">
                  {fmt(marketResult.annualExportRevenue)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-xs text-slate-400">
        All rows use the same solar generation profile, battery size, and system cost. Only the electricity tariff (import rates, standing charge, export rate) changes per row.
        Grants and financing are held constant.
      </p>
    </div>
  );
}
