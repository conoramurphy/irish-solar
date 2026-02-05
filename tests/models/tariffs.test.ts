import { describe, expect, it } from 'vitest';
import {
  calculateElectricityCost,
  calculateSavings,
  getAverageImportRate,
  projectFutureTariffs
} from '../../src/models/tariffs';
import type { Tariff } from '../../src/types';

describe('tariffs model', () => {
  it('uses direct rate for 24-hour tariff', () => {
    const tariff: Tariff = {
      id: 't1',
      supplier: 'x',
      product: 'y',
      type: '24-hour',
      standingCharge: 1,
      rates: [{ period: 'all-day', rate: 0.25 }],
      exportRate: 0.1
    };

    expect(getAverageImportRate(tariff)).toBe(0.25);
    expect(calculateSavings(1000, 200, tariff)).toBe(1000 * 0.25 + 200 * 0.1);
  });

  it('uses unweighted average for time-of-use tariff', () => {
    const tariff: Tariff = {
      id: 't2',
      supplier: 'x',
      product: 'y',
      type: 'time-of-use',
      standingCharge: 0,
      rates: [
        { period: 'night', rate: 0.2 },
        { period: 'day', rate: 0.4 }
      ],
      exportRate: 0.1
    };

    expect(getAverageImportRate(tariff)).toBeCloseTo(0.3, 10);
  });

  it('clamps negative kWh inputs in calculateSavings', () => {
    const tariff: Tariff = {
      id: 't3',
      supplier: 'x',
      product: 'y',
      type: '24-hour',
      standingCharge: 0,
      rates: [{ period: 'all-day', rate: 0.25 }],
      exportRate: 0.1
    };

    expect(calculateSavings(-100, -100, tariff)).toBe(0);
  });

  it('includes standing charge and optional pso levy in cost', () => {
    const tariff: Tariff = {
      id: 't4',
      supplier: 'x',
      product: 'y',
      type: '24-hour',
      standingCharge: 1,
      rates: [{ period: 'all-day', rate: 0.25 }],
      exportRate: 0.1,
      psoLevy: 0.01
    };

    const cost = calculateElectricityCost(1000, tariff, 365);
    expect(cost).toBe(365 * 1 + 1000 * 0.25 + 1000 * 0.01);

    // If consumption is <= 0, we still charge standing charges.
    expect(calculateElectricityCost(0, tariff, 365)).toBe(365);
  });

  it('projects future tariffs with flat method', () => {
    const projected = projectFutureTariffs(0.3, undefined, 3, 'flat');
    expect(projected).toEqual([0.3, 0.3, 0.3]);
  });

  it('projects future tariffs with trend method using historical CAGR', () => {
    const historical = {
      supplier: 's',
      product: 'p',
      history: [
        { effectiveDate: '2020-01-01', standingCharge: 0, unitRate: 0.2 },
        { effectiveDate: '2022-01-01', standingCharge: 0, unitRate: 0.3 }
      ]
    };

    const projected = projectFutureTariffs(0.3, historical as any, 2, 'trend');
    expect(projected).toHaveLength(2);
    expect(projected[0]).toBeGreaterThan(0.3);
    expect(projected[1]).toBeGreaterThan(projected[0]);
  });
});
