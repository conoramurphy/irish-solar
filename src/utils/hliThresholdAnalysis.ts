/**
 * HLI threshold analysis — generates data for the special report.
 *
 * Sweeps HLI from 0.8 to 3.5 and computes HP performance metrics at each point.
 * Also analyses what insulation measures are needed to cross the 2.0 threshold
 * from various starting points, and their costs.
 */

import { generateHeatPumpProfile, estimateSCOP } from './heatPumpModel';
import { calculateDirectHpBill } from './heatPumpBilling';
import { runCalculation } from './calculations';
import { estimateFuelBaseline } from './heatPumpScenarios';
import type { ParsedSolarData } from './solarTimeseriesParser';
import {
  INSULATION_MEASURES,
  type InsulationMeasure,
  type InsulationMeasureData,
  applyInsulationMeasures,
} from '../data/heatPumpArchetypes';
import type { Tariff } from '../types';

// ---------------------------------------------------------------------------
// HLI sweep
// ---------------------------------------------------------------------------

export interface HliSweepPoint {
  hli: number;
  scop: number;
  annualHpElecKwh: number;
  annualHpBillEur: number;
  annualGasBillEur: number;
  annualSavingEur: number;
  /** 10-year net saving WITH grant (€6,500 if HLI ≤ 2.0) */
  tenYearNetWithGrant: number;
  /** 10-year net saving WITHOUT grant */
  tenYearNetNoGrant: number;
  grantEur: number;
}

const GRANT_THRESHOLD = 2.0;
const GRANT_AMOUNT = 6500; // HP unit grant only (excluding central heating component)
const HP_GROSS_COST = 14000;

export function sweepHli(
  tariff: Tariff,
  floorAreaM2 = 108,
  fuelType: 'gas' | 'oil' = 'gas',
  dhwSchedule: 'draw-time' | 'night-boost' = 'draw-time',
): HliSweepPoint[] {
  const points: HliSweepPoint[] = [];

  for (let hli = 0.8; hli <= 3.51; hli += 0.1) {
    const roundedHli = Math.round(hli * 10) / 10;

    const profile = generateHeatPumpProfile({
      archetypeId: '1980s_semi',
      hliOverride: roundedHli,
      floorAreaM2,
      insulation: [],
      installQuality: 'good',
      location: 'Dublin',
      year: 2025,
      dhwSchedule,
    });

    const scop = estimateSCOP({
      archetypeId: '1980s_semi',
      hliOverride: roundedHli,
      floorAreaM2,
      insulation: [],
      installQuality: 'good',
      location: 'Dublin',
      year: 2025,
      dhwSchedule,
    });

    const bill = calculateDirectHpBill(profile, tariff);
    const gasBaseline = estimateFuelBaseline('1980s_semi', fuelType, floorAreaM2, roundedHli);
    const totalGasBaseline = gasBaseline.annualBillEur + gasBaseline.standingChargeEur;
    const annualSaving = totalGasBaseline - bill.annualBillEur;

    const grantEur = roundedHli <= GRANT_THRESHOLD ? GRANT_AMOUNT : 0;

    points.push({
      hli: roundedHli,
      scop,
      annualHpElecKwh: bill.annualHpElecKwh,
      annualHpBillEur: bill.annualBillEur,
      annualGasBillEur: totalGasBaseline,
      annualSavingEur: annualSaving,
      tenYearNetWithGrant: annualSaving * 10 - (HP_GROSS_COST - grantEur),
      tenYearNetNoGrant: annualSaving * 10 - HP_GROSS_COST,
      grantEur,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Threshold crossing analysis
// ---------------------------------------------------------------------------

export interface ThresholdCrossingResult {
  startingHli: number;
  targetHli: number;
  /** Cheapest combination of measures to reach target, sorted by cost */
  cheapestPath: {
    measures: InsulationMeasure[];
    labels: string[];
    totalCost: number;
    hliAfter: number;
    reachesTarget: boolean;
  };
  /** All individual measures and whether each alone reaches the target */
  individualMeasures: Array<{
    measure: InsulationMeasure;
    label: string;
    cost: number;
    hliDelta: number;
    hliAfter: number;
    reachesTarget: boolean;
  }>;
  /** Can you reach the target with measures costing ≤ €2,000 total? */
  achievableCheaply: boolean;
  /** Cheapest cost to reach target */
  cheapestCostToTarget: number | null;
}

/**
 * For a given starting HLI, find what measures are needed to reach the target (2.0).
 * Tries all combinations from cheapest to most expensive.
 */
export function analyseThresholdCrossing(
  startingHli: number,
  targetHli = GRANT_THRESHOLD,
  hasCavity = true,
): ThresholdCrossingResult {
  // All applicable measures sorted by cost-effectiveness (hliDelta / cost)
  const applicable: Array<{ id: InsulationMeasure; data: InsulationMeasureData }> = [];
  for (const [id, data] of Object.entries(INSULATION_MEASURES)) {
    if (data.requiresCavity && !hasCavity) continue;
    applicable.push({ id: id as InsulationMeasure, data });
  }

  // Individual measures
  const individualMeasures = applicable.map(({ id, data }) => ({
    measure: id,
    label: data.label,
    cost: data.netCostEur,
    hliDelta: data.hliDelta,
    hliAfter: Math.max(0.3, startingHli - data.hliDelta),
    reachesTarget: (startingHli - data.hliDelta) <= targetHli,
  }));

  // Find cheapest combination that reaches target
  // Greedy: sort by cost, add measures until target reached
  const sortedByCost = [...applicable].sort((a, b) => a.data.netCostEur - b.data.netCostEur);

  let bestPath: ThresholdCrossingResult['cheapestPath'] | null = null;

  // Try adding measures greedily by cost
  const measures: InsulationMeasure[] = [];
  const labels: string[] = [];
  let totalCost = 0;
  let currentHli = startingHli;

  for (const { id, data } of sortedByCost) {
    if (currentHli <= targetHli) break;
    measures.push(id);
    labels.push(data.label);
    totalCost += data.netCostEur;
    currentHli = applyInsulationMeasures(startingHli, measures, hasCavity);
  }

  bestPath = {
    measures,
    labels,
    totalCost,
    hliAfter: currentHli,
    reachesTarget: currentHli <= targetHli,
  };

  // Also try by cost-effectiveness (hliDelta/cost, descending)
  const sortedByEffectiveness = [...applicable].sort(
    (a, b) => (b.data.hliDelta / b.data.netCostEur) - (a.data.hliDelta / a.data.netCostEur),
  );

  const effMeasures: InsulationMeasure[] = [];
  const effLabels: string[] = [];
  let effCost = 0;
  let effHli = startingHli;

  for (const { id, data } of sortedByEffectiveness) {
    if (effHli <= targetHli) break;
    effMeasures.push(id);
    effLabels.push(data.label);
    effCost += data.netCostEur;
    effHli = applyInsulationMeasures(startingHli, effMeasures, hasCavity);
  }

  if (effHli <= targetHli && (effCost < bestPath.totalCost || !bestPath.reachesTarget)) {
    bestPath = {
      measures: effMeasures,
      labels: effLabels,
      totalCost: effCost,
      hliAfter: effHli,
      reachesTarget: true,
    };
  }

  return {
    startingHli,
    targetHli,
    cheapestPath: bestPath,
    individualMeasures,
    achievableCheaply: bestPath.reachesTarget && bestPath.totalCost <= 2000,
    cheapestCostToTarget: bestPath.reachesTarget ? bestPath.totalCost : null,
  };
}

// ---------------------------------------------------------------------------
// Path comparison: Pragmatic (C3 + solar + good HP) vs Deep Retrofit (A + HP)
// ---------------------------------------------------------------------------

export interface PathCostLine {
  label: string;
  grossEur: number;
  grantEur: number;
  netEur: number;
  workerHours: number;
}

export interface PathComparison {
  id: string;
  label: string;
  subtitle: string;
  hliAfter: number;
  berRating: string;
  lines: PathCostLine[];
  totalGross: number;
  totalGrant: number;
  totalNet: number;
  totalWorkerHours: number;
  /** Annual electricity bill after solar self-consumption + export (€) */
  annualBillEur: number;
  annualGasBillEur: number;
  annualSavingEur: number;
  /** Solar self-consumption (kWh/yr) — 0 for non-solar paths */
  selfConsumptionKwh: number;
  /** Solar export revenue (€/yr) — 0 for non-solar paths */
  exportRevenueEur: number;
  scop: number;
  /** Annual base house electricity (kWh, excl HP) included in bill */
  baseLoadKwh: number;
}

// Base house electricity (excl. heating): ~4,000 kWh/yr for a 108m² semi
// Shaped: slightly higher in morning (06-09) and evening (17-22), lower overnight
const BASE_LOAD_KWH_PER_YEAR = 4000;

/**
 * Generate a half-hourly base-load profile (lights, cooking, appliances — excl. heating).
 * Simple shape: 60% of daily load in 06:00–22:00 (slots 12–43), 40% overnight.
 */
export function generateBaseLoadProfile(totalSlots: number): number[] {
  const profile = new Array(totalSlots).fill(0);
  const dailyKwh = BASE_LOAD_KWH_PER_YEAR / 365;
  for (let slot = 0; slot < totalSlots; slot++) {
    const halfHour = slot % 48;
    // Simple shape: 60% of daily load in 06:00-22:00 (slots 12-43), 40% overnight
    const isDay = halfHour >= 12 && halfHour <= 43;
    const daySlots = 32;
    const nightSlots = 16;
    const share = isDay ? (0.6 / daySlots) : (0.4 / nightSlots);
    profile[slot] = dailyKwh * share;
  }
  return profile;
}

/**
 * Compare two retrofit paths for a typical 1980s semi (HLI 2.5, 108m²).
 * Both paths run through the SAME billing engine:
 * - Solar path: runCalculation() with real irradiance data → self-consumption + export
 * - Non-solar path: calculateDirectHpBill() slot-by-slot tariff billing
 *
 * Requires solarData for the solar path. If null, solar path uses HP-only bill.
 */
export function compareRetrofitPaths(
  tariff: import('../types').Tariff,
  solarData: ParsedSolarData | null,
  floorAreaM2 = 108,
  startingHli = 2.5,
): PathComparison[] {

  const baseGas = estimateFuelBaseline('1980s_semi', 'gas', floorAreaM2, startingHli);
  const totalGasBaseline = baseGas.annualBillEur + baseGas.standingChargeEur;

  const SOLAR_KWP = 8;
  // Standard Dublin yield estimate — same approach as the main wizard.
  // The solar CSV provides the hourly shape (irradiance weights), not the absolute yield.
  // 950 kWh/kWp is the accepted figure for an 8 kWp system in Dublin (south-facing, ~35° tilt).
  const SOLAR_YIELD_KWH_PER_KWP = 950;

  // --- Path A: Pragmatic (C3 + solar + good HP) ---
  const pragmaticInsulation: InsulationMeasure[] = ['attic', 'cavity', 'airSealing'];
  const pragmaticHli = applyInsulationMeasures(startingHli, pragmaticInsulation, true);

  const pragmaticLines: PathCostLine[] = [
    { label: 'Heat pump (unit + install)',       grossEur: 14000, grantEur: 12500, netEur: 1500,  workerHours: 64 },
    { label: 'Good install (survey + radiators)', grossEur: 7000,  grantEur: 2000,  netEur: 5000,  workerHours: 40 },
    { label: 'Attic insulation',                  grossEur: 2300,  grantEur: 1500,  netEur: 800,   workerHours: 16 },
    { label: 'Cavity wall fill',                  grossEur: 1700,  grantEur: 1300,  netEur: 400,   workerHours: 16 },
    { label: 'Air sealing',                       grossEur: 450,   grantEur: 0,     netEur: 450,   workerHours: 24 },
    { label: 'Solar + battery (8 kWp + 10 kWh)',  grossEur: 8500,  grantEur: 1800,  netEur: 6700,  workerHours: 40 },
  ];

  const pragmaticProfileParams = {
    archetypeId: '1980s_semi', hliOverride: pragmaticHli, floorAreaM2,
    insulation: pragmaticInsulation, installQuality: 'good' as const,
    location: 'Dublin', year: 2025,
  };
  const pragmaticProfile = generateHeatPumpProfile(pragmaticProfileParams);
  const pragmaticScop = estimateSCOP(pragmaticProfileParams);

  // Merge HP profile with base house load (lights, cooking, appliances)
  const pragmaticBaseLoad = generateBaseLoadProfile(pragmaticProfile.length);
  const pragmaticTotalConsumption = pragmaticProfile.map((hp, i) => hp + pragmaticBaseLoad[i]);

  // Run solar path through the REAL simulation engine
  let pragmaticBillEur: number;
  let pragmaticSelfConsumption = 0;
  let pragmaticExportRevenue = 0;

  if (solarData) {
    const noSolarBill = calculateDirectHpBill(pragmaticTotalConsumption, tariff);
    const solarResult = runCalculation(
      {
        annualProductionKwh: SOLAR_KWP * SOLAR_YIELD_KWH_PER_KWP,
        systemSizeKwp: SOLAR_KWP,
        batterySizeKwh: 0,
        installationCost: 0,
        location: solarData.location ?? 'Dublin',
        businessType: 'house',
      },
      [],
      { equity: 0, interestRate: 0, termYears: 0 },
      tariff,
      { enabled: false },
      {},
      [],
      1,
      undefined,
      solarData,
      undefined,
      pragmaticTotalConsumption,
    );
    pragmaticBillEur = Math.max(0, noSolarBill.annualBillEur - solarResult.annualSavings);
    pragmaticSelfConsumption = solarResult.annualSelfConsumption;
    pragmaticExportRevenue = solarResult.annualExportRevenue ?? 0;
  } else {
    const bill = calculateDirectHpBill(pragmaticTotalConsumption, tariff);
    pragmaticBillEur = bill.annualBillEur;
  }

  // --- Path B: Deep Retrofit (A rating, no solar) ---
  const deepInsulation: InsulationMeasure[] = ['attic', 'cavity', 'airSealing', 'ewi', 'windows', 'doors', 'floor'];
  const deepHli = applyInsulationMeasures(startingHli, deepInsulation, true);

  const deepLines: PathCostLine[] = [
    { label: 'Heat pump (unit + install)',       grossEur: 14000, grantEur: 12500, netEur: 1500,  workerHours: 64 },
    { label: 'Attic insulation',                  grossEur: 2300,  grantEur: 1500,  netEur: 800,   workerHours: 16 },
    { label: 'Cavity wall fill',                  grossEur: 1700,  grantEur: 1300,  netEur: 400,   workerHours: 16 },
    { label: 'Air sealing',                       grossEur: 450,   grantEur: 0,     netEur: 450,   workerHours: 24 },
    { label: 'External wall insulation',           grossEur: 20000, grantEur: 6000,  netEur: 14000, workerHours: 480 },
    { label: 'Windows (triple glazing)',          grossEur: 8000,  grantEur: 3000,  netEur: 5000,  workerHours: 40 },
    { label: 'Front & back doors',                grossEur: 4000,  grantEur: 1600,  netEur: 2400,  workerHours: 16 },
    { label: 'Floor insulation',                  grossEur: 3000,  grantEur: 1500,  netEur: 1500,  workerHours: 40 },
  ];

  // With HLI ~0.3-0.5 after full insulation, standard radiators work fine
  // at low flow temps — no radiator upgrades needed
  const deepProfileParams = {
    archetypeId: '1980s_semi', hliOverride: deepHli, floorAreaM2,
    insulation: deepInsulation, installQuality: 'good' as const,
    location: 'Dublin', year: 2025,
  };
  const deepProfile = generateHeatPumpProfile(deepProfileParams);
  // Merge HP profile with base house load (same base load as pragmatic path)
  const deepBaseLoad = generateBaseLoadProfile(deepProfile.length);
  const deepTotalConsumption = deepProfile.map((hp, i) => hp + deepBaseLoad[i]);
  // No solar — straight tariff billing, slot by slot
  const deepBill = calculateDirectHpBill(deepTotalConsumption, tariff);
  const deepScop = estimateSCOP(deepProfileParams);

  function buildPath(
    id: string, label: string, subtitle: string, ber: string,
    hli: number, lines: PathCostLine[],
    annualBill: number, selfConsumptionKwh: number, exportRevenueEur: number,
    scop: number,
  ): PathComparison {
    const totalGross = lines.reduce((s, l) => s + l.grossEur, 0);
    const totalGrant = lines.reduce((s, l) => s + l.grantEur, 0);
    const totalNet = lines.reduce((s, l) => s + l.netEur, 0);
    const totalWorkerHours = lines.reduce((s, l) => s + l.workerHours, 0);
    return {
      id, label, subtitle, hliAfter: hli, berRating: ber, lines,
      totalGross, totalGrant, totalNet, totalWorkerHours,
      annualBillEur: annualBill,
      annualGasBillEur: totalGasBaseline,
      annualSavingEur: totalGasBaseline - annualBill,
      selfConsumptionKwh,
      exportRevenueEur,
      scop,
      baseLoadKwh: BASE_LOAD_KWH_PER_YEAR,
    };
  }

  return [
    buildPath('pragmatic', 'Pragmatic', 'Basic insulation + 8 kWp solar + good HP', 'C3',
      pragmaticHli, pragmaticLines, pragmaticBillEur, pragmaticSelfConsumption, pragmaticExportRevenue, pragmaticScop),
    buildPath('deep_retrofit', 'Deep Retrofit', 'Full insulation to A rating + standard HP, no solar', 'A2–A3',
      deepHli, deepLines, deepBill.annualBillEur, 0, 0, deepScop),
  ];
}

// ---------------------------------------------------------------------------
// Policy alternatives
// ---------------------------------------------------------------------------

export interface PolicyScenario {
  id: string;
  label: string;
  getGrant: (hli: number) => number;
}

export const POLICY_SCENARIOS: PolicyScenario[] = [
  {
    id: 'status_quo',
    label: 'Status quo (cliff at 2.0)',
    getGrant: (hli) => hli <= 2.0 ? 6500 : 0,
  },
  {
    id: 'sliding_scale',
    label: 'Sliding scale (€6,500 at 1.0 → €0 at 3.0)',
    getGrant: (hli) => hli <= 1.0 ? 6500 : hli >= 3.0 ? 0 : Math.round(6500 * (3.0 - hli) / 2.0),
  },
  {
    id: 'higher_threshold',
    label: 'Threshold at 2.5',
    getGrant: (hli) => hli <= 2.5 ? 6500 : 0,
  },
  {
    id: 'universal',
    label: 'Universal €4,000',
    getGrant: () => 4000,
  },
];

export interface PolicyComparisonPoint {
  hli: number;
  annualSavingEur: number;
  policies: Array<{
    policyId: string;
    grantEur: number;
    tenYearNetEur: number;
  }>;
}

export function comparePolicies(sweepData: HliSweepPoint[]): PolicyComparisonPoint[] {
  return sweepData.map((point) => ({
    hli: point.hli,
    annualSavingEur: point.annualSavingEur,
    policies: POLICY_SCENARIOS.map((policy) => {
      const grant = policy.getGrant(point.hli);
      return {
        policyId: policy.id,
        grantEur: grant,
        tenYearNetEur: point.annualSavingEur * 10 - (HP_GROSS_COST - grant),
      };
    }),
  }));
}
