// Orchestration for the Watt Profit ads funnel.
//
// Submit flow (browser):
//   1. Fetch the canonical baseline `SavedReport` for the segment.
//   2. Compute commodity-corrected scale factor from user's annual spend.
//   3. Re-run the engine with the user's scaled hourly consumption to produce
//      a fresh sensitivityAnalysis. The earlier "linearly scale the baseline's
//      pre-computed sensitivity" approach was physically wrong for users whose
//      bill significantly exceeded the baseline's — savings can't grow linearly
//      with load past full self-consumption, so big-bill users saw 3-4× inflated
//      IRR. The re-run produces the right per-cell numbers; the linear path is
//      kept only as a fallback for baselines without hourly consumption.
//   4. Pick three paths via `pickPathsFromSensitivity`.
//   5. POST {lead fields, scaled SavedReport, paths} to /api/leads.
//   6. Return `{reportId}` so the caller can navigate to /report/{seg}/:reportId.

import type { SavedReport } from '../types/savedReports';
import type {
  CalculationResult,
  Grant,
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
import grantsJson from '../data/grants.json';
import { runCalculation } from './calculations';
import { loadSolarData } from './solarDataLoader';
import type { ParsedSolarData } from './solarTimeseriesParser';

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
  /**
   * Result of running the engine on the user's *scaled* hourly consumption
   * with the *baseline's* config (200 kWp + 50 kWh for the hotel baseline).
   * Used when persisting reports for which the detail-pick re-run wasn't
   * possible (no hourly profile on baseline, very rare).
   *
   * Null when we fell back entirely to linear scaling.
   */
  freshBaselineResult: CalculationResult | null;
  /**
   * Result of running the engine for the **detail-pick's exact config** on
   * the user's scaled consumption. This is what `buildPersonalisedReport`
   * persists as the report's `result` — every field (annualSavings, the
   * three-way component breakdown, year1TaxSavings, equityAmount) reflects
   * real physics for the picked system size.
   *
   * Null when no detail-pick was picked (empty sensitivity) or when the
   * baseline lacked an hourly profile.
   */
  freshDetailResult: CalculationResult | null;
  /**
   * The user's scaled hourly consumption. Persisted alongside the report so
   * it can be re-run later via `rebuildResultFromSavedReport` after engine
   * updates. Null on the linear-scaling fallback path.
   */
  scaledHourlyConsumption: number[] | null;
}

/** Default solar loader: fetches the CSV asset by location + year. */
type SolarLoader = (location: string, year: number) => Promise<ParsedSolarData>;

/**
 * Build the engine inputs that a SavedReport implies. Pure mapping — saved
 * fields → static-data lookups → typed parameters. Throws clearly when an
 * input is missing.
 *
 * Used by `rebuildResultFromSavedReport` (the "rerun any saved report from
 * its inputs" entry point) and by the funnel's pre-persistence re-runs.
 */
function extractEngineInputs(saved: SavedReport): {
  tariff: Tariff;
  grants: Grant[];
  hourly: number[];
} {
  const hourly = saved.hourlyConsumptionOverride;
  if (!hourly || hourly.length === 0) {
    throw new Error(
      'SavedReport has no hourlyConsumptionOverride — rerun requires an hourly profile'
    );
  }

  const tariff = findTariff(saved.tariffId);
  if (!tariff) {
    throw new Error(`Tariff ${saved.tariffId} not found in tariffs.json`);
  }

  const allGrants = grantsJson as unknown as Grant[];
  const selectedGrantIds = saved.selectedGrantIds ?? [];
  const grants = allGrants.filter((g) => selectedGrantIds.includes(g.id));

  return { tariff, grants, hourly };
}

/**
 * The migration-friendly entry point: take any persisted SavedReport that has
 * its full inputs (config, financing, tariff id, hourly consumption, selected
 * year/location), load the matching solar CSV, and re-run `runCalculation` to
 * produce a fresh result.
 *
 * This is what the user wants for "I update the calcs, all reports refresh
 * cleanly." Future callers: a one-off prod migration, a "Refresh report"
 * button, server-side regeneration at GET time.
 *
 * `solarLoader` is dependency-injected so tests can stub the network fetch.
 */
export async function rebuildResultFromSavedReport(
  saved: SavedReport,
  solarLoader: SolarLoader = loadSolarData
): Promise<CalculationResult> {
  const { tariff, grants, hourly } = extractEngineInputs(saved);
  const year = saved.selectedYear ?? new Date().getFullYear();
  const solarData = await solarLoader(saved.config.location, year);

  return runCalculation(
    saved.config,
    grants,
    saved.financing,
    tariff,
    saved.trading,
    // historicalSolar / historicalTariffs are unused by the engine.
    {} as never,
    [],
    25,
    undefined,
    solarData,
    undefined,
    hourly
  );
}

/**
 * Re-run the engine with the user's scaled hourly consumption profile.
 * Returns a fresh CalculationResult whose sensitivityAnalysis reflects the
 * physics of the user's actual load — variants don't over-state savings the
 * way linear scaling does.
 *
 * Thin wrapper over `runCalculation`; callers pre-load solar so this stays
 * synchronous and testable.
 */
export function recomputeForScaledConsumption(
  baseline: SavedReport,
  scaleFactor: number,
  solarData: ParsedSolarData
): CalculationResult {
  const { tariff, grants, hourly } = extractEngineInputs(baseline);
  const scaledHourly = hourly.map((k) => k * scaleFactor);

  return runCalculation(
    baseline.config,
    grants,
    baseline.financing,
    tariff,
    baseline.trading,
    {} as never,
    [],
    25,
    undefined,
    solarData,
    undefined,
    scaledHourly
  );
}

/**
 * Run the engine for a specific cell from the sensitivity grid (e.g. the 50%
 * detail-pick). The output is a *real* result for that exact config — no
 * "scale baseline by ratio" approximation — so its component breakdown,
 * tax savings, and equity reflect the picked system size.
 */
function runForDetailPick(
  baseline: SavedReport,
  detailPick: PathRecommendation,
  scaledHourly: number[],
  solarData: ParsedSolarData
): CalculationResult {
  const { tariff, grants } = extractEngineInputs(baseline);

  // Linear: generation scales with kWp.
  const baseKwp = baseline.config.systemSizeKwp ?? 0;
  const scaledAnnualProduction =
    baseKwp > 0
      ? baseline.config.annualProductionKwh * (detailPick.systemSizeKwp / baseKwp)
      : baseline.config.annualProductionKwh;

  const detailConfig = {
    ...baseline.config,
    systemSizeKwp: detailPick.systemSizeKwp,
    batterySizeKwh: detailPick.batterySizeKwh,
    annualProductionKwh: scaledAnnualProduction,
    installationCost: detailPick.capexGross,
  };

  // Avoid showing "overfunded equity" — the baseline's financing.equity is set
  // to its own (much larger) net cost. Clamp it down so the picked system
  // displays sensible numbers; the rest of financing (rate, term, taxRate)
  // carries over unchanged.
  const detailFinancing = {
    ...baseline.financing,
    equity: Math.min(baseline.financing.equity, detailPick.capexNet),
  };

  return runCalculation(
    detailConfig,
    grants,
    detailFinancing,
    tariff,
    baseline.trading,
    {} as never,
    [],
    25,
    undefined,
    solarData,
    undefined,
    scaledHourly
  );
}

/**
 * Pure computation: take a baseline SavedReport + user spend, produce three paths.
 * Exported separately for testing.
 *
 * Async because the re-run path fetches the baseline's solar CSV from the
 * server. Tests can inject `solarLoader` to bypass the network entirely.
 */
export async function computeFunnelPaths(
  baseline: SavedReport,
  userAnnualSpendEur: number,
  solarLoader: SolarLoader = loadSolarData
): Promise<ComputeResult> {
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

  // Re-run the engine on user-scaled consumption. Falls back to linear scaling
  // only when the baseline can't be re-run (no hourly profile). The linear
  // fallback over-states savings 2-4× for users whose bill is much larger
  // than the baseline's, which is why this re-run exists.
  let scaledSensitivity: SensitivityAnalysis;
  let freshBaselineResult: CalculationResult | null = null;
  let scaledHourlyConsumption: number[] | null = null;
  let solarData: ParsedSolarData | null = null;
  if (baseline.hourlyConsumptionOverride && baseline.hourlyConsumptionOverride.length > 0) {
    const year = baseline.selectedYear ?? new Date().getFullYear();
    solarData = await solarLoader(baseline.config.location, year);
    freshBaselineResult = recomputeForScaledConsumption(baseline, scaleFactor, solarData);
    if (!freshBaselineResult.sensitivityAnalysis) {
      throw new Error('Re-run produced no sensitivityAnalysis — engine bug');
    }
    scaledSensitivity = freshBaselineResult.sensitivityAnalysis;
    scaledHourlyConsumption = baseline.hourlyConsumptionOverride.map((k) => k * scaleFactor);
  } else {
    scaledSensitivity = scaleSensitivity(result.sensitivityAnalysis, scaleFactor);
  }

  // Bill scales linearly with the commodity portion only; standing charge stays fixed.
  const scaledBaselineAnnualBill = userCommoditySpend + annualStandingCharge;

  const paths = pickPathsFromSensitivity(scaledSensitivity, scaledBaselineAnnualBill);

  // Second engine run for the detail-pick's exact config, on the same scaled
  // consumption. The output goes straight onto the persisted SavedReport with
  // no further scaling — every displayed number is real physics for that
  // system size, not a "baseline × ratio" approximation.
  let freshDetailResult: CalculationResult | null = null;
  const detailPick = findDefaultDetailPick(paths);
  if (detailPick && solarData && scaledHourlyConsumption) {
    freshDetailResult = runForDetailPick(
      baseline,
      detailPick,
      scaledHourlyConsumption,
      solarData
    );
  }

  return {
    baselineAnnualBill,
    scaledBaselineAnnualBill,
    scaleFactor,
    paths,
    scaledSensitivity,
    freshBaselineResult,
    freshDetailResult,
    scaledHourlyConsumption,
  };
}

/** Pick the path that should drive the persisted report's detail view. */
export function findDefaultDetailPick(
  paths: PathRecommendation[]
): PathRecommendation | null {
  if (paths.length === 0) return null;
  const fifty = paths.find((p) => p.targetReductionPct === 50);
  if (fifty) return fifty;
  return paths.reduce((best, p) =>
    Math.abs(p.actualReductionPct - 50) < Math.abs(best.actualReductionPct - 50) ? p : best
  );
}

/**
 * Build a personalised SavedReport-shaped object to persist alongside the lead.
 *
 * Three sources of truth, in order of preference:
 * 1. **`freshDetailResult`** (default) — `runCalculation` ran with the
 *    detail-pick's exact config + the user's scaled consumption. Every field
 *    is real physics; we copy it verbatim onto the persisted result.
 * 2. **`freshBaselineResult`** — `runCalculation` ran with the *baseline's*
 *    config on user's scaled consumption. Used when no detail-pick exists
 *    (empty sensitivity). Component fields scale by `detailRatio` to project
 *    onto whatever pick was made.
 * 3. **`baseline.result`** — pre-baked baseline result. Linear-scaled by
 *    `scaleFactor`. Only used when the baseline lacks an hourly consumption
 *    profile (legacy baselines). Over-states savings 2-4× for big-bill users.
 *
 * Persists `hourlyConsumptionOverride` (the user's scaled consumption) on the
 * returned SavedReport so future engine updates can re-render the report from
 * inputs alone via `rebuildResultFromSavedReport`.
 */
export function buildPersonalisedReport(
  baseline: SavedReport,
  scaleFactor: number,
  scaledSensitivity: SensitivityAnalysis,
  scaledBaselineAnnualBill: number,
  paths: PathRecommendation[] = [],
  freshBaselineResult: CalculationResult | null = null,
  freshDetailResult: CalculationResult | null = null,
  scaledHourlyConsumption: number[] | null = null
): SavedReport {
  const scaledMonthly = baseline.curvedMonthlyKwh.map((k) => k * scaleFactor);
  const scaledBills = baseline.estimatedMonthlyBills.map((b) => b * scaleFactor);
  const detailPick = findDefaultDetailPick(paths);

  let scaledResult: CalculationResult | undefined;

  if (freshDetailResult) {
    // Path 1 — pure input-driven. Every field on the persisted result was
    // computed by the engine for the detail-pick's exact config. Just trim
    // audit.hourly for size; everything else gets persisted verbatim with
    // the scaled sensitivity grid swapped in.
    scaledResult = {
      ...freshDetailResult,
      sensitivityAnalysis: scaledSensitivity,
      audit: freshDetailResult.audit
        ? {
            ...freshDetailResult.audit,
            hourly: [],
          }
        : undefined,
    };
  } else {
    // Paths 2 and 3 — fall back to the older "scale baseline by ratio"
    // approximation. Only reached for baselines without an hourly profile.
    const sourceResult = freshBaselineResult ?? (baseline.result as CalculationResult | undefined);
    const componentScaleFactor = freshBaselineResult ? 1 : scaleFactor;
    const sourceScaledAnnualSavings =
      (sourceResult?.annualSavings ?? 0) * componentScaleFactor;
    const detailRatio =
      detailPick && sourceScaledAnnualSavings > 0
        ? detailPick.annualSavings / sourceScaledAnnualSavings
        : 1;

    scaledResult = sourceResult
      ? {
          ...sourceResult,
          annualGeneration: sourceResult.annualGeneration,
          annualSavings: detailPick
            ? detailPick.annualSavings
            : sourceResult.annualSavings * componentScaleFactor,
          annualSolarToLoadSavings:
            (sourceResult.annualSolarToLoadSavings ?? 0) * componentScaleFactor * detailRatio,
          annualBatteryToLoadSavings:
            (sourceResult.annualBatteryToLoadSavings ?? 0) * componentScaleFactor * detailRatio,
          annualExportRevenue:
            (sourceResult.annualExportRevenue ?? 0) * componentScaleFactor * detailRatio,
          systemCost: detailPick ? detailPick.capexGross : sourceResult.systemCost,
          netCost: detailPick ? detailPick.capexNet : sourceResult.netCost,
          simplePayback: detailPick
            ? detailPick.simplePaybackYears
            : sourceResult.simplePayback,
          sensitivityAnalysis: scaledSensitivity,
          audit: sourceResult.audit
            ? {
                ...sourceResult.audit,
                hourly: [],
                monthly: sourceResult.audit.monthly.map((m) => ({
                  ...m,
                  consumption: m.consumption * componentScaleFactor,
                  baselineCost: (m.baselineCost ?? 0) * componentScaleFactor,
                  savings: (m.savings ?? 0) * componentScaleFactor * detailRatio,
                  exportRevenue: (m.exportRevenue ?? 0) * componentScaleFactor * detailRatio,
                  importCost: (m.importCost ?? 0) * componentScaleFactor * detailRatio,
                })),
              }
            : undefined,
        }
      : undefined;
  }

  // Override config to reflect the detail pick. The clarifier banner in
  // ResultsSection reads config.systemSizeKwp / batterySizeKwh, so this
  // makes the banner copy match the highlighted card. The engine inputs we
  // persist (annualProductionKwh, installationCost) are also patched so a
  // future re-run via rebuildResultFromSavedReport produces detail-pick
  // numbers, not baseline ones.
  const scaledConfig = baseline.config && detailPick
    ? {
        ...baseline.config,
        systemSizeKwp: detailPick.systemSizeKwp,
        batterySizeKwh: detailPick.batterySizeKwh,
        annualProductionKwh:
          baseline.config.systemSizeKwp && baseline.config.systemSizeKwp > 0
            ? baseline.config.annualProductionKwh *
              (detailPick.systemSizeKwp / baseline.config.systemSizeKwp)
            : baseline.config.annualProductionKwh,
        installationCost: detailPick.capexGross,
      }
    : baseline.config;

  // Persist the user's scaled financing too, so the equity field on the
  // saved report matches what the engine actually used (avoids the
  // "overfunded equity" display).
  const scaledFinancing = detailPick
    ? {
        ...baseline.financing,
        equity: Math.min(baseline.financing.equity, detailPick.capexNet),
      }
    : baseline.financing;

  // Round to 4 decimal places (0.1 Wh, far below any meter resolution) to
  // strip the float-noise digits introduced by scaling — keeps the persisted
  // payload compact without losing meaningful precision.
  const persistedHourly = scaledHourlyConsumption
    ? scaledHourlyConsumption.map((k) => Math.round(k * 10000) / 10000)
    : baseline.hourlyConsumptionOverride;

  return {
    ...baseline,
    config: scaledConfig,
    financing: scaledFinancing,
    curvedMonthlyKwh: scaledMonthly,
    // Persist the user's scaled hourly consumption so the report can be
    // re-rendered later via rebuildResultFromSavedReport after engine updates.
    hourlyConsumptionOverride: persistedHourly,
    estimatedMonthlyBills: scaledBills,
    result: scaledResult,
    name: `funnel-${baseline.config?.businessType ?? 'segment'}-${Math.round(scaledBaselineAnnualBill)}`,
    id: '',
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
      const {
        paths: p,
        scaledSensitivity,
        scaleFactor,
        scaledBaselineAnnualBill,
        freshBaselineResult,
        freshDetailResult,
        scaledHourlyConsumption,
      } = await computeFunnelPaths(baseline, fields.annualSpendEur);
      scaledReport = buildPersonalisedReport(
        baseline,
        scaleFactor,
        scaledSensitivity,
        scaledBaselineAnnualBill,
        p,
        freshBaselineResult,
        freshDetailResult,
        scaledHourlyConsumption
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
