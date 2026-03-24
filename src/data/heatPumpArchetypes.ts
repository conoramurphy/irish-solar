/**
 * Irish house archetypes for heat pump modelling.
 *
 * Based on TABULA Ireland building typology (EPISCOPE project / Energy Action Ltd)
 * and SEAI BER database statistics.
 *
 * HLI = Heat Loss Indicator (W/K/m²) — SEAI uses this as the primary fabric quality metric.
 * SEAI heat pump grant requires HLI ≤ 2.0 (or ≤ 2.3 with enhanced conditions).
 */

export interface HeatPumpArchetype {
  id: string;
  label: string;
  /** Typical floor area (m²). User can override. */
  floorAreaM2: number;
  /** Default Heat Loss Indicator (W/K/m²) before any measures */
  defaultHLI: number;
  /** Whether this dwelling type has a cavity wall (determines cavity fill applicability) */
  hasCavity: boolean;
  description: string;
}

export const ARCHETYPES: HeatPumpArchetype[] = [
  {
    id: 'pre1940_solid',
    label: 'Pre-1940 solid-wall',
    floorAreaM2: 90,
    defaultHLI: 4.5,
    hasCavity: false,
    description: 'Pre-1940 stone or solid-brick cottage/terrace. No cavity. Very poorly insulated.',
  },
  {
    id: 'pre1978_semi',
    label: '1940–1978 semi-detached',
    floorAreaM2: 100,
    defaultHLI: 3.5,
    hasCavity: true,
    description: '1940–1978 hollow-block or early cavity construction. Cavity typically uninsulated.',
  },
  {
    id: '1980s_semi',
    label: '1979–1995 semi-detached',
    floorAreaM2: 108,
    defaultHLI: 2.5,
    hasCavity: true,
    description: '1979–1995 cavity wall. Cavity unfilled or partially filled. BER C/D typical.',
  },
  {
    id: '1990s_semi',
    label: '1996–2008 semi-detached',
    floorAreaM2: 110,
    defaultHLI: 2.0,
    hasCavity: true,
    description: '1996–2008 cavity wall with partial insulation fill. BER C typical.',
  },
  {
    id: 'modern',
    label: '2010+ new build',
    floorAreaM2: 150,
    defaultHLI: 1.2,
    hasCavity: true,
    description: '2010+ built to TGD-L Part L regulations. BER A/B typical.',
  },
];

export function getArchetype(id: string): HeatPumpArchetype {
  const archetype = ARCHETYPES.find((a) => a.id === id);
  if (!archetype) throw new Error(`Unknown archetype id: ${id}`);
  return archetype;
}

// ---------------------------------------------------------------------------
// Insulation measures
// ---------------------------------------------------------------------------

export type InsulationMeasure = 'attic' | 'cavity' | 'airSealing' | 'ewi' | 'drylining' | 'floor' | 'windows' | 'doors';

export interface InsulationMeasureData {
  label: string;
  /** Reduction in HLI (W/K/m²) applied to the whole dwelling */
  hliDelta: number;
  /** Typical net cost to homeowner after SEAI grants (€, 2026 figures, semi-D as reference) */
  netCostEur: number;
  /** If true, only applicable to dwellings with cavity walls */
  requiresCavity: boolean;
}

export const INSULATION_MEASURES: Record<InsulationMeasure, InsulationMeasureData> = {
  attic: {
    label: 'Attic insulation',
    hliDelta: 0.70,
    netCostEur: 800,
    requiresCavity: false,
  },
  cavity: {
    label: 'Cavity wall fill',
    hliDelta: 0.55,
    netCostEur: 400,
    requiresCavity: true,
  },
  airSealing: {
    label: 'Air sealing / draught-proofing',
    hliDelta: 0.22,
    netCostEur: 450,
    requiresCavity: false,
  },
  ewi: {
    label: 'External wall insulation (EWI)',
    hliDelta: 0.30,
    netCostEur: 14000,
    requiresCavity: false,
  },
  drylining: {
    label: 'Internal dry lining (IWI)',
    hliDelta: 0.30,
    netCostEur: 6000,
    requiresCavity: false,
  },
  floor: {
    label: 'Floor insulation',
    hliDelta: 0.15,
    netCostEur: 1500,
    requiresCavity: false,
  },
  windows: {
    label: 'Windows (double → triple glazing)',
    hliDelta: 0.12,
    netCostEur: 5000,  // typical €8,000, SEAI grant €3,000 (semi-d, Feb 2026)
    requiresCavity: false,
  },
  doors: {
    label: 'Front & back doors',
    hliDelta: 0.05,  // small but measurable draught + thermal bridge reduction
    netCostEur: 1200,  // typical €2,800 (2 doors), SEAI grant €1,600 (€800 × 2, Feb 2026)
    requiresCavity: false,
  },
};

/** Minimum HLI floor — physically unreachable below this */
const HLI_FLOOR = 0.3;

/**
 * Applies a set of insulation measures to a base HLI.
 * Cavity fill is silently skipped if the dwelling has no cavity.
 */
export function applyInsulationMeasures(
  baseHLI: number,
  measures: InsulationMeasure[],
  hasCavity: boolean,
): number {
  let hli = baseHLI;
  for (const measure of measures) {
    const data = INSULATION_MEASURES[measure];
    if (data.requiresCavity && !hasCavity) continue;
    hli -= data.hliDelta;
  }
  return Math.max(HLI_FLOOR, hli);
}

/**
 * Total net cost (€) of a set of insulation measures.
 * Cavity fill cost is excluded if dwelling has no cavity.
 */
export function insulationMeasuresCost(
  measures: InsulationMeasure[],
  hasCavity: boolean,
): number {
  return measures.reduce((total, measure) => {
    const data = INSULATION_MEASURES[measure];
    if (data.requiresCavity && !hasCavity) return total;
    return total + data.netCostEur;
  }, 0);
}

// ---------------------------------------------------------------------------
// Installation quality
// ---------------------------------------------------------------------------

export type InstallQuality = 'poor' | 'good' | 'heatgeek';

export interface InstallQualityData {
  label: string;
  /** Added to the weather compensation flow temperature (°C). Positive = hotter = less efficient. */
  flowTempOffsetC: number;
  /**
   * Incremental cost vs 'poor' install (€).
   * Pessimistic estimate: includes heat loss survey, radiator upgrades, commissioning.
   */
  incrementalCostEur: number;
  description: string;
}

export const INSTALL_QUALITY: Record<InstallQuality, InstallQualityData> = {
  poor: {
    label: 'Poor installation',
    flowTempOffsetC: 10,
    incrementalCostEur: 0,
    description:
      'No weather compensation — runs at fixed high flow temperature year-round, likely oversized. ' +
      'Typical of many current Irish/UK installs. flowTempOffset is ignored; fixed temp is always used.',
  },
  good: {
    label: 'Good installation',
    flowTempOffsetC: 0,
    incrementalCostEur: 2500,
    description:
      'Proper heat loss survey (€800), radiators sized/upgraded in 2–3 rooms (€3,000), ' +
      'weather compensation calibrated (€700). €4,500 gross but €2,000 covered by HP grant central heating upgrade component.',
  },
  heatgeek: {
    label: 'Heat Geek quality',
    flowTempOffsetC: -5,
    incrementalCostEur: 5000,
    description:
      'All rooms checked, undersized radiators upgraded, fine-tuned weather compensation curve. ' +
      '€7,000 gross but €2,000 covered by HP grant.',
  },
};

// ---------------------------------------------------------------------------
// Design flow temperature lookup
// ---------------------------------------------------------------------------

/**
 * Returns the design flow temperature (°C) at the design outdoor temperature (-3°C)
 * for a given HLI, before any installation quality offset.
 *
 * Lower HLI → lower required flow temp → higher COP.
 * Based on MCS Heat Emitter Guide star ratings and Heat Geek guidance.
 */
export function getDesignFlowTempC(effectiveHLI: number): number {
  if (effectiveHLI < 1.0) return 35;
  if (effectiveHLI < 1.5) return 40;
  if (effectiveHLI < 2.0) return 45;
  if (effectiveHLI < 2.5) return 50;
  if (effectiveHLI < 3.5) return 55;
  return 60;
}
