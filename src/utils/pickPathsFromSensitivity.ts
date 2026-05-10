import type { SensitivityAnalysis, SensitivityVariant } from '../types';

export type ReductionTarget = 33 | 50 | 100;

export interface PathRecommendation {
  targetReductionPct: ReductionTarget;
  systemSizeKwp: number;
  batterySizeKwh: number;
  capexGross: number;
  capexNet: number;
  grantApplied: number;
  annualSavings: number;
  actualReductionPct: number;
  simplePaybackYears: number;
  /** False when the grid couldn't reach the target — caller surfaces honestly. */
  targetMet: boolean;
}

interface FlatCell {
  systemSizeKwp: number;
  variant: SensitivityVariant;
}

function flatten(analysis: SensitivityAnalysis): FlatCell[] {
  const cells: FlatCell[] = [];
  for (const row of analysis.rows) {
    cells.push({ systemSizeKwp: row.systemSizeKwp, variant: row.noBattery });
    cells.push({ systemSizeKwp: row.systemSizeKwp, variant: row.halfBattery });
    cells.push({ systemSizeKwp: row.systemSizeKwp, variant: row.fullBattery });
    cells.push({ systemSizeKwp: row.systemSizeKwp, variant: row.doubleBattery });
  }
  return cells;
}

function toRecommendation(
  target: ReductionTarget,
  cell: FlatCell,
  baselineAnnualBill: number,
  targetMet: boolean
): PathRecommendation {
  const v = cell.variant;
  const annualSavings = Math.max(0, v.annualSavings);
  const actualReductionPct =
    baselineAnnualBill > 0 ? (annualSavings / baselineAnnualBill) * 100 : 0;
  const simplePaybackYears = annualSavings > 0 ? v.netCost / annualSavings : Infinity;
  return {
    targetReductionPct: target,
    systemSizeKwp: cell.systemSizeKwp,
    batterySizeKwh: v.batterySizeKwh,
    capexGross: v.systemCost,
    capexNet: v.netCost,
    grantApplied: Math.max(0, v.systemCost - v.netCost),
    annualSavings,
    actualReductionPct,
    simplePaybackYears,
    targetMet,
  };
}

/**
 * Pick the lowest-net-CapEx cell from an existing sensitivity sweep that meets
 * each of three reduction targets (33%, 50%, 100%). If no cell meets a target,
 * return the highest-reduction cell available with `targetMet: false` so the
 * UI can surface that honestly (per CLAUDE.md no-silent-failure).
 *
 * Battery presence is incidental — the rule is simply lowest netCost. A
 * battery-bearing cell only wins when it's actually the cheapest way to hit
 * the target.
 */
export function pickPathsFromSensitivity(
  analysis: SensitivityAnalysis,
  baselineAnnualBill: number,
  targets: readonly ReductionTarget[] = [33, 50, 100]
): PathRecommendation[] {
  if (baselineAnnualBill <= 0) {
    throw new Error(
      'pickPathsFromSensitivity: baselineAnnualBill must be positive'
    );
  }

  const cells = flatten(analysis);
  if (cells.length === 0) {
    throw new Error('pickPathsFromSensitivity: empty sensitivity analysis');
  }

  return targets.map((target) => {
    const meeting = cells.filter((c) => {
      const pct = (c.variant.annualSavings / baselineAnnualBill) * 100;
      return pct >= target;
    });

    if (meeting.length > 0) {
      // Lowest net CapEx wins. Tiebreak: smaller battery (cleaner install).
      meeting.sort(
        (a, b) =>
          a.variant.netCost - b.variant.netCost ||
          a.variant.batterySizeKwh - b.variant.batterySizeKwh
      );
      return toRecommendation(target, meeting[0], baselineAnnualBill, true);
    }

    // No cell hit the target — pick the highest-reduction one available.
    const fallback = cells.reduce((best, c) =>
      c.variant.annualSavings > best.variant.annualSavings ? c : best
    );
    return toRecommendation(target, fallback, baselineAnnualBill, false);
  });
}
