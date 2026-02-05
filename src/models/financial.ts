/**
 * Finance model helpers.
 *
 * Notes for future agents:
 * - All rates are expressed as decimals (e.g. 0.05 for 5%).
 * - NPV uses end-of-period discounting (year 1 discounted by (1+r)^1).
 * - IRR is numerically fragile. It can fail to converge or have no real solution.
 *   We use Newton-Raphson first, then a bounded bisection fallback.
 */

/**
 * Simple payback in years.
 *
 * Returns:
 * - `Infinity` if savings <= 0
 * - `0` if netInvestment <= 0
 */
export function calculateSimplePayback(netInvestment: number, annualSavings: number): number {
  if (!Number.isFinite(netInvestment) || netInvestment <= 0) return 0;
  if (!Number.isFinite(annualSavings) || annualSavings <= 0) return Infinity;
  return netInvestment / annualSavings;
}

/**
 * Net Present Value.
 *
 * @param initialInvestment positive number (treated as a cash outflow at time 0)
 * @param cashFlows array of annual net cashflows (year 1..N)
 * @param discountRate decimal (e.g. 0.05)
 */
export function calculateNPV(initialInvestment: number, cashFlows: number[], discountRate: number): number {
  if (!Number.isFinite(initialInvestment)) return NaN;
  if (!Number.isFinite(discountRate)) return NaN;

  let npv = -initialInvestment;
  for (let year = 0; year < cashFlows.length; year++) {
    const cf = cashFlows[year];
    npv += cf / Math.pow(1 + discountRate, year + 1);
  }
  return npv;
}

/**
 * Internal Rate of Return (IRR).
 *
 * Important:
 * - IRR can fail to converge (derivative ~ 0) OR have no solution (NPV never crosses 0)
 *   OR have multiple solutions.
 * - We attempt Newton-Raphson first (fast when it works), then fall back to bisection on
 *   a bounded range [-0.9, 10].
 * - We return `NaN` if we cannot bracket a root or if the math becomes non-finite.
 *
 * This implementation choice corresponds to: "IRR can fail to converge / have derivative ~0".
 */
export function calculateIRR(initialInvestment: number, cashFlows: number[], guess = 0.1): number {
  if (!Number.isFinite(initialInvestment) || initialInvestment <= 0) return NaN;

  const maxIterations = 100;
  const tolerance = 1e-7;

  let rate = guess;

  for (let i = 0; i < maxIterations; i++) {
    let npv = -initialInvestment;
    let derivative = 0;

    for (let year = 0; year < cashFlows.length; year++) {
      const t = year + 1;
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[year] / denom;
      derivative -= (t * cashFlows[year]) / (denom * (1 + rate));
    }

    if (Math.abs(npv) < tolerance) return rate;
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;

    rate = rate - npv / derivative;

    // Keep Newton step from diverging into invalid territory.
    if (rate <= -0.9999) rate = -0.9999;
    if (rate > 10) rate = 10;
  }

  // Fallback: basic bisection on [-0.9, 10]
  let lo = -0.9;
  let hi = 10;
  const f = (r: number) => calculateNPV(initialInvestment, cashFlows, r);
  let flo = f(lo);
  let fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return NaN;
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) return NaN;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (!Number.isFinite(fmid)) return NaN;
    if (Math.abs(fmid) < 1e-7) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }

  return (lo + hi) / 2;
}

/**
 * Calculates the *annual* loan payment for a fully-amortizing loan.
 *
 * @param principal loan principal (EUR)
 * @param annualRate decimal annual rate (e.g. 0.05)
 * @param years term in years
 */
export function calculateLoanPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  if (years <= 0) return 0;

  if (annualRate === 0) return principal / years;

  const monthlyRate = annualRate / 12;
  const n = years * 12;

  const monthlyPayment =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1);

  return monthlyPayment * 12;
}

/** Remaining principal after `yearsPaid` years of amortization. */
export function calculateLoanBalance(
  principal: number,
  annualRate: number,
  years: number,
  yearsPaid: number
): number {
  if (principal <= 0) return 0;
  if (years <= 0) return 0;
  if (yearsPaid <= 0) return principal;
  if (yearsPaid >= years) return 0;

  const n = years * 12;
  const p = yearsPaid * 12;

  if (annualRate === 0) {
    const remainingYears = years - yearsPaid;
    return (principal * remainingYears) / years;
  }

  const r = annualRate / 12;
  const monthlyPayment =
    (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  // Standard amortization remaining balance formula
  const balance = principal * Math.pow(1 + r, p) - monthlyPayment * ((Math.pow(1 + r, p) - 1) / r);
  return Math.max(0, balance);
}
