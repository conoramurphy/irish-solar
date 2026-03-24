/**
 * Heat pump scenario builder.
 *
 * Generates the two output types described in HEAT_PUMP_PLAN.md:
 *
 *   Output A — Waterfall payback table:
 *     Starting from a poorly-installed heat pump, shows the marginal cost and
 *     payback of each upgrade measure in sequence.
 *
 *   Output B — Solar maximalist scenario:
 *     Minimum insulation (attic + cavity if available + air sealing) + good
 *     install + maximum practical solar + 10 kWh battery.
 *
 * This module generates heat pump electricity profiles and metadata only.
 * Callers are responsible for merging the HP profile with base house consumption
 * and running the result through prepareSimulationContext() + simulateHourlyEnergyFlow().
 *
 * Annual bills are computed by the simulation engine — not estimated here.
 */

import {
  type InsulationMeasure,
  type InstallQuality,
  INSTALL_QUALITY,
  INSULATION_MEASURES,
  applyInsulationMeasures,
  getArchetype,
  insulationMeasuresCost,
} from '../data/heatPumpArchetypes';
import {
  generateHeatPumpProfile,
  estimateSCOP,
  type HeatPumpProfileParams,
} from './heatPumpModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioStep {
  id: string;
  label: string;
  insulation: InsulationMeasure[];
  installQuality: InstallQuality;
  /** kWp of solar PV (0 = no solar in this step) */
  solarKwp: number;
  /** kWh of battery storage (0 = no battery in this step) */
  batteryKwh: number;
  /** Net cost of THIS step only (€, after grants where applicable) */
  incrementalCostEur: number;
  /** Cumulative net cost from step 0 to this step (€) */
  cumulativeCostEur: number;
  /** Half-hourly heat pump electricity profile (kWh/slot, 17568 or 17664 values) */
  hpProfileKwh: number[];
  /** Effective HLI after insulation measures */
  effectiveHLI: number;
  /**
   * Estimated seasonal COP (thermal output / electrical input).
   * Informational — actual bill savings come from the simulation engine.
   */
  estimatedSCOP: number;
}

export interface WaterfallResult {
  archetypeId: string;
  archetypeLabel: string;
  floorAreaM2: number;
  location: string;
  steps: ScenarioStep[];
}

export interface SolarMaxResult extends ScenarioStep {
  archetypeId: string;
  archetypeLabel: string;
  floorAreaM2: number;
  location: string;
}

export interface GasBaselineEstimate {
  /** Annual gas or oil consumption (kWh, primary energy) */
  annualFuelKwh: number;
  /** Annual fuel cost (€) */
  annualBillEur: number;
  fuelType: 'gas' | 'oil';
  /** Annual CO₂ (kg) — using SEAI emission factors */
  annualCo2Kg: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dublin/Ireland annual heating degree days, base 15.5°C (Met Éireann / IEA data) */
const IRISH_HDD_BASE_15_5 = 2150;

const GAS_RATE_EUR_PER_KWH = 0.137;
const GAS_BOILER_EFFICIENCY = 0.90;
const OIL_RATE_EUR_PER_KWH = 0.105; // kerosene at €0.95/L, ~10 kWh/L, 90% efficient
const OIL_BOILER_EFFICIENCY = 0.90;

/** SEAI emission factors (kg CO₂/kWh primary energy) */
const EMISSION_FACTOR_GAS = 0.203;
const EMISSION_FACTOR_OIL = 0.264;

/** DHW thermal demand (kWh/year) per occupant — averaged from DEAP standard values */
const DHW_KWH_PER_OCCUPANT_PER_YEAR = 935;

/** Net cost (€) of the heat pump unit + install (after €12,500 SEAI grant, Feb 2026) */
const HEAT_PUMP_NET_COST_EUR = 1500;

// ---------------------------------------------------------------------------
// Waterfall scenario definitions
// ---------------------------------------------------------------------------

interface WaterfallStepDef {
  id: string;
  label: string;
  insulation: InsulationMeasure[];
  installQuality: InstallQuality;
  solarKwp: number;
  batteryKwh: number;
  /** Extra cost beyond insulation and install quality costs (e.g. solar, battery) */
  extraCostEur: number;
}

const WATERFALL_STEP_DEFS: WaterfallStepDef[] = [
  {
    id: 'hp_poor',
    label: 'Heat pump — poor installation',
    insulation: [],
    installQuality: 'poor',
    solarKwp: 0,
    batteryKwh: 0,
    extraCostEur: HEAT_PUMP_NET_COST_EUR,
  },
  {
    id: 'hp_good',
    label: '→ Good installation (survey + radiators + weather comp)',
    insulation: [],
    installQuality: 'good',
    solarKwp: 0,
    batteryKwh: 0,
    extraCostEur: 0, // install quality cost tracked via INSTALL_QUALITY delta
  },
  {
    id: 'attic',
    label: '→ + Attic insulation',
    insulation: ['attic'],
    installQuality: 'good',
    solarKwp: 0,
    batteryKwh: 0,
    extraCostEur: 0,
  },
  {
    id: 'cavity',
    label: '→ + Cavity wall fill',
    insulation: ['attic', 'cavity'],
    installQuality: 'good',
    solarKwp: 0,
    batteryKwh: 0,
    extraCostEur: 0,
  },
  {
    id: 'airsealing',
    label: '→ + Air sealing / draught-proofing',
    insulation: ['attic', 'cavity', 'airSealing'],
    installQuality: 'good',
    solarKwp: 0,
    batteryKwh: 0,
    extraCostEur: 0,
  },
  {
    id: 'solar',
    label: '→ + Solar 4 kWp',
    insulation: ['attic', 'cavity', 'airSealing'],
    installQuality: 'good',
    solarKwp: 4,
    batteryKwh: 0,
    extraCostEur: 3400, // net after €1,800 SEAI solar grant
  },
  {
    id: 'battery',
    label: '→ + Battery 10 kWh',
    insulation: ['attic', 'cavity', 'airSealing'],
    installQuality: 'good',
    solarKwp: 4,
    batteryKwh: 10,
    extraCostEur: 3500,
  },
  {
    id: 'ewi',
    label: '→ + External wall insulation (EWI)',
    insulation: ['attic', 'cavity', 'airSealing', 'ewi'],
    installQuality: 'good',
    solarKwp: 4,
    batteryKwh: 10,
    extraCostEur: 0,
  },
];

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

/**
 * Builds the waterfall scenario sequence for a given house.
 *
 * Each step is cumulative (measures stack). The cavity step is automatically
 * skipped if the archetype has no cavity wall.
 *
 * @param archetypeId  - House archetype ID
 * @param location     - Location name for weather profiles
 * @param year         - Calendar year (determines slot count)
 * @param floorAreaM2  - Override floor area (m²). Defaults to archetype value.
 * @param hliOverride       - Direct HLI from BER certificate. If omitted, uses archetype default.
 * @param occupants         - Number of occupants. Defaults to floor_area / 30.
 * @param realTemperaturesC - Optional real half-hourly outdoor temperatures (°C) from weatherDataLoader.
 */
export function buildWaterfallScenarios(
  archetypeId: string,
  location: string,
  year: number,
  floorAreaM2?: number,
  hliOverride?: number,
  occupants?: number,
  realTemperaturesC?: number[],
  dhwSchedule?: 'draw-time' | 'night-boost',
): WaterfallResult {
  const archetype = getArchetype(archetypeId);
  const resolvedFloorArea = floorAreaM2 ?? archetype.floorAreaM2;

  const baseParams: Omit<HeatPumpProfileParams, 'insulation' | 'installQuality'> = {
    archetypeId,
    floorAreaM2: resolvedFloorArea,
    hliOverride,
    location,
    year,
    occupants,
    realTemperaturesC,
    dhwSchedule,
  };

  let cumulativeCost = 0;
  let prevInstallQuality: InstallQuality = 'poor';
  const steps: ScenarioStep[] = [];

  for (const def of WATERFALL_STEP_DEFS) {
    // Skip cavity step if no cavity
    if (def.insulation.includes('cavity') && !archetype.hasCavity) {
      // Remove cavity from the insulation list for this and all subsequent steps
      // by filtering it out — hasCavity=false means applyInsulationMeasures skips it anyway,
      // but we also skip the step entry entirely to avoid a misleading zero-saving row
      if (def.id === 'cavity') continue;
    }

    // Incremental cost for this step
    const insulationCost = computeIncrementalInsulationCost(
      def.insulation,
      steps.length > 0 ? steps[steps.length - 1].insulation : [],
      archetype.hasCavity,
    );
    const qualityCost = computeIncrementalQualityCost(def.installQuality, prevInstallQuality);
    const stepCost = insulationCost + qualityCost + def.extraCostEur;
    cumulativeCost += stepCost;

    const profileParams: HeatPumpProfileParams = {
      ...baseParams,
      insulation: def.insulation,
      installQuality: def.installQuality,
    };

    const baseHLI = hliOverride ?? archetype.defaultHLI;
    const effectiveHLI = applyInsulationMeasures(baseHLI, def.insulation, archetype.hasCavity);

    steps.push({
      id: def.id,
      label: def.label,
      insulation: def.insulation,
      installQuality: def.installQuality,
      solarKwp: def.solarKwp,
      batteryKwh: def.batteryKwh,
      incrementalCostEur: stepCost,
      cumulativeCostEur: cumulativeCost,
      hpProfileKwh: generateHeatPumpProfile(profileParams),
      effectiveHLI,
      estimatedSCOP: estimateSCOP(profileParams),
    });

    prevInstallQuality = def.installQuality;
  }

  return {
    archetypeId,
    archetypeLabel: archetype.label,
    floorAreaM2: resolvedFloorArea,
    location,
    steps,
  };
}

/**
 * Builds the "solar maximalist" scenario:
 * Minimum insulation (attic + cavity if available + air sealing) + good install
 * + maximum practical solar (10 kWp) + 10 kWh battery.
 */
export function buildSolarMaxScenario(
  archetypeId: string,
  location: string,
  year: number,
  floorAreaM2?: number,
  hliOverride?: number,
  occupants?: number,
  realTemperaturesC?: number[],
  dhwSchedule?: 'draw-time' | 'night-boost',
): SolarMaxResult {
  const archetype = getArchetype(archetypeId);
  const resolvedFloorArea = floorAreaM2 ?? archetype.floorAreaM2;

  const insulation: InsulationMeasure[] = archetype.hasCavity
    ? ['attic', 'cavity', 'airSealing']
    : ['attic', 'airSealing'];

  const profileParams: HeatPumpProfileParams = {
    archetypeId,
    floorAreaM2: resolvedFloorArea,
    hliOverride,
    insulation,
    installQuality: 'good',
    location,
    year,
    occupants,
    realTemperaturesC,
    dhwSchedule,
  };

  const baseHLI = hliOverride ?? archetype.defaultHLI;
  const effectiveHLI = applyInsulationMeasures(baseHLI, insulation, archetype.hasCavity);

  const insulationCost = insulationMeasuresCost(insulation, archetype.hasCavity);
  const totalCost =
    HEAT_PUMP_NET_COST_EUR +
    INSTALL_QUALITY['good'].incrementalCostEur +
    insulationCost +
    3400 + // solar 10 kWp (€5,000 net, scaled from 4kWp estimate — larger system, proportional)
    3500;  // battery 10 kWh

  return {
    id: 'solar_max',
    label: 'Solar maximalist (min insulation + max solar + battery)',
    insulation,
    installQuality: 'good',
    solarKwp: 10,
    batteryKwh: 10,
    incrementalCostEur: totalCost,
    cumulativeCostEur: totalCost,
    hpProfileKwh: generateHeatPumpProfile(profileParams),
    effectiveHLI,
    estimatedSCOP: estimateSCOP(profileParams),
    archetypeId,
    archetypeLabel: archetype.label,
    floorAreaM2: resolvedFloorArea,
    location,
  };
}

/**
 * Estimates the gas or oil baseline annual bill and CO₂ before any heat pump.
 * Uses degree-day method with whole-house heat loss coefficient.
 */
export function estimateFuelBaseline(
  archetypeId: string,
  fuelType: 'gas' | 'oil',
  floorAreaM2?: number,
  hliOverride?: number,
  occupants?: number,
): GasBaselineEstimate {
  const archetype = getArchetype(archetypeId);
  const resolvedFloorArea = floorAreaM2 ?? archetype.floorAreaM2;
  const baseHLI = hliOverride ?? archetype.defaultHLI;
  const hlcWperK = baseHLI * resolvedFloorArea;

  // Annual space heating demand (kWh thermal)
  const spaceHeatKwh = (hlcWperK * IRISH_HDD_BASE_15_5 * 24) / 1000;

  // Annual DHW thermal demand
  const resolvedOccupants = occupants ?? Math.min(6, Math.max(1, Math.round(resolvedFloorArea / 30)));
  const dhwKwh = DHW_KWH_PER_OCCUPANT_PER_YEAR * resolvedOccupants;

  const totalThermalKwh = spaceHeatKwh + dhwKwh;

  const efficiency = fuelType === 'gas' ? GAS_BOILER_EFFICIENCY : OIL_BOILER_EFFICIENCY;
  const annualFuelKwh = totalThermalKwh / efficiency;

  const ratePerKwh = fuelType === 'gas' ? GAS_RATE_EUR_PER_KWH : OIL_RATE_EUR_PER_KWH;
  const annualBillEur = annualFuelKwh * ratePerKwh;

  const emissionFactor = fuelType === 'gas' ? EMISSION_FACTOR_GAS : EMISSION_FACTOR_OIL;
  const annualCo2Kg = annualFuelKwh * emissionFactor;

  return { annualFuelKwh, annualBillEur, fuelType, annualCo2Kg };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeIncrementalInsulationCost(
  currentMeasures: InsulationMeasure[],
  previousMeasures: InsulationMeasure[],
  hasCavity: boolean,
): number {
  const newMeasures = currentMeasures.filter((m) => !previousMeasures.includes(m));
  return newMeasures.reduce((total, measure) => {
    const data = INSULATION_MEASURES[measure];
    if (data.requiresCavity && !hasCavity) return total;
    return total + data.netCostEur;
  }, 0);
}

function computeIncrementalQualityCost(
  current: InstallQuality,
  previous: InstallQuality,
): number {
  const order: InstallQuality[] = ['poor', 'good', 'heatgeek'];
  const currentIdx = order.indexOf(current);
  const previousIdx = order.indexOf(previous);
  if (currentIdx <= previousIdx) return 0;
  return INSTALL_QUALITY[current].incrementalCostEur - INSTALL_QUALITY[previous].incrementalCostEur;
}

// Re-export types needed by callers
export type { InsulationMeasure, InstallQuality };
