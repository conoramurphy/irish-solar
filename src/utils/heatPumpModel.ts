/**
 * Heat pump electricity profile generator.
 *
 * Generates a half-hourly electricity consumption array (kWh per 30-min slot)
 * for a heat pump serving space heating and domestic hot water.
 *
 * The output array is intended to be merged with a base house electricity profile
 * and passed as `hourlyConsumptionOverride` to `prepareSimulationContext()` —
 * the simulation engine requires no changes.
 *
 * COP model: Carnot-derived with calibrated efficiency factor (η = 0.52).
 * Validated against EN14511/Keymark data:
 *   - A7/W35 → COP ~4.5  (Vaillant aroTHERM 5kW: 4.48 measured)
 *   - A7/W55 → COP ~3.0  (measured: ~3.0–3.1)
 *   - A-7/W45 → COP ~2.8 (measured: ~2.9)
 */

import {
  type InstallQuality,
  type InsulationMeasure,
  INSTALL_QUALITY,
  applyInsulationMeasures,
  getArchetype,
  getDesignFlowTempC,
} from '../data/heatPumpArchetypes';
import {
  DESIGN_OUTDOOR_TEMP_C,
  HEATING_CUTOFF_TEMP_C,
  generateYearlyTemperatureProfile,
} from '../data/irishWeatherProfiles';

// ---------------------------------------------------------------------------
// COP calculation
// ---------------------------------------------------------------------------

const CARNOT_EFFICIENCY = 0.52;
/** Condenser temperature lift above flow temperature (K) */
const CONDENSER_DELTA_K = 3;
/** Evaporator temperature drop below outdoor temperature (K) */
const EVAPORATOR_DELTA_K = 6;

/**
 * Instantaneous COP for a heat pump at given outdoor and flow temperatures.
 *
 * @param T_out_C  - Outdoor air temperature (°C)
 * @param T_flow_C - Flow (supply) temperature to heat emitters (°C)
 * @returns COP (dimensionless), clamped to [1.0, 6.0]
 */
export function calculateCOP(T_out_C: number, T_flow_C: number): number {
  const T_cond_K = T_flow_C + 273.15 + CONDENSER_DELTA_K;
  const T_evap_K = T_out_C + 273.15 - EVAPORATOR_DELTA_K;
  const lift = T_cond_K - T_evap_K;
  if (lift <= 0) return 6.0;
  const cop = CARNOT_EFFICIENCY * (T_cond_K / lift);
  return Math.min(6.0, Math.max(1.0, cop));
}

// ---------------------------------------------------------------------------
// Weather compensation curve
// ---------------------------------------------------------------------------

/**
 * Returns the flow temperature (°C) for a given outdoor temperature.
 *
 * All installs use a linear weather compensation curve from
 * (T_flow_design + offset) at design outdoor temp (-3°C) down to 25°C
 * at heating cutoff (15.5°C). The offset shifts the curve up (poor install,
 * no radiator upgrades) or down (Heat Geek optimised).
 *
 * @param T_out_C          - Outdoor temperature (°C)
 * @param T_flow_design_C  - Design flow temperature (°C) from getDesignFlowTempC()
 * @param flowTempOffsetC  - Continuous offset (°C). Positive = hotter flow = lower COP.
 *                           Typical range: -5 (Heat Geek) to +10 (poor install).
 */
export function getFlowTempC(
  T_out_C: number,
  T_flow_design_C: number,
  flowTempOffsetC: number,
): number {
  const T_flow_min = 25;
  const T_flow_design_actual = T_flow_design_C + flowTempOffsetC;

  // Weather compensation curve for all installs
  const range = HEATING_CUTOFF_TEMP_C - DESIGN_OUTDOOR_TEMP_C; // 18.5°C
  const slope = (T_flow_design_actual - T_flow_min) / range;
  const T_flow = T_flow_design_actual - slope * (T_out_C - DESIGN_OUTDOOR_TEMP_C);

  return Math.min(T_flow_design_actual, Math.max(T_flow_min, T_flow));
}

// ---------------------------------------------------------------------------
// DHW profile
// ---------------------------------------------------------------------------

const DHW_TEMP_C = 52; // Storage temperature (°C) — below legionella threshold but practical
const M2_PER_OCCUPANT = 30;

/**
 * Daily DHW thermal demand (kWh) per occupant.
 * 55 litres/person/day × 40°C rise × 1.163 Wh/(litre·°C) / 1000 ≈ 2.56 kWh/person/day
 */
const DHW_KWH_THERMAL_PER_OCCUPANT_PER_DAY = 2.56;

/**
 * DHW time-of-day distribution across 48 half-hour slots — draw-time schedule.
 * Models when hot water is actually used (no smart scheduling).
 * Morning peak (06:00–09:00): slots 12–17 (40%)
 * Evening peak (18:00–21:00): slots 36–41 (35%)
 * Spread remaining (25%) evenly across other slots.
 */
function buildDhwDrawTimeProfile(): number[] {
  const profile = new Array<number>(48).fill(0);
  const morningSlots = [12, 13, 14, 15, 16, 17]; // 06:00–09:00
  const eveningSlots = [36, 37, 38, 39, 40, 41]; // 18:00–21:00
  const otherSlots = Array.from({ length: 48 }, (_, i) => i)
    .filter((i) => !morningSlots.includes(i) && !eveningSlots.includes(i));

  const morningShare = 0.40 / morningSlots.length;
  const eveningShare = 0.35 / eveningSlots.length;
  const otherShare = 0.25 / otherSlots.length;

  for (const s of morningSlots) profile[s] = morningShare;
  for (const s of eveningSlots) profile[s] = eveningShare;
  for (const s of otherSlots) profile[s] = otherShare;
  return profile;
}

/**
 * DHW night-boost schedule: HP reheats only what was drawn, during cheap overnight slots.
 * Slots 2–13 (01:00–07:00) — solidly within any Irish night-rate window.
 * The tank covers draw demand throughout the day; electricity consumption shifts to night.
 */
function buildDhwNightBoostProfile(): number[] {
  const profile = new Array<number>(48).fill(0);
  const nightSlots = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 01:00–07:00
  const share = 1.0 / nightSlots.length;
  for (const s of nightSlots) profile[s] = share;
  return profile;
}

const DHW_DRAW_TIME_PROFILE = buildDhwDrawTimeProfile();
const DHW_NIGHT_BOOST_PROFILE = buildDhwNightBoostProfile();

// ---------------------------------------------------------------------------
// Profile generator
// ---------------------------------------------------------------------------

export interface HeatPumpProfileParams {
  /** Archetype ID from heatPumpArchetypes.ts */
  archetypeId: string;
  /**
   * Direct HLI override (W/K/m²) — use when the homeowner has their BER certificate,
   * which includes this figure. When set, replaces the archetype's defaultHLI before
   * insulation measures are applied. Archetype is still needed for hasCavity and
   * default floor area.
   */
  hliOverride?: number;
  /** Override the archetype's default floor area (m²) */
  floorAreaM2?: number;
  /** Insulation measures already in place */
  insulation: InsulationMeasure[];
  /** Installation quality tier */
  installQuality: InstallQuality;
  /**
   * Continuous flow temperature offset (°C). Positive = hotter flow = lower COP.
   * Overrides the installQuality preset when provided.
   * Typical range: -5 (Heat Geek) to +10 (poor install, no radiator upgrades).
   */
  flowTempOffsetC?: number;
  /** Location name (e.g. 'Dublin', 'Cork'). Falls back to Dublin. */
  location: string;
  /** Number of occupants (drives DHW demand). Defaults to floor_area / 30, clamped 1–6. */
  occupants?: number;
  /**
   * DHW heating schedule.
   * - 'draw-time': electricity consumed when hot water is drawn (morning/evening peaks). Default.
   * - 'night-boost': HP reheats the tank during cheap overnight slots (01:00–07:00),
   *   covering only what was drawn. Use when the tariff has a cheap night/EV rate.
   */
  dhwSchedule?: 'draw-time' | 'night-boost';
  /** Calendar year — determines leap year slot count (17568 or 17664) */
  year: number;
  /**
   * Optional: pre-computed month index for each slot (0–11).
   * If provided, avoids re-deriving the calendar internally.
   * Must match the solar timeseries timestamps for the same year.
   */
  monthIndexPerSlot?: number[];
  /**
   * Optional: real half-hourly outdoor temperatures (°C) from weatherDataLoader.
   * When provided, bypasses the synthetic sinusoidal temperature model entirely.
   */
  realTemperaturesC?: number[];
}

/**
 * Generates a half-hourly heat pump electricity consumption profile.
 *
 * @returns Array of kWh values, one per 30-min slot (17568 for 2025, 17664 for leap year).
 *          Values represent heat pump electricity only — add to base house profile before
 *          passing to prepareSimulationContext().
 */
export function generateHeatPumpProfile(params: HeatPumpProfileParams): number[] {
  const {
    archetypeId,
    insulation,
    installQuality,
    location,
    year,
  } = params;

  const archetype = getArchetype(archetypeId);
  const floorAreaM2 = params.floorAreaM2 ?? archetype.floorAreaM2;
  const occupants = params.occupants
    ?? Math.min(6, Math.max(1, Math.round(floorAreaM2 / M2_PER_OCCUPANT)));

  // Effective HLI: start from BER cert override if provided, else archetype default
  const baseHLI = params.hliOverride ?? archetype.defaultHLI;
  const effectiveHLI = applyInsulationMeasures(baseHLI, insulation, archetype.hasCavity);

  // Whole-house heat loss coefficient (W/K)
  const hlcWperK = effectiveHLI * floorAreaM2;

  // Design flow temperature at design outdoor temp (-3°C), before quality offset
  const designFlowTempC = getDesignFlowTempC(effectiveHLI);

  // Resolve flow temp offset: explicit override wins, else use install quality preset
  const resolvedOffset = params.flowTempOffsetC ?? INSTALL_QUALITY[installQuality].flowTempOffsetC;

  // Poor install with no explicit override = no weather compensation.
  // Runs at a fixed high flow temperature year-round, which is what causes
  // real-world SCOP ~2.5–3.1 in field trials (Electrification of Heat, MCS data).
  // An explicit flowTempOffsetC override enables weather comp for intermediate cases
  // (e.g. a poorly calibrated system that still has weather comp, offset +5–7°C).
  const useFixedFlowTemp = installQuality === 'poor' && params.flowTempOffsetC === undefined;
  const fixedFlowTempC = designFlowTempC + resolvedOffset; // only used when useFixedFlowTemp

  // Annual DHW thermal demand (kWh)
  const dailyDhwThermalKwh = DHW_KWH_THERMAL_PER_OCCUPANT_PER_DAY * occupants;
  const dhwDailyProfile = params.dhwSchedule === 'night-boost'
    ? DHW_NIGHT_BOOST_PROFILE
    : DHW_DRAW_TIME_PROFILE;

  // Temperature profile for the year
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalSlots = isLeap ? 17664 : 17568;

  const outdoorTemps = generateYearlyTemperatureProfile(
    location,
    year,
    params.monthIndexPerSlot,
    params.realTemperaturesC,
  );

  const profile: number[] = new Array(totalSlots).fill(0);

  for (let slot = 0; slot < totalSlots; slot++) {
    const T_out = outdoorTemps[slot];
    const halfHourOfDay = slot % 48;

    // --- Space heating ---
    let spaceHeatElecKwh = 0;
    if (T_out < HEATING_CUTOFF_TEMP_C) {
      // Heat demand for this 30-min slot (kWh thermal)
      const deltaT = Math.max(0, 21 - T_out); // internal setpoint 21°C
      const spaceHeatThermalKwh = (hlcWperK * deltaT * 0.5) / 1000; // W × h → kWh (0.5h slot)

      // Poor install: fixed flow temp all year (no weather comp)
      // All other installs: weather compensation curve (flow temp tracks outdoor temp)
      const T_flow = useFixedFlowTemp
        ? fixedFlowTempC
        : getFlowTempC(T_out, designFlowTempC, resolvedOffset);

      // COP at this operating point
      const cop = calculateCOP(T_out, T_flow);

      spaceHeatElecKwh = spaceHeatThermalKwh / cop;
    }

    // --- DHW ---
    // DHW COP uses fixed storage temperature (52°C)
    const copDhw = calculateCOP(T_out, DHW_TEMP_C);
    const dhwThermalKwh = dailyDhwThermalKwh * dhwDailyProfile[halfHourOfDay];
    const dhwElecKwh = dhwThermalKwh / copDhw;

    profile[slot] = spaceHeatElecKwh + dhwElecKwh;
  }

  return profile;
}

/**
 * Calculates the estimated seasonal COP (SCOP) from a generated profile.
 * SCOP = total thermal output / total electrical input over the year.
 *
 * Useful for display purposes and calibration checks.
 */
export function estimateSCOP(params: HeatPumpProfileParams): number {
  const archetype = getArchetype(params.archetypeId);
  const floorAreaM2 = params.floorAreaM2 ?? archetype.floorAreaM2;
  const occupants = params.occupants
    ?? Math.min(6, Math.max(1, Math.round(floorAreaM2 / M2_PER_OCCUPANT)));

  const baseHLI = params.hliOverride ?? archetype.defaultHLI;
  const effectiveHLI = applyInsulationMeasures(baseHLI, params.insulation, archetype.hasCavity);
  const hlcWperK = effectiveHLI * floorAreaM2;

  const isLeap = (params.year % 4 === 0 && params.year % 100 !== 0) || params.year % 400 === 0;
  const totalSlots = isLeap ? 17664 : 17568;

  const outdoorTemps = generateYearlyTemperatureProfile(
    params.location,
    params.year,
    params.monthIndexPerSlot,
    params.realTemperaturesC,
  );

  const designFlowTempC = getDesignFlowTempC(effectiveHLI);
  const resolvedOffset = params.flowTempOffsetC ?? INSTALL_QUALITY[params.installQuality].flowTempOffsetC;
  const useFixedFlowTemp = params.installQuality === 'poor' && params.flowTempOffsetC === undefined;
  const fixedFlowTempC = designFlowTempC + resolvedOffset;
  const dailyDhwThermalKwh = DHW_KWH_THERMAL_PER_OCCUPANT_PER_DAY * occupants;
  const dhwDailyProfile = params.dhwSchedule === 'night-boost'
    ? DHW_NIGHT_BOOST_PROFILE
    : DHW_DRAW_TIME_PROFILE;

  let totalThermal = 0;
  let totalElec = 0;

  for (let slot = 0; slot < totalSlots; slot++) {
    const T_out = outdoorTemps[slot];
    const halfHourOfDay = slot % 48;

    let spaceHeatThermal = 0;
    let spaceHeatElec = 0;

    if (T_out < HEATING_CUTOFF_TEMP_C) {
      const deltaT = Math.max(0, 21 - T_out);
      spaceHeatThermal = (hlcWperK * deltaT * 0.5) / 1000;
      const T_flow = useFixedFlowTemp
        ? fixedFlowTempC
        : getFlowTempC(T_out, designFlowTempC, resolvedOffset);
      const cop = calculateCOP(T_out, T_flow);
      spaceHeatElec = spaceHeatThermal / cop;
    }

    const copDhw = calculateCOP(T_out, DHW_TEMP_C);
    const dhwThermal = dailyDhwThermalKwh * dhwDailyProfile[halfHourOfDay];
    const dhwElec = dhwThermal / copDhw;

    totalThermal += spaceHeatThermal + dhwThermal;
    totalElec += spaceHeatElec + dhwElec;
  }

  if (totalElec === 0) return 0;
  return totalThermal / totalElec;
}
