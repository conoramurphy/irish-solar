import type { CalculationResult } from '../types';

export type AuditMonthlyRow = NonNullable<CalculationResult['audit']>['monthly'][number];

export interface AnnualBillSummary {
  /** Baseline (no solar) electricity cost (EUR) */
  baseline: number;
  /** Import charges with solar (EUR), includes standing charges */
  importCost: number;
  /** Export credits / revenue (EUR) */
  exportRevenue: number;
  /** Net electricity cost after solar: importCost − exportRevenue (EUR). Can be negative (credit). */
  netBill: number;
  /** Savings vs baseline: baseline − netBill (EUR) */
  savings: number;

  /** Year 1 only: total debt payments allocated to months (EUR) */
  payment: number;
  /** Year 1 only: netOutOfPocket totals across months (EUR) */
  netOutOfPocket: number;
}

function safeNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calculateAnnualBillSummary(monthly: AuditMonthlyRow[]): AnnualBillSummary {
  const baseline = monthly.reduce((sum, m) => sum + safeNumber(m.baselineCost), 0);
  const importCost = monthly.reduce((sum, m) => sum + safeNumber(m.importCost), 0);
  const exportRevenue = monthly.reduce((sum, m) => sum + safeNumber(m.exportRevenue), 0);
  const netBill = importCost - exportRevenue;
  const savings = baseline - netBill;

  const payment = monthly.reduce((sum, m) => sum + safeNumber(m.debtPayment), 0);
  const netOutOfPocket = monthly.reduce((sum, m) => sum + safeNumber(m.netOutOfPocket), 0);

  return { baseline, importCost, exportRevenue, netBill, savings, payment, netOutOfPocket };
}
