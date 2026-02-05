import type { BusinessType, Grant } from '../types';

/**
 * Grants model.
 *
 * Current assumption: grants are additive and each grant is capped independently.
 * If future policy implies mutually-exclusive grants, enforce it here (and update tests).
 */

export function calculateGrantAmount(
  systemCost: number,
  grants: Grant[]
): {
  totalGrant: number;
  breakdown: Array<{ grantId: string; amount: number }>;
} {
  if (!Number.isFinite(systemCost) || systemCost <= 0) {
    return { totalGrant: 0, breakdown: [] };
  }

  const breakdown = grants
    .filter(Boolean)
    .map((grant) => {
      const calculatedAmount = systemCost * (grant.percentage / 100);
      const amount = Math.min(Math.max(0, calculatedAmount), grant.maxAmount);
      return { grantId: grant.id, amount };
    });

  const totalGrant = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { totalGrant, breakdown };
}

export function getEligibleGrants(businessType: BusinessType, allGrants: Grant[]): Grant[] {
  return allGrants.filter((grant) => grant.eligibleFor.includes(businessType));
}
