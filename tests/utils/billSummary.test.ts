import { describe, it, expect } from 'vitest';
import { calculateAnnualBillSummary, type AuditMonthlyRow } from '../../src/utils/billSummary';

function makeMonth(partial: Partial<AuditMonthlyRow>): AuditMonthlyRow {
  return {
    monthIndex: 0,
    generation: 0,
    consumption: 0,
    gridImport: 0,
    gridExport: 0,
    selfConsumption: 0,
    baselineCost: 0,
    importCost: 0,
    exportRevenue: 0,
    savings: 0,
    debtPayment: 0,
    netOutOfPocket: 0,
    ...partial
  };
}

describe('billSummary', () => {
  it('calculates net bill as import minus export, and savings vs baseline', () => {
    const monthly: AuditMonthlyRow[] = [
      makeMonth({ monthIndex: 0, baselineCost: 100, importCost: 70, exportRevenue: 10 }),
      makeMonth({ monthIndex: 1, baselineCost: 100, importCost: 50, exportRevenue: 10 })
    ];

    const out = calculateAnnualBillSummary(monthly);

    expect(out.baseline).toBe(200);
    expect(out.importCost).toBe(120);
    expect(out.exportRevenue).toBe(20);
    expect(out.netBill).toBe(100);
    expect(out.savings).toBe(100);
  });

  it('allows net bill to go negative (credit) when export exceeds import', () => {
    const monthly: AuditMonthlyRow[] = [
      makeMonth({ monthIndex: 0, baselineCost: 50, importCost: 10, exportRevenue: 30 })
    ];

    const out = calculateAnnualBillSummary(monthly);

    expect(out.netBill).toBe(-20);
    expect(out.savings).toBe(70);
  });

  it('sums debt payments and net out-of-pocket from audit rows', () => {
    const monthly: AuditMonthlyRow[] = [
      makeMonth({ monthIndex: 0, debtPayment: 25, netOutOfPocket: 10 }),
      makeMonth({ monthIndex: 1, debtPayment: 25, netOutOfPocket: -5 })
    ];

    const out = calculateAnnualBillSummary(monthly);

    expect(out.payment).toBe(50);
    expect(out.netOutOfPocket).toBe(5);
  });
});
