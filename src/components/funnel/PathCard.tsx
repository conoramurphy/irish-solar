import { formatCurrency } from '../../utils/format';
import type { PathRecommendation } from '../../utils/pickPathsFromSensitivity';

interface PathCardProps {
  path: PathRecommendation;
}

const TARGET_LABELS: Record<33 | 50 | 100, string> = {
  33: 'Cut bills by a third',
  50: 'Halve your bill',
  100: 'Eliminate your bill',
};

function formatPaybackYears(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 25) return '25+ yrs';
  return `${value.toFixed(1)} yrs`;
}

function formatKwp(value: number): string {
  if (value >= 100) return `${Math.round(value)} kWp`;
  return `${value.toFixed(1)} kWp`;
}

function formatBatteryKwh(value: number): string {
  if (value >= 100) return `${Math.round(value)} kWh`;
  return `${value.toFixed(1)} kWh`;
}

export function PathCard({ path }: PathCardProps) {
  const showBattery = path.batterySizeKwh > 0;

  return (
    <article className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col">
      <p className="text-xs font-semibold tracking-widest uppercase text-amber-600 mb-2">
        {path.targetReductionPct === 100 ? 'Net zero target' : `${path.targetReductionPct}% target`}
      </p>
      <h3 className="text-xl md:text-2xl font-serif font-bold text-slate-900 leading-snug mb-4">
        {TARGET_LABELS[path.targetReductionPct]}
      </h3>

      {!path.targetMet && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 p-2.5 mb-4">
          This is as close as the rough model gets. The call will model larger systems.
        </p>
      )}

      <dl className="space-y-3 mb-6 flex-1">
        <div className="flex justify-between items-baseline">
          <dt className="text-xs font-medium tracking-widest uppercase text-slate-400">Solar</dt>
          <dd className="text-sm font-semibold text-slate-800">{formatKwp(path.systemSizeKwp)}</dd>
        </div>
        {showBattery && (
          <div className="flex justify-between items-baseline">
            <dt className="text-xs font-medium tracking-widest uppercase text-slate-400">Battery</dt>
            <dd className="text-sm font-semibold text-slate-800">{formatBatteryKwh(path.batterySizeKwh)}</dd>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <dt className="text-xs font-medium tracking-widest uppercase text-slate-400">Net cost (after grant)</dt>
          <dd className="text-sm font-semibold text-slate-800">{formatCurrency(path.capexNet)}</dd>
        </div>
        <div className="flex justify-between items-baseline">
          <dt className="text-xs font-medium tracking-widest uppercase text-slate-400">Annual savings</dt>
          <dd className="text-sm font-semibold text-green-800">{formatCurrency(path.annualSavings)}</dd>
        </div>
        <div className="flex justify-between items-baseline">
          <dt className="text-xs font-medium tracking-widest uppercase text-slate-400">Payback</dt>
          <dd className="text-sm font-semibold text-slate-800">{formatPaybackYears(path.simplePaybackYears)}</dd>
        </div>
      </dl>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-[11px] tracking-widest uppercase font-medium text-slate-400 mb-1">
          Estimated reduction
        </p>
        <p className="text-2xl font-serif font-bold text-green-800">
          {Math.min(100, Math.round(path.actualReductionPct))}%
        </p>
      </div>
    </article>
  );
}
