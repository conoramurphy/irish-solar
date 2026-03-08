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

  describe('TAMS 3 SCIS', () => {
    const tamsGrant: Grant = {
      id: 'tams-scis-solar-pv',
      name: 'TAMS 3 Solar Capital Investment Scheme (SCIS)',
      type: 'TAMS',
      percentage: 60,
      maxAmount: 54_000,
      eligibleFor: ['farm'],
      calculation: { method: 'tams-scis-solar-pv' }
    };

    it('caps eligible kWp by annual consumption (kWh/1000) and 62 kWp', () => {
      // 30,000 kWh → 30 kWp cap; system 40 kWp → eligible 30 kWp
      const amount = calculateSingleGrantAmount(80_000, tamsGrant, {
        systemSizeKwp: 40,
        batterySizeKwh: 0,
        annualConsumptionKwh: 30_000
      });
      expect(amount).toBeGreaterThan(0);
      // refEligible = 1441*30+1849 = 45079; eligibleCost min(45079, prorated, 90k); grant 60%
      const refEligible = 1441 * 30 + 1849;
      expect(amount).toBe(Math.round(0.6 * Math.min(refEligible, 90_000)));
    });

    it('caps eligible kWp at 62 when consumption is very high', () => {
      const amount = calculateSingleGrantAmount(100_000, tamsGrant, {
        systemSizeKwp: 70,
        batterySizeKwh: 0,
        annualConsumptionKwh: 70_000
      });
      // refEligible for 62 kWp > 90k, so eligibleCost capped at 90k; but prorated actual = 100k * (refEligible/refTotal) < 90k
      const refEligible62 = 1441 * 62 + 1849;
      const refTotal70 = 1441 * 70 + 1849;
      const prorated = 100_000 * (refEligible62 / refTotal70);
      const eligibleCost = Math.min(refEligible62, prorated, 90_000);
      expect(amount).toBe(Math.round(0.6 * eligibleCost));
    });

    it('caps eligible battery at 50% of eligible kWp', () => {
      // 20 kWp eligible, 15 kWh battery → eligible battery min(15, 10) = 10 kWh
      const amount = calculateSingleGrantAmount(60_000, tamsGrant, {
        systemSizeKwp: 20,
        batterySizeKwh: 15,
        annualConsumptionKwh: 25_000
      });
      const refPanels = 1441 * 20 + 1849;
      const refBattery = 703 * 10 + 753;
      const refEligible = refPanels + refBattery;
      expect(amount).toBe(Math.round(0.6 * Math.min(refEligible, 90_000)));
    });

    it('returns 0 when annualConsumptionKwh is missing', () => {
      const amount = calculateSingleGrantAmount(50_000, tamsGrant, {
        systemSizeKwp: 30,
        batterySizeKwh: 10
      });
      expect(amount).toBe(0);
    });

    it('returns 0 when annualConsumptionKwh is 0', () => {
      const amount = calculateSingleGrantAmount(50_000, tamsGrant, {
        systemSizeKwp: 30,
        batterySizeKwh: 10,
        annualConsumptionKwh: 0
      });
      expect(amount).toBe(0);
    });

    it('returns 0 when system cost is below min investment (€2,000)', () => {
      const amount = calculateSingleGrantAmount(1_500, tamsGrant, {
        systemSizeKwp: 10,
        batterySizeKwh: 0,
        annualConsumptionKwh: 12_000
      });
      expect(amount).toBe(0);
    });

    it('caps grant at €54,000', () => {
      const amount = calculateSingleGrantAmount(200_000, tamsGrant, {
        systemSizeKwp: 62,
        batterySizeKwh: 31,
        annualConsumptionKwh: 70_000
      });
      expect(amount).toBe(54_000);
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
