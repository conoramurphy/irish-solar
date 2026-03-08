import { describe, it, expect } from 'vitest';
import {
  getExportRateMultiplier,
  projectCashFlows,
  type ProjectionInputs,
} from '../../src/utils/exportRateProjection';

describe('getExportRateMultiplier', () => {
  it('returns 1.0 for years up to and including 2030', () => {
    expect(getExportRateMultiplier(2024)).toBe(1.0);
    expect(getExportRateMultiplier(2025)).toBe(1.0);
    expect(getExportRateMultiplier(2029)).toBe(1.0);
    expect(getExportRateMultiplier(2030)).toBe(1.0);
  });

  it('returns 11/14 for 2031', () => {
    expect(getExportRateMultiplier(2031)).toBeCloseTo(11 / 14, 10);
  });

  it('returns 8/14 for 2032', () => {
    expect(getExportRateMultiplier(2032)).toBeCloseTo(8 / 14, 10);
  });

  it('returns 6/14 for 2033 and beyond', () => {
    expect(getExportRateMultiplier(2033)).toBeCloseTo(6 / 14, 10);
    expect(getExportRateMultiplier(2040)).toBeCloseTo(6 / 14, 10);
    expect(getExportRateMultiplier(2050)).toBeCloseTo(6 / 14, 10);
  });
});

describe('projectCashFlows', () => {
  const baseInputs: ProjectionInputs = {
    year1OperationalSavings: 2000,
    year1ExportRevenue: 500,
    year1TaxSavings: 0,
    baseGeneration: 5000,
    annualLoanPayment: 0,
    loanTermYears: 0,
    equityAmount: 10000,
    effectiveNetCost: 10000,
    analysisYears: 25,
    applyFutureRateChanges: false,
    baseCalendarYear: 2025,
  };

  it('produces 25 cash flow rows by default', () => {
    const result = projectCashFlows(baseInputs);
    expect(result.cashFlows).toHaveLength(25);
    expect(result.cashFlows[0].year).toBe(1);
    expect(result.cashFlows[24].year).toBe(25);
  });

  it('Year 1 savings match input when decline is off', () => {
    const result = projectCashFlows(baseInputs);
    expect(result.cashFlows[0].savings).toBeCloseTo(2000, 2);
    expect(result.annualSavings).toBeCloseTo(2000, 2);
  });

  it('Year 1 savings match input when decline is on (base year 2025 is before 2031)', () => {
    const result = projectCashFlows({ ...baseInputs, applyFutureRateChanges: true });
    expect(result.cashFlows[0].savings).toBeCloseTo(2000, 2);
  });

  it('future-changes projection has higher 25-year total than flat (import escalation outweighs export decline)', () => {
    // Import +3%/year compounds more than export decline subtracts for a typical split
    const flat = projectCashFlows({ ...baseInputs, applyFutureRateChanges: false });
    const future = projectCashFlows({ ...baseInputs, applyFutureRateChanges: true });

    const flatTotal = flat.cashFlows.reduce((s, cf) => s + cf.savings, 0);
    const futureTotal = future.cashFlows.reduce((s, cf) => s + cf.savings, 0);

    expect(futureTotal).toBeGreaterThan(flatTotal);
  });

  it('import escalation applies from year 1, export decline from 2031', () => {
    const inputs: ProjectionInputs = {
      ...baseInputs,
      applyFutureRateChanges: true,
      baseCalendarYear: 2025,
    };
    const result = projectCashFlows(inputs);
    const flat = projectCashFlows({ ...inputs, applyFutureRateChanges: false });

    // Year 1 savings match because escalation factor is (1+0.03)^0 = 1 and no export decline yet
    expect(result.cashFlows[0].savings).toBeCloseTo(flat.cashFlows[0].savings, 2);

    // Year 2 (index 1): import escalation of (1.03)^1 should make future savings higher
    // than flat for years where export decline hasn't wiped out the gain
    expect(result.cashFlows[1].savings).toBeGreaterThan(flat.cashFlows[1].savings);

    // Year 7 (index 6) = calendar 2031: export decline kicks in.
    // Whether future > or < flat depends on the balance, but both components apply.
    // Verify future savings differ from flat
    expect(result.cashFlows[6].savings).not.toBeCloseTo(flat.cashFlows[6].savings, 0);
  });

  it('export-only scenario sees the full export decline (no import escalation benefit)', () => {
    const inputs: ProjectionInputs = {
      ...baseInputs,
      year1OperationalSavings: 1000,
      year1ExportRevenue: 1000, // 100% export — no self-consumption savings to escalate
      applyFutureRateChanges: true,
      baseCalendarYear: 2025,
    };
    const result = projectCashFlows(inputs);

    // Year 9 (index 8) = calendar 2033: export multiplier = 6/14 ≈ 0.4286
    // Non-export savings = 0 so import escalation has nothing to compound
    const year9 = result.cashFlows[8];
    const expectedMultiplier = 6 / 14;
    const degradation = Math.pow(1 - 0.005, 8);
    const expectedSavings = 1000 * degradation * expectedMultiplier;

    expect(year9.savings).toBeCloseTo(expectedSavings, 1);
  });

  it('includes tax savings in Year 1 net cash flow only', () => {
    const inputs: ProjectionInputs = {
      ...baseInputs,
      year1TaxSavings: 500,
    };
    const result = projectCashFlows(inputs);

    // Year 1 net cash flow includes tax savings
    expect(result.cashFlows[0].netCashFlow).toBeCloseTo(2000 + 500, 2);
    // Year 2 does not
    const year2Savings = result.cashFlows[1].savings;
    expect(result.cashFlows[1].netCashFlow).toBeCloseTo(year2Savings, 2);
  });

  it('loan payments are subtracted for the loan term only', () => {
    const inputs: ProjectionInputs = {
      ...baseInputs,
      annualLoanPayment: 1000,
      loanTermYears: 5,
    };
    const result = projectCashFlows(inputs);

    // Years 1-5 should have loan payments
    for (let i = 0; i < 5; i++) {
      expect(result.cashFlows[i].loanPayment).toBe(1000);
    }
    // Year 6+ should not
    expect(result.cashFlows[5].loanPayment).toBe(0);
  });

  it('cumulative cash flow is correct', () => {
    const result = projectCashFlows(baseInputs);
    let cumulative = -baseInputs.equityAmount;
    for (const cf of result.cashFlows) {
      cumulative += cf.netCashFlow;
      expect(cf.cumulativeCashFlow).toBeCloseTo(cumulative, 2);
    }
  });

  it('computes reasonable NPV and IRR', () => {
    const result = projectCashFlows(baseInputs);

    expect(result.npv).toBeGreaterThan(0);
    expect(Number.isFinite(result.irr)).toBe(true);
    expect(result.irr).toBeGreaterThan(0);
  });

  it('flat and declining projections have the same payback when decline is after payback', () => {
    const quickPayback: ProjectionInputs = {
      ...baseInputs,
      year1OperationalSavings: 5000,
      year1ExportRevenue: 500,
      effectiveNetCost: 5000,
      equityAmount: 5000,
      baseCalendarYear: 2025,
    };
    const flat = projectCashFlows({ ...quickPayback, applyFutureRateChanges: false });
    const declining = projectCashFlows({ ...quickPayback, applyFutureRateChanges: true });

    // Payback ~1 year, well before 2031. Both should be the same.
    expect(flat.simplePayback).toBeCloseTo(declining.simplePayback, 2);
  });
});

describe('reprojectVariant math (via projectCashFlows)', () => {
  // reprojectVariant in ResultsSection uses the same arithmetic as projectCashFlows.
  // Tests here verify the shared logic handles loans and equity correctly.

  it('loan payments reduce year10 cumulative but not IRR gross flows', () => {
    const withLoan = projectCashFlows({
      ...{
        year1OperationalSavings: 2000,
        year1ExportRevenue: 400,
        year1TaxSavings: 0,
        baseGeneration: 5000,
        equityAmount: 3000,
        effectiveNetCost: 8000,
        analysisYears: 25,
        applyFutureRateChanges: false,
        baseCalendarYear: 2025,
      },
      annualLoanPayment: 600,
      loanTermYears: 7,
    });

    const noLoan = projectCashFlows({
      year1OperationalSavings: 2000,
      year1ExportRevenue: 400,
      year1TaxSavings: 0,
      baseGeneration: 5000,
      annualLoanPayment: 0,
      loanTermYears: 0,
      equityAmount: 8000,
      effectiveNetCost: 8000,
      analysisYears: 25,
      applyFutureRateChanges: false,
      baseCalendarYear: 2025,
    });

    // Year 1 net cash flow must differ by the loan payment
    expect(withLoan.cashFlows[0].netCashFlow).toBeCloseTo(
      noLoan.cashFlows[0].netCashFlow - 600, 2
    );

    // After loan is paid off, year 8+ net cash flows must match (same savings, no loan)
    expect(withLoan.cashFlows[7].netCashFlow).toBeCloseTo(
      noLoan.cashFlows[7].netCashFlow, 2
    );
  });

  it('toggle does not change Year 1 savings (escalation factor = 1 in year 1)', () => {
    const flat = projectCashFlows({
      year1OperationalSavings: 2000,
      year1ExportRevenue: 500,
      year1TaxSavings: 0,
      baseGeneration: 5000,
      annualLoanPayment: 0,
      loanTermYears: 0,
      equityAmount: 10000,
      effectiveNetCost: 10000,
      analysisYears: 25,
      applyFutureRateChanges: false,
      baseCalendarYear: 2025,
    });
    const future = projectCashFlows({
      year1OperationalSavings: 2000,
      year1ExportRevenue: 500,
      year1TaxSavings: 0,
      baseGeneration: 5000,
      annualLoanPayment: 0,
      loanTermYears: 0,
      equityAmount: 10000,
      effectiveNetCost: 10000,
      analysisYears: 25,
      applyFutureRateChanges: true,
      baseCalendarYear: 2025,
    });

    // Year 1 savings identical — escalation exponent is 0, export multiplier = 1
    expect(future.cashFlows[0].savings).toBeCloseTo(flat.cashFlows[0].savings, 2);

    // Year 2+ must differ — import has escalated, export may have changed
    expect(future.cashFlows[1].savings).not.toBeCloseTo(flat.cashFlows[1].savings, 0);
  });

  it('reprojectVariant with equity < netCost produces correct year10 starting basis', () => {
    // Simulates what reprojectVariant does: equity=3000, netCost=8000
    // Year10 cumulative should start from -3000 (equity), not -8000 (netCost)
    const result = projectCashFlows({
      year1OperationalSavings: 2000,
      year1ExportRevenue: 0,
      year1TaxSavings: 0,
      baseGeneration: 5000,
      annualLoanPayment: 0,
      loanTermYears: 0,
      equityAmount: 3000,
      effectiveNetCost: 8000,
      analysisYears: 10,
      applyFutureRateChanges: false,
      baseCalendarYear: 2025,
    });

    // Cumulative after 10 years should be -3000 + sum of savings
    const totalSavings = result.cashFlows.reduce((s, cf) => s + cf.savings, 0);
    expect(result.cashFlows[9].cumulativeCashFlow).toBeCloseTo(-3000 + totalSavings, 1);
  });
});
