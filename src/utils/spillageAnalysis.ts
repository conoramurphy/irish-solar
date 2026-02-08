import type { SolarSpillageAnalysis, SolarSpillageCurvePoint } from '../types';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function uniqueSorted(nums: number[]): number[] {
  return Array.from(new Set(nums.filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
}

export function computeSolarOnlySpillageForAnnualGeneration(args: {
  annualGenerationKwh: number;
  hourlyWeights: number[];
  hourlyConsumptionKwh: number[];
}): { exportKwh: number; spillageFraction: number } {
  const { annualGenerationKwh, hourlyWeights, hourlyConsumptionKwh } = args;

  if (hourlyWeights.length !== hourlyConsumptionKwh.length) {
    throw new Error('hourlyWeights length must match hourlyConsumptionKwh length');
  }

  const G = Math.max(0, annualGenerationKwh);
  if (G <= 0) return { exportKwh: 0, spillageFraction: 0 };

  let exportKwh = 0;
  for (let i = 0; i < hourlyWeights.length; i++) {
    const w = Math.max(0, hourlyWeights[i] ?? 0);
    const c = Math.max(0, hourlyConsumptionKwh[i] ?? 0);
    const gen = G * w;
    if (gen > c) exportKwh += gen - c;
  }

  const spillageFraction = clamp01(exportKwh / G);
  return { exportKwh, spillageFraction };
}

export function solveAnnualGenerationForTargetSpillage(args: {
  baseAnnualGenerationKwh: number;
  hourlyWeights: number[];
  hourlyConsumptionKwh: number[];
  targetSpillageFraction: number;
  maxDoublings?: number;
  iterations?: number;
}): { annualGenerationKwh: number; exportKwh: number; spillageFraction: number; scaleFactor: number } | null {
  const {
    baseAnnualGenerationKwh,
    hourlyWeights,
    hourlyConsumptionKwh,
    targetSpillageFraction,
    maxDoublings = 20,
    iterations = 30
  } = args;

  const target = clamp01(targetSpillageFraction);
  const baseG = Math.max(0, baseAnnualGenerationKwh);
  if (baseG <= 0) return null;

  const f = (G: number) =>
    computeSolarOnlySpillageForAnnualGeneration({
      annualGenerationKwh: G,
      hourlyWeights,
      hourlyConsumptionKwh
    });

  const current = f(baseG);
  if (Math.abs(current.spillageFraction - target) < 1e-4) {
    return {
      annualGenerationKwh: baseG,
      exportKwh: current.exportKwh,
      spillageFraction: current.spillageFraction,
      scaleFactor: 1
    };
  }

  // Bracket the solution.
  let lo: number;
  let hi: number;

  if (current.spillageFraction < target) {
    lo = baseG;
    hi = baseG;
    for (let i = 0; i < maxDoublings; i++) {
      hi *= 2;
      if (f(hi).spillageFraction >= target) break;
    }

    // Failed to bracket.
    if (f(hi).spillageFraction < target) return null;
  } else {
    // Need to search downward.
    hi = baseG;
    lo = baseG;
    for (let i = 0; i < maxDoublings; i++) {
      lo /= 2;
      if (lo <= 1e-9) {
        lo = 0;
        break;
      }
      if (f(lo).spillageFraction <= target) break;
    }

    if (f(lo).spillageFraction > target) return null;
  }

  // Bisection.
  let mid = (lo + hi) / 2;
  for (let i = 0; i < iterations; i++) {
    mid = (lo + hi) / 2;
    const m = f(mid);
    if (m.spillageFraction < target) lo = mid;
    else hi = mid;
  }

  const solved = f(mid);
  return {
    annualGenerationKwh: mid,
    exportKwh: solved.exportKwh,
    spillageFraction: solved.spillageFraction,
    scaleFactor: mid / baseG
  };
}

export function buildSolarSpillageAnalysis(args: {
  currentAnnualGenerationKwh: number;
  hourlyWeights: number[];
  hourlyConsumptionKwh: number[];
  targetSpillageFraction?: number;
  curveScaleFactors?: number[];
}): SolarSpillageAnalysis | null {
  const {
    currentAnnualGenerationKwh,
    hourlyWeights,
    hourlyConsumptionKwh,
    targetSpillageFraction = 0.3,
    curveScaleFactors
  } = args;

  const baseG = Math.max(0, currentAnnualGenerationKwh);
  if (baseG <= 0) return null;

  const current = computeSolarOnlySpillageForAnnualGeneration({
    annualGenerationKwh: baseG,
    hourlyWeights,
    hourlyConsumptionKwh
  });

  const target = solveAnnualGenerationForTargetSpillage({
    baseAnnualGenerationKwh: baseG,
    hourlyWeights,
    hourlyConsumptionKwh,
    targetSpillageFraction
  });

  const targetFactor = target?.scaleFactor;
  const defaultFactors = targetFactor && targetFactor > 1
    ? [0.5, 0.75, 1, 1.5, 2, Math.min(3, targetFactor), targetFactor, Math.max(4, Math.min(8, targetFactor * 1.25))]
    : [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];

  const factors = uniqueSorted(curveScaleFactors ?? defaultFactors);

  const curve: SolarSpillageCurvePoint[] = factors.map((scaleFactor) => {
    const annualGenerationKwh = baseG * scaleFactor;
    const { exportKwh, spillageFraction } = computeSolarOnlySpillageForAnnualGeneration({
      annualGenerationKwh,
      hourlyWeights,
      hourlyConsumptionKwh
    });
    return { annualGenerationKwh, scaleFactor, exportKwh, spillageFraction };
  });

  const analysis: SolarSpillageAnalysis = {
    targetSpillageFraction: clamp01(targetSpillageFraction),
    current: {
      annualGenerationKwh: baseG,
      scaleFactor: 1,
      exportKwh: current.exportKwh,
      spillageFraction: current.spillageFraction
    },
    target: target
      ? {
          annualGenerationKwh: target.annualGenerationKwh,
          scaleFactor: target.scaleFactor,
          exportKwh: target.exportKwh,
          spillageFraction: target.spillageFraction
        }
      : undefined,
    curve,
    note: 'Solar-only spillage analysis (no battery, no € rates). Uses the hourly solar shape and hourly load shape.'
  };

  return analysis;
}
