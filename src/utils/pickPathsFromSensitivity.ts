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

const REDUCTION_EPSILON_PCT = 0.5;

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

function reductionPct(cell: FlatCell, baselineAnnualBill: number): number {
  return (cell.variant.annualSavings / baselineAnnualBill) * 100;
}

function lowestCost(cells: FlatCell[]): FlatCell {
  // Caller guarantees non-empty. Tiebreak: smaller battery (cleaner install).
  return [...cells].sort(
    (a, b) =>
      a.variant.netCost - b.variant.netCost ||
      a.variant.batterySizeKwh - b.variant.batterySizeKwh
  )[0];
}

/**
 * Pick recommendations from an existing sensitivity sweep with two rules:
 *
 *   1. **Lowest net CapEx** at or above each reduction target (33%, 50%, 100%).
 *      Battery presence is incidental — a battery-bearing cell only wins when
 *      it is the cheapest way to hit the target.
 *
 *   2. **Strictly-increasing reduction** across picks. The 50% pick must have
 *      strictly more reduction than the 33% pick (else the cards would
 *      duplicate, since the sensitivity sweep is coarse — 8 scale factors —
 *      and the cheapest cell meeting 33% often also meets 50% at the same
 *      reduction). If no cell satisfies both "meets target" and "more reduction
 *      than previous," fall back to "more reduction than previous" alone and
 *      mark `targetMet=false`. If no cell has more reduction at all (the
 *      previous pick was already the max), **drop the card** — return fewer
 *      than `targets.length` items.
 *
 * So the output length is anywhere from 0 (empty sweep) to `targets.length`
 * (typically 3). Caller renders a responsive grid based on the actual count.
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

  const picks: PathRecommendation[] = [];
  let previousReductionPct = -Infinity;

  for (const target of targets) {
    const moreReduction = cells.filter(
      (c) => reductionPct(c, baselineAnnualBill) > previousReductionPct + REDUCTION_EPSILON_PCT
    );

    if (moreReduction.length === 0) {
      // No cell improves on the previous pick — drop this card.
      continue;
    }

    const meetingTarget = moreReduction.filter(
      (c) => reductionPct(c, baselineAnnualBill) >= target
    );

    let pick: FlatCell;
    let targetMet: boolean;
    if (meetingTarget.length > 0) {
      pick = lowestCost(meetingTarget);
      targetMet = true;
    } else {
      // Target unreachable but we can still show meaningfully more reduction
      // than the previous pick — surface honestly via targetMet=false.
      pick = lowestCost(moreReduction);
      targetMet = false;
    }

    picks.push(toRecommendation(target, pick, baselineAnnualBill, targetMet));
    previousReductionPct = pick.variant.annualSavings / baselineAnnualBill * 100;
  }

  return picks;
}
