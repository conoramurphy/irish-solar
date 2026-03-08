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
    applyExportRateDecline: false,
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
    const result = projectCashFlows({ ...baseInputs, applyExportRateDecline: true });
    expect(result.cashFlows[0].savings).toBeCloseTo(2000, 2);
  });

  it('flat projection has higher 25-year total than declining projection', () => {
    const flat = projectCashFlows({ ...baseInputs, applyExportRateDecline: false });
    const declining = projectCashFlows({ ...baseInputs, applyExportRateDecline: true });

    const flatTotal = flat.cashFlows.reduce((s, cf) => s + cf.savings, 0);
    const decliningTotal = declining.cashFlows.reduce((s, cf) => s + cf.savings, 0);

    expect(flatTotal).toBeGreaterThan(decliningTotal);
  });

  it('decline kicks in at the correct calendar years', () => {
    const inputs: ProjectionInputs = {
      ...baseInputs,
      applyExportRateDecline: true,
      baseCalendarYear: 2025,
    };
    const result = projectCashFlows(inputs);

    // Year 1 = 2025, Year 6 = 2030, Year 7 = 2031, Year 8 = 2032, Year 9 = 2033

    const flat = projectCashFlows({ ...inputs, applyExportRateDecline: false });

    // Years 1-6 (2025-2030): no decline, should match flat (same generation & savings)
    for (let i = 0; i < 6; i++) {
      expect(result.cashFlows[i].savings).toBeCloseTo(flat.cashFlows[i].savings, 2);
    }

    // Year 7 (2031): decline should apply — savings should be less than flat
    expect(result.cashFlows[6].savings).toBeLessThan(flat.cashFlows[6].savings);

    // Year 8 (2032): even more decline
    expect(result.cashFlows[7].savings).toBeLessThan(result.cashFlows[6].savings);
  });

  it('export-only scenario sees the full decline', () => {
    const inputs: ProjectionInputs = {
      ...baseInputs,
      year1OperationalSavings: 1000,
      year1ExportRevenue: 1000,
      applyExportRateDecline: true,
      baseCalendarYear: 2025,
    };
    const result = projectCashFlows(inputs);

    // Year 9 (2033): export multiplier = 6/14 ≈ 0.4286
    // Non-export savings = 0, so total savings should be purely export * degradation * multiplier
    const year9 = result.cashFlows[8];
    const expectedMultiplier = 6 / 14;
    // degradation after 8 years at 0.5%
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
    const flat = projectCashFlows({ ...quickPayback, applyExportRateDecline: false });
    const declining = projectCashFlows({ ...quickPayback, applyExportRateDecline: true });

    // Payback ~1 year, well before 2031. Both should be the same.
    expect(flat.simplePayback).toBeCloseTo(declining.simplePayback, 2);
  });
});
