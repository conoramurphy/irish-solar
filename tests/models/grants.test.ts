import { describe, expect, it } from 'vitest';
import { calculateGrantAmount, calculateSingleGrantAmount, getEligibleGrants } from '../../src/models/grants';
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

  describe('SEAI Non-Domestic Microgen (kWp-based) grants', () => {
    const seaiKwpGrant: Grant = {
      id: 'seai-ndmg',
      name: 'SEAI Non-Domestic Microgen Grant (Solar PV)',
      type: 'SEAI',
      percentage: 0,
      maxAmount: 162_600,
      eligibleFor: ['hotel'],
      calculation: { method: 'seai-non-domestic-microgen-solar-pv' }
    };

    it('calculates expected values from SEAI examples (e.g. 30kWp -> €8,600)', () => {
      const amount = calculateSingleGrantAmount(1_000, seaiKwpGrant, { systemSizeKwp: 30 });
      expect(amount).toBe(8_600);
    });

    it('caps at the SEAI max (e.g. 1000kWp -> €162,600)', () => {
      const amount = calculateSingleGrantAmount(1_000, seaiKwpGrant, { systemSizeKwp: 1000 });
      expect(amount).toBe(162_600);
    });

    it('throws when system size is missing', () => {
      expect(() => calculateGrantAmount(10_000, [seaiKwpGrant])).toThrow(/requires a valid system size/i);
    });
  });

  describe('grant eligibility edge cases', () => {
    it('returns empty array when no grants match business type', () => {
      const eligible = getEligibleGrants('other', grants);
      expect(eligible).toHaveLength(0);
    });

    it('returns empty array when business type is not in any grant', () => {
      const commercialOnly: Grant = {
        id: 'comm',
        name: 'Commercial Only',
        type: 'Other',
        percentage: 20,
        maxAmount: 50000,
        eligibleFor: ['commercial']
      };
      const eligible = getEligibleGrants('hotel', [commercialOnly]);
      expect(eligible).toHaveLength(0);
    });

    it('correctly filters when grant is eligible for all business types', () => {
      const universalGrant: Grant = {
        id: 'uni',
        name: 'Universal',
        type: 'Other',
        percentage: 15,
        maxAmount: 30000,
        eligibleFor: ['hotel', 'farm', 'commercial', 'other']
      };
      
      ['hotel', 'farm', 'commercial', 'other'].forEach(bizType => {
        const eligible = getEligibleGrants(bizType as any, [universalGrant]);
        expect(eligible).toHaveLength(1);
        expect(eligible[0].id).toBe('uni');
      });
    });

    it('handles empty grants array', () => {
      const eligible = getEligibleGrants('hotel', []);
      expect(eligible).toHaveLength(0);
      
      const { totalGrant } = calculateGrantAmount(50_000, []);
      expect(totalGrant).toBe(0);
    });

    it('handles very large system cost with caps', () => {
      const largeGrant: Grant = {
        id: 'large',
        name: 'Large',
        type: 'SEAI',
        percentage: 50,
        maxAmount: 100_000,
        eligibleFor: ['hotel']
      };
      
      const { totalGrant } = calculateGrantAmount(10_000_000, [largeGrant]);
      // 50% of 10M = 5M but capped at 100k
      expect(totalGrant).toBe(100_000);
    });
  });
});
