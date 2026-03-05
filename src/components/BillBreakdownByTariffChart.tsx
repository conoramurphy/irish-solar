import { useMemo, useState } from 'react';
import type { HourlyEnergyFlow, Tariff } from '../types';
import {
  calculateMonthlyBillBreakdown,
  sumAnnualByBucket,
  sumAnnualKwhByBucket,
  type BillBreakdownMode
} from '../utils/billBreakdown';
import { formatCurrency, formatNumber as formatKwh } from '../utils/format';

interface BillBreakdownByTariffChartProps {
  hourlyData: HourlyEnergyFlow[];
  tariff: Tariff;
}

const DEFAULT_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#ef4444', // red
  '#14b8a6', // teal
  '#84cc16'  // lime
];

function colorForBucket(bucket: string, idx: number): string {
  const fixed: Record<string, string> = {
    standing: '#94a3b8',
    free: '#a7f3d0',
    ev: '#0ea5e9',
    night: '#6366f1',
    day: '#10b981',
    peak: '#f59e0b',
    'all-day': '#8b5cf6'
  };
  if (fixed[bucket]) return fixed[bucket];
  return DEFAULT_COLORS[idx % DEFAULT_COLORS.length]!;
}

function labelForBucket(bucket: string): string {
  const fixed: Record<string, string> = {
    standing: 'Standing charge',
    free: 'Free window',
    ev: 'EV / Boost',
    night: 'Night',
    day: 'Day',
    peak: 'Peak',
    'all-day': 'All day'
  };
  if (fixed[bucket]) return fixed[bucket];

  // Title-case fallback
  return bucket
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function sum(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function sortBucketsForDisplay(keys: string[]): string[] {
  const preferred = ['standing', 'free', 'ev', 'night', 'day', 'peak', 'all-day'];
  const rank = new Map(preferred.map((k, i) => [k, i] as const));

  return [...keys].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : 999;
    const rb = rank.has(b) ? rank.get(b)! : 999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export function BillBreakdownByTariffChart({ hourlyData, tariff }: BillBreakdownByTariffChartProps) {
  const [mode, setMode] = useState<BillBreakdownMode>('after');

  const monthly = useMemo(() => calculateMonthlyBillBreakdown(hourlyData, tariff), [hourlyData, tariff]);

  const annualEurByBucket = useMemo(() => sumAnnualByBucket(monthly, mode), [monthly, mode]);
  const annualKwhByBucket = useMemo(() => sumAnnualKwhByBucket(monthly, mode), [monthly, mode]);

  const bucketKeys = useMemo(() => {
    const set = new Set<string>();
    for (const m of monthly) {
      const eurMap = mode === 'baseline' ? m.eurByBucketBaseline : m.eurByBucketAfter;
      for (const k of Object.keys(eurMap)) set.add(k);
    }

    // Always include standing for visual consistency.
    set.add('standing');

    return sortBucketsForDisplay(Array.from(set));
  }, [monthly, mode]);

  const series = useMemo(() => {
    return monthly.map((m) => {
      const eurByBucket = mode === 'baseline' ? m.eurByBucketBaseline : m.eurByBucketAfter;
      const total = sum(eurByBucket);
      return { monthIndex: m.monthIndex, eurByBucket, total };
    });
  }, [monthly, mode]);

  // Stable across both modes so the Y-axis doesn't rescale on toggle
  const stableMax = useMemo(() => {
    const allTotals = monthly.map((m) =>
      Math.max(sum(m.eurByBucketBaseline), sum(m.eurByBucketAfter))
    );
    return Math.max(1, ...allTotals);
  }, [monthly]);

  const chartHeightPx = 220;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-serif font-bold text-slate-800">Bill Breakdown by Tariff Rate</h3>
          <p className="text-sm text-slate-500 mt-1">
            Monthly import bill split by rate periods (standing charge included; export credits excluded).
          </p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-lg shrink-0 self-start md:self-auto">
          <button
            onClick={() => setMode('baseline')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === 'baseline'
                ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            Before Solar
          </button>
          <button
            onClick={() => setMode('after')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === 'after'
                ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            After Solar
          </button>
        </div>
      </div>

      <div className="p-8">
        <div className="flex items-end justify-between gap-2" style={{ height: `${chartHeightPx + 24}px` }}>
          {series.map((m) => {
            const monthLabel = new Date(2000, m.monthIndex, 1).toLocaleString('en-IE', { month: 'short' });
            return (
              <div key={m.monthIndex} className="flex-1 flex flex-col items-center min-w-0">
                <div
                  className="w-full rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex flex-col justify-end"
                  style={{ height: `${chartHeightPx}px` }}
                  title={`${monthLabel}: ${formatCurrency(m.total)}`}
                >
                  {bucketKeys
                    .filter((k) => (m.eurByBucket[k] ?? 0) > 0)
                    // Render from bottom up: put standing at the bottom, then everything else.
                    .sort((a, b) => (a === 'standing' ? -1 : b === 'standing' ? 1 : 0))
                    .map((bucket, idx) => {
                      const val = m.eurByBucket[bucket] ?? 0;
                      const h = (val / stableMax) * chartHeightPx;
                      if (h <= 0.5) return null;
                      return (
                        <div
                          key={bucket}
                          style={{ height: `${h}px`, backgroundColor: colorForBucket(bucket, idx) }}
                          className="w-full"
                          title={`${monthLabel} · ${labelForBucket(bucket)}: ${formatCurrency(val)}`}
                        />
                      );
                    })}
                </div>

                <div className="mt-2 text-[10px] font-medium text-slate-500 text-center truncate w-full">
                  {monthLabel}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Annual totals</div>
            </div>
            <div className="divide-y divide-slate-100">
              {bucketKeys
                .filter((k) => (annualEurByBucket[k] ?? 0) > 0.01)
                .map((bucket, idx) => (
                  <div key={bucket} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: colorForBucket(bucket, idx) }}
                      />
                      <div className="text-sm font-medium text-slate-700 truncate">{labelForBucket(bucket)}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(annualEurByBucket[bucket] ?? 0)}</div>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Annual kWh (imports)</div>
            </div>
            <div className="divide-y divide-slate-100">
              {bucketKeys
                .filter((k) => k !== 'standing')
                .filter((k) => (annualKwhByBucket[k] ?? 0) > 0.01)
                .map((bucket, idx) => (
                  <div key={bucket} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: colorForBucket(bucket, idx) }}
                      />
                      <div className="text-sm font-medium text-slate-700 truncate">{labelForBucket(bucket)}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums">{formatKwh(annualKwhByBucket[bucket] ?? 0)} kWh</div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Tariff: <span className="font-medium text-slate-500">{tariff.supplier} — {tariff.product}</span>
        </p>
      </div>
    </div>
  );
}
