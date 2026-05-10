import { formatCurrency } from '../../utils/format';
import type { PathRecommendation } from '../../utils/pickPathsFromSensitivity';

interface PathCardProps {
  path: PathRecommendation;
}

interface CardSkin {
  icon: string;
  kicker: string;
  taglinePrefix: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}

const SKIN_BY_TARGET: Record<33 | 50 | 100, CardSkin> = {
  33: {
    icon: '⚡',
    kicker: '33% Target',
    taglinePrefix: 'Cut your bill by a third',
    accent: 'text-amber-700',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
  },
  50: {
    icon: '📈',
    kicker: '50% Target',
    taglinePrefix: 'Halve your bill',
    accent: 'text-emerald-700',
    accentBg: 'bg-emerald-50',
    accentBorder: 'border-emerald-200',
  },
  100: {
    icon: '🏠',
    kicker: 'Net Zero Target',
    taglinePrefix: 'Eliminate your bill',
    accent: 'text-blue-700',
    accentBg: 'bg-blue-50',
    accentBorder: 'border-blue-200',
  },
};

function formatPaybackYears(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 25) return '25+ years';
  return `${value.toFixed(1)} years`;
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
  const skin = SKIN_BY_TARGET[path.targetReductionPct];
  const showBattery = path.batterySizeKwh > 0;
  const paybackText = formatPaybackYears(path.simplePaybackYears);
  const tagline =
    paybackText === '—'
      ? `${skin.taglinePrefix}.`
      : `${skin.taglinePrefix} — paid back in ${paybackText}.`;

  const footer = `${formatKwp(path.systemSizeKwp)}${
    showBattery ? ` · ${formatBatteryKwh(path.batterySizeKwh)} battery` : ' · No battery'
  } — Est. ${formatCurrency(path.capexNet)} after grants`;

  return (
    <div
      className={`relative rounded-2xl border ${skin.accentBorder} ${skin.accentBg} p-6 text-left`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl" aria-hidden="true">
          {skin.icon}
        </span>
        <span
          className={`text-xs font-bold uppercase tracking-wider ${skin.accent}`}
        >
          {skin.kicker}
        </span>
      </div>

      <div className={`text-3xl font-bold ${skin.accent} tabular-nums`}>
        {formatCurrency(path.annualSavings)}
        <span className="text-base font-medium opacity-70">/yr</span>
      </div>

      {!path.targetMet && (
        <p className="text-xs text-amber-800 mt-2">
          As close as the rough model gets — the call will model larger systems.
        </p>
      )}

      <p className="text-sm text-slate-600 mt-2 leading-relaxed">{tagline}</p>

      <div className="mt-4 pt-3 border-t border-slate-200/60 text-xs text-slate-500">
        {footer}
      </div>
    </div>
  );
}
