import { describe, it, expect } from 'vitest';
import { estimateSystemCost } from '../../src/utils/costEstimation';

describe('estimateSystemCost', () => {
  it('matches the commercial benchmark (74kWp + 460kWh)', () => {
    // PV: 74 * ~914 = 67,636
    // Batt: 460 * 350 = 161,000
    // Sum = 228,636
    // * 1.33 = 304,085
    const cost = estimateSystemCost(74, 460);
    expect(cost).toBeGreaterThan(295000);
    expect(cost).toBeLessThan(310000);
  });

  it('calculates small domestic system reasonably (6kWp + 5kWh)', () => {
    // PV: 6 * 1200 = 7200
    // Batt: 5 * 350 = 1750
    // Sum = 8950
    // * 1.33 = 11,903
    const cost = estimateSystemCost(6, 5);
    expect(cost).toBeGreaterThan(11000);
    expect(cost).toBeLessThan(13000);
  });

  it('handles PV only (50kWp)', () => {
    // PV: 50 * 950 = 47,500
    // * 1.33 = 63,175
    const cost = estimateSystemCost(50, 0);
    expect(cost).toBeGreaterThan(60000);
    expect(cost).toBeLessThan(65000);
  });

  it('handles Battery only (100kWh)', () => {
    // Batt: 100 * 350 = 35,000
    // * 1.33 = 46,550
    const cost = estimateSystemCost(0, 100);
    expect(cost).toBeGreaterThan(46000);
    expect(cost).toBeLessThan(47000);
  });

  it('returns 0 for empty system', () => {
    expect(estimateSystemCost(0, 0)).toBe(0);
  });
});
