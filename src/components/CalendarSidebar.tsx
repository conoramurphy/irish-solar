import { MONTH_LABELS } from '../utils/consumption';
import { formatCurrency, formatNumber } from '../utils/format';

export type CalendarMonthData = {
  monthIndex: number;
  consumptionKwh?: number;
  estimatedBillEur?: number;
  solarGenerationKwh?: number;
};

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
  // --- Solar warmth colour logic (unchanged) ---
  const solarValues = months
    .map((m) => (typeof m.solarGenerationKwh === 'number' && Number.isFinite(m.solarGenerationKwh) ? m.solarGenerationKwh : null))
    .filter((v): v is number => v !== null);
  const solarMin = solarValues.length ? Math.min(...solarValues) : null;
  const solarMax = solarValues.length ? Math.max(...solarValues) : null;

  const seasonalFallback = (monthIndex: number) => {
    const theta = (2 * Math.PI * (monthIndex - 5)) / 12;
    return Math.max(0, Math.min(1, (Math.cos(theta) + 1) / 2));
  };

  const solarIntensity = (m: CalendarMonthData) => {
    if (typeof m.solarGenerationKwh === 'number' && Number.isFinite(m.solarGenerationKwh) && solarMin !== null && solarMax !== null) {
      const denom = Math.max(1e-9, solarMax - solarMin);
      return Math.max(0, Math.min(1, (m.solarGenerationKwh - solarMin) / denom));
    }
    return seasonalFallback(m.monthIndex);
  };

  const warmthColor = (t: number) => {
    const hue = 210 - t * 175; // cool blue → warm amber
    return `hsl(${hue} 70% 60%)`;
  };

  const hasAnyData =
    months.some((m) => m.consumptionKwh !== undefined) ||
    months.some((m) => m.estimatedBillEur !== undefined) ||
    months.some((m) => m.solarGenerationKwh !== undefined);

  const rows: Array<{
    label: string;
    key: 'consumptionKwh' | 'estimatedBillEur' | 'solarGenerationKwh';
    format: (v: number) => string;
    annual?: number;
    annualLabel?: string;
  }> = [
    {
      label: 'Usage',
      key: 'consumptionKwh',
      format: (v) => `${formatNumber(v)} kWh`,
      annual: annualTotalConsumptionKwh,
      annualLabel: annualTotalConsumptionKwh !== undefined ? `${formatNumber(annualTotalConsumptionKwh)} kWh` : undefined,
    },
    {
      label: 'Bill',
      key: 'estimatedBillEur',
      format: (v) => formatCurrency(v),
      annual: annualTotalBillEur,
      annualLabel: annualTotalBillEur !== undefined ? formatCurrency(annualTotalBillEur) : undefined,
    },
    {
      label: 'Solar',
      key: 'solarGenerationKwh',
      format: (v) => `${formatNumber(v)} kWh`,
      annual: annualTotalSolarKwh,
      annualLabel: annualTotalSolarKwh !== undefined ? `${formatNumber(annualTotalSolarKwh)} kWh` : undefined,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_6px_rgb(0,0,0,0.03)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              {/* Row-label header cell */}
              <th className="text-left py-2.5 pl-4 pr-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 bg-slate-50 border-b border-slate-100 whitespace-nowrap w-14">
                {hasAnyData ? 'Monthly' : ''}
              </th>

              {/* Month columns */}
              {months.map((m) => {
                const intensity = solarIntensity(m);
                const color = warmthColor(intensity);
                const hasSolar = typeof m.solarGenerationKwh === 'number' && Number.isFinite(m.solarGenerationKwh);
                return (
                  <th
                    key={m.monthIndex}
                    className="py-0 px-1 text-center bg-slate-50 border-b border-slate-100 font-medium text-slate-600"
                    style={{ minWidth: 52 }}
                  >
                    <div className="h-0.5 w-full mb-0" style={{ background: color, opacity: hasSolar ? 0.8 : 0.3 }} />
                    <div className="py-2">{MONTH_LABELS[m.monthIndex]}</div>
                  </th>
                );
              })}

              {/* Annual total column */}
              <th className="py-2.5 px-3 text-center bg-slate-50 border-b border-slate-100 border-l border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                Annual
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={row.label} className={rowIdx < rows.length - 1 ? 'border-b border-slate-100' : ''}>
                {/* Row label */}
                <td className="pl-4 pr-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap bg-slate-50/50">
                  {row.label}
                </td>

                {/* Month cells */}
                {months.map((m) => {
                  const raw = m[row.key];
                  const hasValue = typeof raw === 'number' && Number.isFinite(raw);
                  return (
                    <td
                      key={m.monthIndex}
                      className="px-1 py-2 text-center tabular-nums whitespace-nowrap text-slate-700 font-medium"
                    >
                      {hasValue ? row.format(raw as number) : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}

                {/* Annual total cell */}
                <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap border-l border-slate-100 font-semibold text-slate-800">
                  {row.annualLabel ?? <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
