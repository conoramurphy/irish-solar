import { MONTH_LABELS } from '../utils/consumption';

export type CalendarMonthData = {
  monthIndex: number;
  consumptionKwh?: number;
  estimatedBillEur?: number;
  solarGenerationKwh?: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 tabular-nums whitespace-nowrap">{value}</div>
    </div>
  );
}

export function CalendarSidebar({
  months,
  annualTotalBillEur,
  annualTotalConsumptionKwh,
  annualTotalSolarKwh
}: {
  months: CalendarMonthData[];
  annualTotalBillEur?: number;
  annualTotalConsumptionKwh?: number;
  annualTotalSolarKwh?: number;
}) {
  const solarValues = months
    .map((m) => (typeof m.solarGenerationKwh === 'number' && Number.isFinite(m.solarGenerationKwh) ? m.solarGenerationKwh : null))
    .filter((v): v is number => v !== null);

  const solarMin = solarValues.length ? Math.min(...solarValues) : null;
  const solarMax = solarValues.length ? Math.max(...solarValues) : null;

  const seasonalFallbackIntensity = (monthIndex: number) => {
    // Mild seasonal curve: 0 (cold/dark) in Dec/Jan, 1 (warm/bright) around Jun.
    const theta = (2 * Math.PI * (monthIndex - 5)) / 12; // peak around June (index 5)
    return Math.max(0, Math.min(1, (Math.cos(theta) + 1) / 2));
  };

  const solarIntensity = (m: CalendarMonthData) => {
    if (typeof m.solarGenerationKwh === 'number' && Number.isFinite(m.solarGenerationKwh) && solarMin !== null && solarMax !== null) {
      const denom = Math.max(1e-9, solarMax - solarMin);
      return Math.max(0, Math.min(1, (m.solarGenerationKwh - solarMin) / denom));
    }
    return seasonalFallbackIntensity(m.monthIndex);
  };

  const toneForIntensity = (t: number) => {
    // hue: 210 (cool) -> 35 (warm)
    const hue = 210 - t * 175;
    const sat = 70;
    const light = 60;
    return `hsl(${hue} ${sat}% ${light}%)`;
  };

  return (
    <aside className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
      <div>
        <h3 className="text-xl font-serif font-bold text-tines-dark">Annual Calendar</h3>
        <p className="mt-1 text-sm text-slate-500">Month-by-month view (fills in as you complete steps).</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {months.map((m) => {
          const hasConsumption = typeof m.consumptionKwh === 'number' && Number.isFinite(m.consumptionKwh);
          const hasBill = typeof m.estimatedBillEur === 'number' && Number.isFinite(m.estimatedBillEur);
          const hasSolar = typeof m.solarGenerationKwh === 'number' && Number.isFinite(m.solarGenerationKwh);

          const intensity = solarIntensity(m);
          const tone = toneForIntensity(intensity);

          return (
            <div key={m.monthIndex} className="rounded-xl border border-slate-200 bg-white p-4 relative overflow-hidden">
              {/* solar warmth indicator */}
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: tone, opacity: hasSolar ? 0.7 : 0.25 }} />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: tone, opacity: hasSolar ? 0.7 : 0.25 }}
                    title={hasSolar ? 'Solar intensity (relative)' : 'Seasonal intensity (placeholder)'}
                  />
                  <div className="text-sm font-semibold text-slate-800">{MONTH_LABELS[m.monthIndex]}</div>
                </div>
                <div className="text-[11px] text-slate-400">{String(m.monthIndex + 1).padStart(2, '0')}</div>
              </div>

              <div className="mt-3 space-y-2">
                <StatRow label="Use" value={hasConsumption ? `${formatNumber(m.consumptionKwh!)} kWh` : '—'} />
                <StatRow label="Bill" value={hasBill ? formatCurrency(m.estimatedBillEur!) : '—'} />
                <StatRow label="Solar" value={hasSolar ? `${formatNumber(m.solarGenerationKwh!)} kWh` : '—'} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-5 border-t border-slate-100 flex items-end justify-between gap-6">
        <div>
          <div className="text-sm font-semibold text-slate-700">Annual totals</div>
          <div className="mt-1 text-xs text-slate-500">Based on the data you’ve provided so far.</div>
        </div>

        <div className="text-right">
          <div className="text-xl font-bold text-tines-purple tabular-nums">
            {typeof annualTotalBillEur === 'number' ? formatCurrency(annualTotalBillEur) : '—'}
          </div>
          <div className="mt-0.5 text-sm text-slate-500 tabular-nums">
            {typeof annualTotalConsumptionKwh === 'number' ? `${formatNumber(annualTotalConsumptionKwh)} kWh` : '—'}
            {typeof annualTotalSolarKwh === 'number' ? ` · Solar ${formatNumber(annualTotalSolarKwh)} kWh` : ''}
          </div>
        </div>
      </div>
    </aside>
  );
}
