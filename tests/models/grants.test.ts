import { describe, expect, it } from 'vitest';
import { calculateGrantAmount, getEligibleGrants } from '../../src/models/grants';
import type { Grant } from '../../src/types';

describe('grants model', () => {
  const grants: Grant[] = [
    {
      id: 'g1',
      name: 'Grant 1',
      type: 'SEAI',
      percentage: 30,
      maxAmount: 1000,
      eligibleFor: ['hotel']
    },
    {
      id: 'g2',
      name: 'Grant 2',
      type: 'Other',
      percentage: 10,
      maxAmount: 999999,
      eligibleFor: ['hotel', 'farm']
    }
  ];

  it('filters eligible grants by business type', () => {
    expect(getEligibleGrants('hotel', grants).map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(getEligibleGrants('farm', grants).map((g) => g.id)).toEqual(['g2']);
  });

  it('applies percentage and caps each grant independently', () => {
    const { totalGrant, breakdown } = calculateGrantAmount(10_000, grants);

    // g1: 30% of 10k = 3000 but capped at 1000
    // g2: 10% of 10k = 1000
    expect(totalGrant).toBe(2000);
    expect(breakdown).toEqual([
      { grantId: 'g1', amount: 1000 },
      { grantId: 'g2', amount: 1000 }
    ]);
  });

  it('returns 0 if system cost is <= 0', () => {
    expect(calculateGrantAmount(0, grants).totalGrant).toBe(0);
    expect(calculateGrantAmount(-1, grants).totalGrant).toBe(0);
  });
});
