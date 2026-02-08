import type { BusinessType, Grant } from '../types';

/**
 * Grants model.
 *
 * Current assumption: grants are additive and each grant is capped independently.
 * If future policy implies mutually-exclusive grants, enforce it here (and update tests).
 */

export interface GrantCalculationContext {
  /** Installed DC capacity (kWp). Required for some SEAI/TAMS schemes. */
  systemSizeKwp?: number;
}

function calculateSeaiNonDomesticMicrogenSolarPvGrant(systemSizeKwp: number): number {
  // Based on SEAI Non-Domestic Microgen (Solar PV) schedule.
  // Interpreted as a piecewise linear schedule that reproduces SEAI's example amounts:
  // 1kWp=900, 2=1800, 3=2100, 4=2400, 5=2400, 6=2400, 7=2700, 20=6600, 30=8600, 1000=162600.
  const kwp = Math.min(Math.max(0, systemSizeKwp), 1000);
  if (kwp <= 0) return 0;

  const seg = (from: number, to: number, ratePerKwp: number) =>
    Math.max(0, Math.min(kwp, to) - from) * ratePerKwp;

  // 0..2 @ 900/kWp
  const a = seg(0, 2, 900);
  // 2..4 @ 300/kWp
  const b = seg(2, 4, 300);
  // 4..6 @ 0/kWp
  const c = seg(4, 6, 0);
  // 6..20 @ 300/kWp
  const d = seg(6, 20, 300);
  // 20..200 @ 200/kWp
  const e = seg(20, 200, 200);
  // 200..1000 @ 150/kWp
  const f = seg(200, 1000, 150);

  return a + b + c + d + e + f;
}

export function calculateSingleGrantAmount(
  systemCost: number,
  grant: Grant,
  context: GrantCalculationContext = {}
): number {
  if (!Number.isFinite(systemCost) || systemCost <= 0) return 0;

  const method = grant.calculation?.method ?? 'percentage-of-cost';

  if (method === 'seai-non-domestic-microgen-solar-pv') {
    const kwp = context.systemSizeKwp;
    if (!Number.isFinite(kwp) || (kwp ?? 0) <= 0) {
      throw new Error(`Grant "${grant.name}" requires a valid system size (kWp).`);
    }

    const calculatedAmount = calculateSeaiNonDomesticMicrogenSolarPvGrant(kwp!);
    return Math.min(Math.max(0, calculatedAmount), grant.maxAmount);
  }

  // Default / legacy: percentage-of-cost
  const calculatedAmount = systemCost * (grant.percentage / 100);
  return Math.min(Math.max(0, calculatedAmount), grant.maxAmount);
}

export function calculateGrantAmount(
  systemCost: number,
  grants: Grant[],
  context: GrantCalculationContext = {}
): {
  totalGrant: number;
  breakdown: Array<{ grantId: string; amount: number }>;
} {
  if (!Number.isFinite(systemCost) || systemCost <= 0) {
    return { totalGrant: 0, breakdown: [] };
  }

  const breakdown = grants.filter(Boolean).map((grant) => {
    const amount = calculateSingleGrantAmount(systemCost, grant, context);
    return { grantId: grant.id, amount };
  });

  const totalGrant = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { totalGrant, breakdown };
}

export function getEligibleGrants(businessType: BusinessType, allGrants: Grant[]): Grant[] {
  return allGrants.filter((grant) => grant.eligibleFor.includes(businessType));
}
