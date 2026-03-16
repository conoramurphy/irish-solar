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

  describe('safeNumber coercion (non-number branch)', () => {
    it('treats undefined fields as 0', () => {
      const row = makeMonth({ monthIndex: 0, baselineCost: 100, importCost: 50, exportRevenue: 10 });
      // Force fields to undefined to exercise the non-number branch
      (row as Record<string, unknown>).debtPayment = undefined;
      (row as Record<string, unknown>).netOutOfPocket = undefined;

      const out = calculateAnnualBillSummary([row]);

      expect(out.payment).toBe(0);
      expect(out.netOutOfPocket).toBe(0);
      expect(out.baseline).toBe(100);
    });

    it('coerces numeric string fields to numbers', () => {
      const row = makeMonth({ monthIndex: 0 });
      (row as Record<string, unknown>).baselineCost = '200';
      (row as Record<string, unknown>).importCost = '80';
      (row as Record<string, unknown>).exportRevenue = '15';

      const out = calculateAnnualBillSummary([row]);

      expect(out.baseline).toBe(200);
      expect(out.importCost).toBe(80);
      expect(out.exportRevenue).toBe(15);
      expect(out.netBill).toBe(65);
      expect(out.savings).toBe(135);
    });

    it('treats NaN fields as 0', () => {
      const row = makeMonth({ monthIndex: 0, baselineCost: 100 });
      (row as Record<string, unknown>).importCost = NaN;
      (row as Record<string, unknown>).exportRevenue = NaN;
      (row as Record<string, unknown>).debtPayment = NaN;
      (row as Record<string, unknown>).netOutOfPocket = NaN;

      const out = calculateAnnualBillSummary([row]);

      expect(out.importCost).toBe(0);
      expect(out.exportRevenue).toBe(0);
      expect(out.netBill).toBe(0);
      expect(out.payment).toBe(0);
      expect(out.netOutOfPocket).toBe(0);
    });

    it('treats non-numeric strings as 0', () => {
      const row = makeMonth({ monthIndex: 0 });
      (row as Record<string, unknown>).baselineCost = 'abc';
      (row as Record<string, unknown>).importCost = 'hello';

      const out = calculateAnnualBillSummary([row]);

      expect(out.baseline).toBe(0);
      expect(out.importCost).toBe(0);
    });
  });
});
