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
  /** If set, this step is an alternative to the step with this ID (not cumulative) */
  alternativeTo?: string;
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
  /** Annual carbon tax component of the fuel bill (€) */
  annualCarbonTaxEur: number;
  /** Annual standing charge that would be eliminated (€) */
  standingChargeEur: number;
  /** Projected 2030 annual fuel bill including carbon tax escalation (€) */
  projectedBill2030Eur: number;
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

/** Ireland carbon tax (€/tonne CO₂) — Finance Act 2020 S.40, rising €7.50/yr to €100 by 2030 */
const CARBON_TAX_EUR_PER_TONNE_2026 = 63.50;
const CARBON_TAX_EUR_PER_TONNE_2030 = 100.00;

/** Gas standing charge eliminated when switching to HP (€/year, typical Irish domestic) */
const GAS_STANDING_CHARGE_EUR_PER_YEAR = 225;

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
  /** If set, this step is an alternative to another step (not cumulative with main waterfall) */
  alternativeTo?: string;
  /** If true, only include this step when the archetype has a cavity */
  requiresCavity?: boolean;
  /** If true, only include this step when the archetype has NO cavity */
  requiresNoCavity?: boolean;
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
    requiresCavity: true,
  },
  {
    id: 'drylining',
    label: '→ + Internal dry lining (alternative wall insulation)',
    insulation: ['attic', 'drylining'],
    installQuality: 'good',
    solarKwp: 0,
    batteryKwh: 0,
    extraCostEur: 0,
    alternativeTo: 'cavity',
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
    label: '→ + Battery 10 kWh (night-rate arbitrage)',
    insulation: ['attic', 'cavity', 'airSealing'],
    installQuality: 'good',
    solarKwp: 0,
    batteryKwh: 10,
    extraCostEur: 3500,
  },
  {
    id: 'ewi',
    label: '→ + External wall insulation (EWI)',
    insulation: ['attic', 'cavity', 'airSealing', 'ewi'],
    installQuality: 'good',
    solarKwp: 0,
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

  // Track the last main-waterfall step (non-alternative) for cost/insulation comparison
  const baseHLI = hliOverride ?? archetype.defaultHLI;

  for (const def of WATERFALL_STEP_DEFS) {
    // Skip steps with cavity/no-cavity requirements
    if (def.requiresCavity && !archetype.hasCavity) continue;
    if (def.requiresNoCavity && archetype.hasCavity) continue;
    // Houses without cavity can't do cavity — skip that step (old logic)
    if (!def.alternativeTo && def.insulation.includes('cavity') && !archetype.hasCavity && def.id === 'cavity') continue;

    // For houses without cavity, substitute drylining for cavity in insulation lists
    // This affects later main-waterfall steps that reference ['attic', 'cavity', 'airSealing']
    let resolvedInsulation = def.insulation;
    if (!archetype.hasCavity) {
      // No cavity: leave cavity out (applyInsulationMeasures skips it anyway)
      // For drylining alternatives on no-cavity houses, the step already has correct insulation
    }

    const isAlternative = def.alternativeTo !== undefined;

    if (isAlternative) {
      // Alternative step: calculate from the step BEFORE the one it replaces
      const alternativeToIdx = steps.findIndex((s) => s.id === def.alternativeTo);
      const baseStep = alternativeToIdx > 0 ? steps[alternativeToIdx - 1] : undefined;
      const baseCost = baseStep?.cumulativeCostEur ?? 0;
      const baseInsulation = baseStep?.insulation ?? [];
      const baseQuality = baseStep?.installQuality ?? 'poor';

      const insulationCost = computeIncrementalInsulationCost(
        resolvedInsulation,
        baseInsulation,
        archetype.hasCavity,
      );
      const qualityCost = computeIncrementalQualityCost(def.installQuality, baseQuality);
      const stepCost = insulationCost + qualityCost + def.extraCostEur;

      const profileParams: HeatPumpProfileParams = {
        ...baseParams,
        insulation: resolvedInsulation,
        installQuality: def.installQuality,
      };

      const effectiveHLI = applyInsulationMeasures(baseHLI, resolvedInsulation, archetype.hasCavity);

      steps.push({
        id: def.id,
        label: def.label,
        insulation: resolvedInsulation,
        installQuality: def.installQuality,
        solarKwp: def.solarKwp,
        batteryKwh: def.batteryKwh,
        incrementalCostEur: stepCost,
        cumulativeCostEur: baseCost + stepCost,
        hpProfileKwh: generateHeatPumpProfile(profileParams),
        effectiveHLI,
        estimatedSCOP: estimateSCOP(profileParams),
        alternativeTo: def.alternativeTo,
      });
    } else {
      // Main waterfall step: cumulative
      const prevStep = steps.filter((s) => !s.alternativeTo);
      const lastMain = prevStep[prevStep.length - 1];

      const insulationCost = computeIncrementalInsulationCost(
        resolvedInsulation,
        lastMain?.insulation ?? [],
        archetype.hasCavity,
      );
      const qualityCost = computeIncrementalQualityCost(def.installQuality, prevInstallQuality);
      const stepCost = insulationCost + qualityCost + def.extraCostEur;
      cumulativeCost += stepCost;

      const profileParams: HeatPumpProfileParams = {
        ...baseParams,
        insulation: resolvedInsulation,
        installQuality: def.installQuality,
      };

      const effectiveHLI = applyInsulationMeasures(baseHLI, resolvedInsulation, archetype.hasCavity);

      steps.push({
        id: def.id,
        label: def.label,
        insulation: resolvedInsulation,
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

// ---------------------------------------------------------------------------
// Packages — side-by-side comparison of complete bundles
// ---------------------------------------------------------------------------

export interface PackageScenario {
  id: string;
  label: string;
  description: string;
  insulation: InsulationMeasure[];
  installQuality: InstallQuality;
  solarKwp: number;
  batteryKwh: number;
  /** Total net cost of this package (€, after all grants) */
  totalCostEur: number;
  hpProfileKwh: number[];
  effectiveHLI: number;
  estimatedSCOP: number;
}

export interface PackagesResult {
  archetypeId: string;
  archetypeLabel: string;
  floorAreaM2: number;
  location: string;
  packages: PackageScenario[];
}

/**
 * Builds 4 named packages for side-by-side comparison.
 * All packages include a good HP install. The packages differ in insulation + solar + battery.
 */
export function buildPackageScenarios(
  archetypeId: string,
  location: string,
  year: number,
  floorAreaM2?: number,
  hliOverride?: number,
  occupants?: number,
  realTemperaturesC?: number[],
  dhwSchedule?: 'draw-time' | 'night-boost',
): PackagesResult {
  const archetype = getArchetype(archetypeId);
  const resolvedFloorArea = floorAreaM2 ?? archetype.floorAreaM2;
  const baseHLI = hliOverride ?? archetype.defaultHLI;

  const baseProfileParams: Omit<HeatPumpProfileParams, 'insulation' | 'installQuality'> = {
    archetypeId,
    floorAreaM2: resolvedFloorArea,
    hliOverride,
    location,
    year,
    occupants,
    realTemperaturesC,
    dhwSchedule,
  };

  const wallMeasure: InsulationMeasure = archetype.hasCavity ? 'cavity' : 'drylining';
  const wallLabel = archetype.hasCavity ? 'cavity fill' : 'dry lining';

  const packageDefs: Array<{
    id: string;
    label: string;
    description: string;
    insulation: InsulationMeasure[];
    solarKwp: number;
    batteryKwh: number;
    extraCostEur: number;
  }> = [
    {
      id: 'essentials',
      label: 'Essentials',
      description: `Good HP install + attic + ${wallLabel}. Cheapest path to an efficient system.`,
      insulation: ['attic', wallMeasure],
      solarKwp: 0,
      batteryKwh: 0,
      extraCostEur: 0,
    },
    {
      id: 'comfort',
      label: 'Comfort',
      description: `Essentials + air sealing. Maximum fabric-first comfort without EWI.`,
      insulation: ['attic', wallMeasure, 'airSealing'],
      solarKwp: 0,
      batteryKwh: 0,
      extraCostEur: 0,
    },
    {
      id: 'solar_saver',
      label: 'Solar Saver',
      description: `Comfort + 4 kWp solar. Balanced investment in insulation and generation.`,
      insulation: ['attic', wallMeasure, 'airSealing'],
      solarKwp: 4,
      batteryKwh: 0,
      extraCostEur: 3400,
    },
    {
      id: 'solar_max',
      label: 'Solar Maximalist',
      description: `Comfort + 10 kWp solar + 10 kWh battery. Maximum self-sufficiency.`,
      insulation: ['attic', wallMeasure, 'airSealing'],
      solarKwp: 10,
      batteryKwh: 10,
      extraCostEur: 3400 + 3500, // solar 10kWp net + battery
    },
  ];

  const packages: PackageScenario[] = packageDefs.map((def) => {
    const profileParams: HeatPumpProfileParams = {
      ...baseProfileParams,
      insulation: def.insulation,
      installQuality: 'good',
    };

    const effectiveHLI = applyInsulationMeasures(baseHLI, def.insulation, archetype.hasCavity);
    const insulationCost = insulationMeasuresCost(def.insulation, archetype.hasCavity);
    const totalCost =
      HEAT_PUMP_NET_COST_EUR +
      INSTALL_QUALITY['good'].incrementalCostEur +
      insulationCost +
      def.extraCostEur;

    return {
      id: def.id,
      label: def.label,
      description: def.description,
      insulation: def.insulation,
      installQuality: 'good' as InstallQuality,
      solarKwp: def.solarKwp,
      batteryKwh: def.batteryKwh,
      totalCostEur: totalCost,
      hpProfileKwh: generateHeatPumpProfile(profileParams),
      effectiveHLI,
      estimatedSCOP: estimateSCOP(profileParams),
    };
  });

  return {
    archetypeId,
    archetypeLabel: archetype.label,
    floorAreaM2: resolvedFloorArea,
    location,
    packages,
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

  // Carbon tax: emissionFactor is kg CO₂/kWh, carbon tax is €/tonne = €/1000kg
  const currentCarbonTaxPerKwh = (emissionFactor / 1000) * CARBON_TAX_EUR_PER_TONNE_2026;
  const carbonTax2030PerKwh = (emissionFactor / 1000) * CARBON_TAX_EUR_PER_TONNE_2030;
  const annualCarbonTaxEur = annualFuelKwh * currentCarbonTaxPerKwh;

  const standingChargeEur = fuelType === 'gas' ? GAS_STANDING_CHARGE_EUR_PER_YEAR : 0;

  // Projected 2030 bill: current bill + additional carbon tax escalation + standing charge
  const projectedBill2030Eur =
    annualFuelKwh * (ratePerKwh + (carbonTax2030PerKwh - currentCarbonTaxPerKwh)) + standingChargeEur;

  return {
    annualFuelKwh,
    annualBillEur,
    fuelType,
    annualCo2Kg,
    annualCarbonTaxEur,
    standingChargeEur,
    projectedBill2030Eur,
  };
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
