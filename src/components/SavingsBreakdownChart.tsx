import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { CashFlowRow } from '../utils/exportRateProjection';
import { formatCurrency } from '../utils/format';

interface SavingsBreakdownChartProps {
  cashFlows: CashFlowRow[];
  hasBattery: boolean;
  applyFutureRateChanges: boolean;
}

interface ChartDataPoint {
  year: number;
  solarDirect: number;
  battery: number;
  export: number;
}

interface TooltipEntry {
  dataKey?: string;
  value?: number;
  name?: string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((sum: number, entry: TooltipEntry) => sum + (entry.value ?? 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">Year {label}</p>
      {payload.map((entry: TooltipEntry) => {
        const pct = total > 0 ? ((entry.value ?? 0) / total) * 100 : 0;
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
            <span
              className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-600">{entry.name}:</span>
            <span className="font-medium text-slate-800 ml-auto pl-4">
              {formatCurrency(entry.value ?? 0)}
            </span>
            <span className="text-slate-400">({pct.toFixed(0)}%)</span>
          </div>
        );
      })}
      <div className="border-t border-slate-100 mt-2 pt-2 flex justify-between">
        <span className="text-slate-500">Total</span>
        <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

export function SavingsBreakdownChart({
  cashFlows,
  hasBattery,
  applyFutureRateChanges,
}: SavingsBreakdownChartProps) {
  if (cashFlows[0]?.solarDirectSavings === undefined) {
    return null;
  }

  const data: ChartDataPoint[] = cashFlows.map((cf) => ({
    year: cf.year,
    solarDirect: cf.solarDirectSavings ?? 0,
    battery: cf.batteryDisplacement ?? 0,
    export: cf.exportRevenueSplit ?? 0,
  }));

  const subtitle = applyFutureRateChanges
    ? 'Import +3%/yr · Export declining from 2031 · Solar degradation 0.5%/yr'
    : 'Flat rates · Solar degradation 0.5%/yr';

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">
          Annual Savings Breakdown
        </h3>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }} barCategoryGap="20%">
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(v: number) => `Y${v}`}
              interval={3}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Legend
              iconType="square"
              iconSize={10}
              wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
            />
            <Bar dataKey="solarDirect" name="Solar Direct" stackId="s" fill="#3B82F6" radius={[0, 0, 0, 0]} />
            {hasBattery && (
              <Bar dataKey="battery" name="Battery" stackId="s" fill="#10B981" radius={[0, 0, 0, 0]} />
            )}
            <Bar dataKey="export" name="Export Revenue" stackId="s" fill="#F59E0B" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
