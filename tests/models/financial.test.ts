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

  it('returns NaN when all cash flows are negative', () => {
    // Project that loses money every year - no IRR solution
    const irr = calculateIRR(50_000, [-5_000, -5_000, -5_000, -5_000, -5_000]);
    expect(Number.isNaN(irr)).toBe(true);
  });

  it('returns NaN for zero or negative initial investment', () => {
    const cashFlows = [10_000, 10_000, 10_000];
    
    const irrZero = calculateIRR(0, cashFlows);
    expect(Number.isNaN(irrZero)).toBe(true);
    
    const irrNeg = calculateIRR(-10_000, cashFlows);
    expect(Number.isNaN(irrNeg)).toBe(true);
  });

  it('handles very high IRR scenarios correctly', () => {
    // Small investment, large returns => very high IRR
    const irr = calculateIRR(1_000, [10_000, 10_000, 10_000]);
    expect(irr).toBeGreaterThan(1); // > 100% return
    expect(Number.isFinite(irr)).toBe(true);
  });

  it('handles break-even scenario (IRR ~ 0)', () => {
    // Returns exactly match investment spread over time
    const irr = calculateIRR(10_000, [2_500, 2_500, 2_500, 2_500]);
    expect(irr).toBeGreaterThanOrEqual(-0.1);
    expect(irr).toBeLessThanOrEqual(0.1);
  });

  it('handles mixed positive and negative cash flows', () => {
    // Some years profit, some years loss
    const irr = calculateIRR(50_000, [20_000, -5_000, 20_000, -5_000, 30_000]);
    // Should find a solution if NPV crosses zero
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

  describe('financial edge cases', () => {
    it('handles zero interest rate correctly', () => {
      const payment = calculateLoanPayment(100_000, 0, 10);
      expect(payment).toBeCloseTo(10_000, 1); // 100k / 10 years
    });

    it('handles loan balance with yearsPaid > term', () => {
      const balance = calculateLoanBalance(100_000, 0.05, 10, 15);
      expect(balance).toBe(0); // Loan fully paid off
    });

    it('handles negative yearsPaid', () => {
      const balance = calculateLoanBalance(100_000, 0.05, 10, -5);
      expect(balance).toBe(100_000); // Full principal
    });

    it('calculates NPV with negative discount rate', () => {
      const cashFlows = [10_000, 10_000, 10_000];
      const npv = calculateNPV(20_000, cashFlows, -0.05);
      // Negative discount rate makes future cash flows worth more
      expect(npv).toBeGreaterThan(calculateNPV(20_000, cashFlows, 0.05));
    });

    it('calculates NPV with zero discount rate', () => {
      const cashFlows = [10_000, 10_000, 10_000];
      const npv = calculateNPV(20_000, cashFlows, 0);
      // With 0% discount, NPV = sum of cash flows - investment
      expect(npv).toBeCloseTo(10_000, 1);
    });

    it('calculates simple payback with zero savings', () => {
      const payback = calculateSimplePayback(100_000, 0);
      expect(payback).toBe(Infinity);
    });

    it('calculates simple payback with zero investment', () => {
      const payback = calculateSimplePayback(0, 10_000);
      expect(payback).toBe(0);
    });

    it('calculates simple payback with negative investment', () => {
      const payback = calculateSimplePayback(-10_000, 5_000);
      expect(payback).toBe(0);
    });

    it('calculates simple payback with negative savings', () => {
      const payback = calculateSimplePayback(100_000, -5_000);
      expect(payback).toBe(Infinity);
    });

    it('handles very long loan terms', () => {
      const payment = calculateLoanPayment(100_000, 0.05, 50); // 50 year loan
      expect(payment).toBeGreaterThan(0);
      expect(payment).toBeLessThan(10_000); // Should be less than 10-year payment

      const bal25 = calculateLoanBalance(100_000, 0.05, 50, 25);
      expect(bal25).toBeGreaterThan(0);
      expect(bal25).toBeLessThan(100_000);
    });
  });
});
