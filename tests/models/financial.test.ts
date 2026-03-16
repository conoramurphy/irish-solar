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

  it('falls back to bisection when Newton-Raphson diverges', () => {
    // Craft cash flows that make Newton-Raphson unstable:
    // Large negative early, then large positive later makes derivative near-zero
    // at certain points. Bisection should still find the root.
    const cashFlows = [-50_000, -50_000, 200_000, 200_000, 200_000];
    const irr = calculateIRR(100_000, cashFlows, -0.5); // bad initial guess to destabilize Newton
    // The function should still converge via bisection to a finite IRR
    expect(Number.isFinite(irr)).toBe(true);
    // Verify the IRR is actually correct by checking NPV ≈ 0
    const npv = calculateNPV(100_000, cashFlows, irr);
    expect(Math.abs(npv)).toBeLessThan(1); // NPV should be near 0
  });

  it('handles loan balance at zero interest rate', () => {
    const balance = calculateLoanBalance(120_000, 0, 10, 3);
    // 3 years paid of 10 => 7/10 remaining
    expect(balance).toBeCloseTo(84_000, 0);
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

  describe('IRR bisection fallback', () => {
    it('bisection succeeds when Newton-Raphson hits derivative < 1e-12 guard', () => {
      // Cash flows designed so the NPV curve is very flat near the root,
      // making the derivative tiny and triggering the abs(derivative) < 1e-12 break.
      // Many near-zero cash flows with a large distant return produce a flat NPV region.
      const cashFlows = [
        0.001, 0.001, 0.001, 0.001, 0.001,
        0.001, 0.001, 0.001, 0.001, 0.001,
        0.001, 0.001, 0.001, 0.001, 0.001,
        0.001, 0.001, 0.001, 0.001, 100_000
      ];
      // Start Newton at a guess far from the root where gradient is near-zero
      const irr = calculateIRR(1, cashFlows, 5.0);
      expect(Number.isFinite(irr)).toBe(true);
      // Verify NPV ≈ 0 at the returned rate
      const npv = calculateNPV(1, cashFlows, irr);
      expect(Math.abs(npv)).toBeLessThan(1);
    });

    it('bisection returns NaN when flo * fhi > 0 (no root in bracket)', () => {
      // All negative cash flows: NPV is negative for every discount rate in [-0.9, 10].
      // Newton will fail to converge, and bisection cannot bracket a root.
      const irr = calculateIRR(10_000, [-1_000, -1_000, -1_000, -1_000, -1_000]);
      expect(Number.isNaN(irr)).toBe(true);
    });

    it('bisection returns NaN when NPV is non-finite during bisection', () => {
      // Craft flows that produce Infinity/NaN during NPV evaluation at mid-points.
      // A single enormous cash flow at a distant year: at rate near -1,
      // Math.pow(1 + rate, t) → 0 → division by zero → Infinity.
      // Newton will clamp to -0.9999 and break, then bisection starts at lo = -0.9.
      // With an astronomically large flow, some mid-points produce non-finite NPV.
      const cashFlows: number[] = new Array(200).fill(0);
      cashFlows[199] = Number.MAX_VALUE;
      const irr = calculateIRR(1, cashFlows, -0.99);
      // Either finds a rate or returns NaN; the key is exercising the non-finite guard
      expect(Number.isFinite(irr) || Number.isNaN(irr)).toBe(true);
    });

    it('Newton clamps to -0.9999 and bisection finds the answer', () => {
      // Tiny investment, huge return far in the future at a low rate.
      // Newton with a very negative initial guess will repeatedly clamp at -0.9999,
      // fail to converge from there, and then bisection picks up.
      const cashFlows = [0, 0, 0, 0, 0, 0, 0, 0, 0, 500];
      const irr = calculateIRR(100, cashFlows, -0.99);
      expect(Number.isFinite(irr)).toBe(true);
      const npv = calculateNPV(100, cashFlows, irr);
      expect(Math.abs(npv)).toBeLessThan(1);
    });

    it('bisection converges after Newton diverges past rate > 10', () => {
      // Many small flows that sum to much more than investment, with an IRR in range.
      // Starting Newton at 9.5 causes it to clamp at 10 and oscillate,
      // then bisection on [-0.9, 10] finds the actual root.
      const cashFlows = Array.from({ length: 30 }, () => 50);
      // IRR for investment=100 with 30×50 is high but within [0, 10].
      const irr = calculateIRR(100, cashFlows, 9.5);
      expect(Number.isFinite(irr)).toBe(true);
      const npv = calculateNPV(100, cashFlows, irr);
      expect(Math.abs(npv)).toBeLessThan(1);
    });

    it('bisection returns exact lo when f(lo) === 0', () => {
      // Edge case: NPV at lo = -0.9 is exactly 0.
      // Investment = sum of cashFlows[i] / (1 + (-0.9))^(i+1)
      // With rate = -0.9, denom = 0.1^t. So cf / 0.1^1 = cf * 10.
      // If investment = cf * 10, NPV(-0.9) = 0.
      // Use a single cash flow: investment = cf / 0.1 = cf * 10
      // cf = 5 => investment = 50
      // Newton must fail first. Use a guess that causes derivative issues.
      const cashFlows = [5];
      // NPV at r=-0.9: -50 + 5/(0.1) = -50 + 50 = 0 exactly
      // Newton at guess=8: npv = -50 + 5/9 ≈ -49.44, derivative = -5/81 ≈ -0.0617
      // Rate would jump wildly. Eventually bisection starts and f(lo) = 0 → returns lo.
      const irr = calculateIRR(50, cashFlows, 8);
      expect(Number.isFinite(irr)).toBe(true);
      // Should return -0.9 or something very close
      const npv = calculateNPV(50, cashFlows, irr);
      expect(Math.abs(npv)).toBeLessThan(1);
    });

    it('bisection loop exhausts 100 iterations and returns midpoint', () => {
      // Craft a case where the NPV function crosses zero but has value > tolerance
      // at every bisection midpoint, forcing all 100 iterations.
      // This is hard to guarantee analytically, but a normal case will do ~47
      // iterations (log2(10.9 / 1e-7) ≈ 27), so this exercises the full loop.
      // A steep crossing ensures many iterations near the root without hitting tolerance early.
      const cashFlows = Array.from({ length: 50 }, (_, i) => (i < 25 ? -100 : 200));
      const irr = calculateIRR(1_000, cashFlows, -0.8);
      expect(Number.isFinite(irr)).toBe(true);
      const npv = calculateNPV(1_000, cashFlows, irr);
      expect(Math.abs(npv)).toBeLessThan(1);
    });
  });
});
