import { describe, expect, it } from 'vitest';
import {
  calculateIRR,
  calculateLoanBalance,
  calculateLoanPayment,
  calculateNPV,
  calculateSimplePayback
} from '../../src/models/financial';

describe('financial model', () => {
  it('calculates simple payback', () => {
    expect(calculateSimplePayback(100_000, 10_000)).toBe(10);
  });

  it('calculates NPV', () => {
    const cashFlows = [10_000, 10_000, 10_000, 10_000, 10_000];
    const npv = calculateNPV(40_000, cashFlows, 0.05);
    expect(npv).toBeGreaterThan(0);
  });

  it('calculates a reasonable IRR for a simple project', () => {
    const cashFlows = [10_000, 10_000, 10_000, 10_000, 10_000];
    const irr = calculateIRR(40_000, cashFlows);
    expect(irr).toBeGreaterThan(0.01);
    expect(irr).toBeLessThan(0.5);
  });

  it('returns NaN when IRR has no solution (no sign change)', () => {
    // If all future cashflows are 0, NPV is always negative => no IRR.
    const irr = calculateIRR(10_000, [0, 0, 0, 0]);
    expect(Number.isNaN(irr)).toBe(true);
  });

  it('handles an edge case where Newton step could be unstable', () => {
    // Extremely small cashflows vs investment will make IRR ~ very negative.
    // We mainly care the function returns a finite number or NaN, not Infinity.
    const irr = calculateIRR(1_000_000, [1, 1, 1, 1, 1]);
    expect(Number.isFinite(irr) || Number.isNaN(irr)).toBe(true);
  });

  it('calculates annual loan payment and decreasing balance', () => {
    const payment = calculateLoanPayment(100_000, 0.05, 10);
    expect(payment).toBeGreaterThan(10_000);

    const bal0 = calculateLoanBalance(100_000, 0.05, 10, 0);
    const bal5 = calculateLoanBalance(100_000, 0.05, 10, 5);
    const bal10 = calculateLoanBalance(100_000, 0.05, 10, 10);

    expect(bal0).toBeCloseTo(100_000, 6);
    expect(bal5).toBeGreaterThan(0);
    expect(bal5).toBeLessThan(bal0);
    expect(bal10).toBe(0);

    // Guard rails
    expect(calculateLoanPayment(0, 0.05, 10)).toBe(0);
    expect(calculateLoanPayment(1000, 0.05, 0)).toBe(0);
    expect(calculateLoanBalance(0, 0.05, 10, 1)).toBe(0);
  });
});
