import { describe, it, expect } from 'vitest';
import { estimateSystemCost, estimateSystemCostBreakdown } from '../../src/utils/costEstimation';

describe('estimateSystemCost', () => {
  it('matches the commercial benchmark (74kWp + 460kWh)', () => {
    // PV: 74 * ~821 = 60,769
    // Batt: 460 * 350 = 161,000
    // Sum = 221,769
    // * 1.33 = ~294,953
    const cost = estimateSystemCost(74, 460, 'commercial');
    expect(cost).toBeGreaterThan(285000);
    expect(cost).toBeLessThan(300000);
  });

  it('calculates small domestic system reasonably (6kWp + 5kWh) in commercial mode', () => {
    // PV: 6 * 1100 = 6600
    // Batt: 5 * 350 = 1750
    // Sum = 8350
    // * 1.33 = 11,106
    const cost = estimateSystemCost(6, 5, 'commercial');
    expect(cost).toBeGreaterThan(10500);
    expect(cost).toBeLessThan(12000);
  });

  it('matches domestic baseline (8kWp + 5kWh ≈ €8,000 inc VAT @ 13.5%)', () => {
    const vatRate = 0.135;
    const base = estimateSystemCost(8, 5, 'domestic');
    const incVat = base * (1 + vatRate);

    // Use a tolerance band because this is a heuristic estimator.
    expect(incVat).toBeGreaterThan(7500);
    expect(incVat).toBeLessThan(8500);
  });

  it('handles PV only (50kWp)', () => {
    // PV: 50 * 850 = 42,500
    // * 1.33 = 56,525
    const cost = estimateSystemCost(50, 0, 'commercial');
    expect(cost).toBeGreaterThan(54000);
    expect(cost).toBeLessThan(58000);
  });

  it('handles Battery only (100kWh)', () => {
    // Batt: 100 * 350 = 35,000
    // * 1.33 = 46,550
    const cost = estimateSystemCost(0, 100, 'commercial');
    expect(cost).toBeGreaterThan(46000);
    expect(cost).toBeLessThan(47000);
  });

  it('returns 0 for empty system', () => {
    expect(estimateSystemCost(0, 0, 'commercial')).toBe(0);
    expect(estimateSystemCost(0, 0, 'domestic')).toBe(0);
  });

  it('exposes a breakdown that matches the total estimate (commercial)', () => {
    const breakdown = estimateSystemCostBreakdown(12, 12, 'commercial');
    expect(breakdown.solar.tier).toBe('10-50kWp');
    expect(breakdown.totalBaseCost).toBeCloseTo(estimateSystemCost(12, 12, 'commercial'));
  });

  it('labels tiers correctly for common boundary values (commercial)', () => {
    expect(estimateSystemCostBreakdown(6, 0, 'commercial').solar.tier).toBe('<=10kWp');
    expect(estimateSystemCostBreakdown(10, 0, 'commercial').solar.tier).toBe('<=10kWp');
    expect(estimateSystemCostBreakdown(10.1, 0, 'commercial').solar.tier).toBe('10-50kWp');
    expect(estimateSystemCostBreakdown(50, 0, 'commercial').solar.tier).toBe('10-50kWp');
    expect(estimateSystemCostBreakdown(50.1, 0, 'commercial').solar.tier).toBe('50-150kWp');
    expect(estimateSystemCostBreakdown(150, 0, 'commercial').solar.tier).toBe('50-150kWp');
    expect(estimateSystemCostBreakdown(151, 0, 'commercial').solar.tier).toBe('>150kWp');
  });

  it('labels tiers correctly for common boundary values (domestic)', () => {
    expect(estimateSystemCostBreakdown(6, 0, 'domestic').solar.tier).toBe('<=10kWp');
    expect(estimateSystemCostBreakdown(10, 0, 'domestic').solar.tier).toBe('<=10kWp');
    expect(estimateSystemCostBreakdown(10.1, 0, 'domestic').solar.tier).toBe('10-50kWp');
  });
});
