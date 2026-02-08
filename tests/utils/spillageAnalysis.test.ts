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
