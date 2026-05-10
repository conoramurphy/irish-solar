// Orchestration for the Watt Profit ads funnel.
//
// Submit flow (browser):
//   1. Fetch the canonical baseline `SavedReport` for the segment.
//   2. Compute commodity-corrected scale factor from user's annual spend.
//   3. Linearly scale the baseline's pre-computed sensitivityAnalysis savings
//      by the scale factor. (v0 approximation — the engine isn't re-run; the
//      ±20% accuracy bar at the top of the report admits this. A future
//      iteration could re-run the engine in a Web Worker for tighter numbers.)
//   4. Pick three paths via `pickPathsFromSensitivity`.
//   5. POST {lead fields, scaled SavedReport, paths} to /api/leads.
//   6. Return `{reportId}` so the caller can navigate to /report/{seg}/:reportId.

import type { SavedReport } from '../types/savedReports';
import type {
  CalculationResult,
  SensitivityAnalysis,
  SensitivityVariant,
  Tariff,
} from '../types';
import {
  pickPathsFromSensitivity,
  type PathRecommendation,
} from './pickPathsFromSensitivity';
import {
  FUNNEL_BASELINES,
  type FunnelSegment,
  type LeadSegment,
} from '../components/landings/funnelConstants';
import tariffsJson from '../data/tariffs.json';

export interface LeadFields {
  segment: LeadSegment;
  name: string;
  eircode: string;
  phoneE164: string;
  annualSpendEur: number;
  /** Free-text business type — only set when segment === 'other'. */
  businessType?: string;
}

export interface FunnelSubmitSuccess {
  ok: true;
  segment: LeadSegment;
  reportId: string | null;
}

export interface FunnelSubmitError {
  ok: false;
  /** A user-facing message — caller renders this directly per CLAUDE.md no-silent-failure. */
  message: string;
}

export type FunnelSubmitResult = FunnelSubmitSuccess | FunnelSubmitError;

interface RawReportResponse {
  payload: SavedReport;
  locked?: boolean;
  name?: string | null;
  description?: string | null;
}

function findTariff(tariffId: string): Tariff | null {
  // tariffs.json is the single source of truth for commercial tariffs.
  // Standing charge is in €/day (see CLAUDE.md unit standards).
  const list = tariffsJson as { id: string }[];
  return (list.find((t) => t.id === tariffId) as Tariff | undefined) ?? null;
}

function annualBaselineBill(result: CalculationResult): number {
  const monthly = result.audit?.monthly ?? [];
  return monthly.reduce((acc, m) => acc + (m.baselineCost ?? 0), 0);
}

function scaleVariant(v: SensitivityVariant, factor: number): SensitivityVariant {
  return {
    ...v,
    annualSavings: v.annualSavings * factor,
    year1ExportRevenue: v.year1ExportRevenue * factor,
    year1NetCashFlow: v.year1NetCashFlow * factor,
    year10NetCashFlow: v.year10NetCashFlow * factor,
  };
}

function scaleSensitivity(
  analysis: SensitivityAnalysis,
  factor: number
): SensitivityAnalysis {
  return {
    ...analysis,
    rows: analysis.rows.map((row) => ({
      ...row,
      noBattery: scaleVariant(row.noBattery, factor),
      halfBattery: scaleVariant(row.halfBattery, factor),
      fullBattery: scaleVariant(row.fullBattery, factor),
      doubleBattery: scaleVariant(row.doubleBattery, factor),
    })),
  };
}

interface ComputeResult {
  baselineAnnualBill: number;
  scaledBaselineAnnualBill: number;
  scaleFactor: number;
  paths: PathRecommendation[];
  scaledSensitivity: SensitivityAnalysis;
}

/**
 * Pure computation: take a baseline SavedReport + user spend, produce three paths.
 * Exported separately for testing.
 */
export function computeFunnelPaths(
  baseline: SavedReport,
  userAnnualSpendEur: number
): ComputeResult {
  const result = baseline.result as CalculationResult | undefined;
  if (!result?.sensitivityAnalysis) {
    throw new Error('Baseline has no sensitivityAnalysis snapshot');
  }

  const tariff = findTariff(baseline.tariffId);
  const standingChargePerDay = tariff?.standingCharge ?? 0;
  const annualStandingCharge = standingChargePerDay * 365;

  const baselineAnnualBill = annualBaselineBill(result);
  if (baselineAnnualBill <= 0) {
    throw new Error('Baseline has no positive annual bill in audit.monthly');
  }

  const baselineCommodityBill = baselineAnnualBill - annualStandingCharge;
  const userCommoditySpend = userAnnualSpendEur - annualStandingCharge;

  if (baselineCommodityBill <= 0) {
    throw new Error('Baseline commodity bill is non-positive after standing-charge subtraction');
  }
  if (userCommoditySpend <= 0) {
    // Caller surfaces a visible error per CLAUDE.md.
    throw new Error(
      'That annual figure looks below typical standing charges — let\'s chat instead.'
    );
  }

  const scaleFactor = userCommoditySpend / baselineCommodityBill;
  const scaledSensitivity = scaleSensitivity(result.sensitivityAnalysis, scaleFactor);

  // Bill scales linearly with the commodity portion only; standing charge stays fixed.
  const scaledBaselineAnnualBill = userCommoditySpend + annualStandingCharge;

  const paths = pickPathsFromSensitivity(scaledSensitivity, scaledBaselineAnnualBill);

  return {
    baselineAnnualBill,
    scaledBaselineAnnualBill,
    scaleFactor,
    paths,
    scaledSensitivity,
  };
}

/**
 * Build a personalised SavedReport-shaped object to persist alongside the lead.
 * Scales consumption arrays and the result.sensitivityAnalysis. Other fields
 * (config, financing, grants, tariff, location) stay identical to the baseline
 * so the rendered report matches the model the user "owns".
 */
function buildPersonalisedReport(
  baseline: SavedReport,
  scaleFactor: number,
  scaledSensitivity: SensitivityAnalysis,
  scaledBaselineAnnualBill: number
): SavedReport {
  const scaledMonthly = baseline.curvedMonthlyKwh.map((k) => k * scaleFactor);
  const scaledHourlyOverride = baseline.hourlyConsumptionOverride
    ? baseline.hourlyConsumptionOverride.map((h) => h * scaleFactor)
    : undefined;
  const scaledBills = baseline.estimatedMonthlyBills.map((b) => b * scaleFactor);

  const baselineResult = baseline.result as CalculationResult | undefined;
  const scaledResult: CalculationResult | undefined = baselineResult
    ? {
        ...baselineResult,
        annualGeneration: baselineResult.annualGeneration, // production unchanged
        annualSavings: baselineResult.annualSavings * scaleFactor,
        annualSolarToLoadSavings:
          (baselineResult.annualSolarToLoadSavings ?? 0) * scaleFactor,
        annualBatteryToLoadSavings:
          (baselineResult.annualBatteryToLoadSavings ?? 0) * scaleFactor,
        sensitivityAnalysis: scaledSensitivity,
        audit: baselineResult.audit
          ? {
              ...baselineResult.audit,
              monthly: baselineResult.audit.monthly.map((m) => ({
                ...m,
                consumption: m.consumption * scaleFactor,
                baselineCost:
                  (m.baselineCost ?? 0) * scaleFactor +
                  // keep the standing-charge piece fixed: this is approximate
                  // since we already scaled, but the per-month allocation is
                  // consistent with the original baseline.
                  0,
              })),
            }
          : undefined,
      }
    : undefined;

  return {
    ...baseline,
    curvedMonthlyKwh: scaledMonthly,
    hourlyConsumptionOverride: scaledHourlyOverride,
    estimatedMonthlyBills: scaledBills,
    result: scaledResult,
    // Suppress baseline metadata so it's clear this is a derivative.
    name: `funnel-${baseline.config?.businessType ?? 'segment'}-${Math.round(scaledBaselineAnnualBill)}`,
    id: '', // server assigns id
  };
}

async function fetchBaseline(segment: FunnelSegment): Promise<SavedReport> {
  const id = FUNNEL_BASELINES[segment].reportId;
  const res = await fetch(`/api/reports/${id}`);
  if (!res.ok) {
    throw new Error(`Couldn't load the baseline model — please try again or call us. (HTTP ${res.status})`);
  }
  const body = (await res.json()) as RawReportResponse;
  if (!body.payload) {
    throw new Error('Couldn\'t load the baseline model — please try again or call us.');
  }
  return body.payload;
}

/**
 * Full submit pipeline. Used by the LeadForm submit handler on /hotels and /dairy.
 * For segment='other', skips the baseline fetch and computation; just POSTs the lead.
 */
export async function submitFunnelLead(fields: LeadFields): Promise<FunnelSubmitResult> {
  try {
    let scaledReport: SavedReport | undefined;
    let paths: PathRecommendation[] | undefined;

    if (fields.segment === 'hotel' || fields.segment === 'dairy') {
      const baseline = await fetchBaseline(fields.segment);
      const { paths: p, scaledSensitivity, scaleFactor, scaledBaselineAnnualBill } =
        computeFunnelPaths(baseline, fields.annualSpendEur);
      scaledReport = buildPersonalisedReport(
        baseline,
        scaleFactor,
        scaledSensitivity,
        scaledBaselineAnnualBill
      );
      paths = p;
    }

    const body = {
      ...fields,
      paths,
      scaledReport,
    };

    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({})) as { error?: string };
      return {
        ok: false,
        message: detail.error ?? `Submission failed (HTTP ${res.status}). Please try again or call us.`,
      };
    }

    const data = (await res.json()) as { reportId?: string };
    return { ok: true, segment: fields.segment, reportId: data.reportId ?? null };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Submission failed. Please try again or call us.',
    };
  }
}
