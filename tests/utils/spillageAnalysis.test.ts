import { describe, expect, it } from 'vitest';
import {
  buildSolarSpillageAnalysis,
  computeSolarOnlySpillageForAnnualGeneration,
  solveAnnualGenerationForTargetSpillage
} from '../../src/utils/spillageAnalysis';

describe('spillageAnalysis', () => {
  it('computes spillage = 0 when generation is always below consumption', () => {
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [1, 1, 1, 1];

    const { exportKwh, spillageFraction } = computeSolarOnlySpillageForAnnualGeneration({
      annualGenerationKwh: 4, // gen per hour = 1
      hourlyWeights,
      hourlyConsumptionKwh
    });

    expect(exportKwh).toBeCloseTo(0, 12);
    expect(spillageFraction).toBeCloseTo(0, 12);
  });

  it('computes spillage correctly in a simple analytic case', () => {
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [1, 1, 1, 1];

    // If G = 8, gen per hour = 2, export per hour = 1, total export = 4.
    const { exportKwh, spillageFraction } = computeSolarOnlySpillageForAnnualGeneration({
      annualGenerationKwh: 8,
      hourlyWeights,
      hourlyConsumptionKwh
    });

    expect(exportKwh).toBeCloseTo(4, 12);
    expect(spillageFraction).toBeCloseTo(0.5, 12);
  });

  it('solves for annual generation needed to reach target spillage (bisection)', () => {
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [1, 1, 1, 1];

    // For this case, spillage = 1 - 4/G (for G >= 4). For 0.5 spillage -> G = 8.
    const solved = solveAnnualGenerationForTargetSpillage({
      baseAnnualGenerationKwh: 4,
      hourlyWeights,
      hourlyConsumptionKwh,
      targetSpillageFraction: 0.5,
      iterations: 40
    });

    expect(solved).not.toBeNull();
    expect(solved!.annualGenerationKwh).toBeCloseTo(8, 3);
    expect(solved!.spillageFraction).toBeCloseTo(0.5, 3);
    expect(solved!.scaleFactor).toBeCloseTo(2, 3);
  });

  it('throws when hourlyWeights and hourlyConsumptionKwh lengths differ', () => {
    expect(() =>
      computeSolarOnlySpillageForAnnualGeneration({
        annualGenerationKwh: 100,
        hourlyWeights: [0.5, 0.5],
        hourlyConsumptionKwh: [1, 1, 1] // length mismatch
      })
    ).toThrow('hourlyWeights length must match hourlyConsumptionKwh length');
  });

  it('returns early when current spillage already equals target (within 1e-4)', () => {
    // With G=4 and hourlyConsumptionKwh=[1,1,1,1], spillage = 0 exactly.
    // Target 0.0 → |0 - 0| < 1e-4 → early return with scaleFactor=1
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [1, 1, 1, 1];

    const result = solveAnnualGenerationForTargetSpillage({
      baseAnnualGenerationKwh: 4,
      hourlyWeights,
      hourlyConsumptionKwh,
      targetSpillageFraction: 0 // current spillage is exactly 0 → early return
    });

    expect(result).not.toBeNull();
    expect(result!.scaleFactor).toBe(1);
    expect(result!.annualGenerationKwh).toBe(4);
  });

  it('takes the downward-bracket path when current spillage > target', () => {
    // G=20 → spillage > target=0.1. The solver must bracket downward (lo /= 2 loop).
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [1, 1, 1, 1];

    const result = solveAnnualGenerationForTargetSpillage({
      baseAnnualGenerationKwh: 20, // high generation → high spillage ~0.8
      hourlyWeights,
      hourlyConsumptionKwh,
      targetSpillageFraction: 0.1  // low target → current > target → downward bracket
    });

    expect(result).not.toBeNull();
    expect(result!.spillageFraction).toBeCloseTo(0.1, 2);
    expect(result!.annualGenerationKwh).toBeGreaterThan(0);
    expect(result!.annualGenerationKwh).toBeLessThan(20);
  });

  it('hits lo = 0 break in downward-bracket when baseG is very small with zero consumption', () => {
    // With consumption=[0,0,0,0], any positive generation gives spillage=1.0.
    // Starting from baseG=1e-8, lo /= 2 repeatedly until lo <= 1e-9 → lo=0, break.
    // f(lo=0) returns spillageFraction=0, which is <= target=0.5 → bracket found.
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [0, 0, 0, 0]; // all exported

    const result = solveAnnualGenerationForTargetSpillage({
      baseAnnualGenerationKwh: 1e-8, // very small → lo /= 2 hits <= 1e-9 quickly
      hourlyWeights,
      hourlyConsumptionKwh,
      targetSpillageFraction: 0.5 // current spillage (1.0) > 0.5 → downward bracket
    });

    // With zero consumption, any non-zero generation gives 100% spillage.
    // The solver should converge to near-zero generation.
    expect(result).not.toBeNull();
  });

  it('buildSolarSpillageAnalysis returns current + curve + optional target', () => {
    const hourlyWeights = [0.25, 0.25, 0.25, 0.25];
    const hourlyConsumptionKwh = [1, 1, 1, 1];

    const analysis = buildSolarSpillageAnalysis({
      currentAnnualGenerationKwh: 4,
      hourlyWeights,
      hourlyConsumptionKwh,
      targetSpillageFraction: 0.5,
      curveScaleFactors: [1, 2, 3]
    });

    expect(analysis).not.toBeNull();
    expect(analysis!.current.scaleFactor).toBe(1);
    expect(analysis!.curve).toHaveLength(3);
    expect(analysis!.target).toBeTruthy();
    expect(analysis!.target!.scaleFactor).toBeCloseTo(2, 2);
  });
});
