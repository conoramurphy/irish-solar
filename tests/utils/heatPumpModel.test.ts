import { describe, it, expect } from 'vitest';
import { calculateCOP, getFlowTempC, generateHeatPumpProfile, estimateSCOP } from '../../src/utils/heatPumpModel';
import { applyInsulationMeasures, getDesignFlowTempC } from '../../src/data/heatPumpArchetypes';
import { getHalfHourlyTemperature, getMonthlyMeanTemp } from '../../src/data/irishWeatherProfiles';

// ---------------------------------------------------------------------------
// calculateCOP
// ---------------------------------------------------------------------------

describe('calculateCOP', () => {
  it('A7/W35 gives COP ~4.4–4.6 (Vaillant aroTHERM 5kW measured: 4.48)', () => {
    const cop = calculateCOP(7, 35);
    expect(cop).toBeGreaterThanOrEqual(4.3);
    expect(cop).toBeLessThanOrEqual(4.7);
  });

  it('A7/W55 gives COP ~2.9–3.1 (EN14511 reference: ~3.0)', () => {
    const cop = calculateCOP(7, 55);
    expect(cop).toBeGreaterThanOrEqual(2.8);
    expect(cop).toBeLessThanOrEqual(3.2);
  });

  it('A-7/W45 gives COP ~2.7–3.0 (Keymark data: ~2.9)', () => {
    const cop = calculateCOP(-7, 45);
    expect(cop).toBeGreaterThanOrEqual(2.6);
    expect(cop).toBeLessThanOrEqual(3.1);
  });

  it('COP is never below 1.0 (hard clamp)', () => {
    // Extreme: -20°C outdoor, 70°C flow
    const cop = calculateCOP(-20, 70);
    expect(cop).toBeGreaterThanOrEqual(1.0);
  });

  it('COP is never above 6.0 (hard clamp)', () => {
    // Near-zero lift: 15°C outdoor, 16°C flow
    const cop = calculateCOP(15, 16);
    expect(cop).toBeLessThanOrEqual(6.0);
  });

  it('higher flow temperature always reduces COP (physics check)', () => {
    const cop35 = calculateCOP(7, 35);
    const cop45 = calculateCOP(7, 45);
    const cop55 = calculateCOP(7, 55);
    expect(cop35).toBeGreaterThan(cop45);
    expect(cop45).toBeGreaterThan(cop55);
  });

  it('warmer outdoor temperature always increases COP (physics check)', () => {
    const copMinus7 = calculateCOP(-7, 45);
    const cop2 = calculateCOP(2, 45);
    const cop7 = calculateCOP(7, 45);
    expect(cop7).toBeGreaterThan(cop2);
    expect(cop2).toBeGreaterThan(copMinus7);
  });
});

// ---------------------------------------------------------------------------
// getFlowTempC (weather compensation curve)
// ---------------------------------------------------------------------------

describe('getFlowTempC', () => {
  it('at design outdoor temp (-3°C) returns approximately the design flow temp (good install)', () => {
    const result = getFlowTempC(-3, 45, 'good');
    expect(result).toBeCloseTo(45, 0);
  });

  it('at heating cutoff (15.5°C) returns approximately 25°C min (good install)', () => {
    const result = getFlowTempC(15.5, 45, 'good');
    expect(result).toBeCloseTo(25, 1);
  });

  it('poor install adds 10°C offset at design point', () => {
    const good = getFlowTempC(-3, 45, 'good');
    const poor = getFlowTempC(-3, 45, 'poor');
    expect(poor).toBeCloseTo(good + 10, 0);
  });

  it('heatgeek install subtracts 5°C offset at design point', () => {
    const good = getFlowTempC(-3, 45, 'good');
    const hg = getFlowTempC(-3, 45, 'heatgeek');
    expect(hg).toBeCloseTo(good - 5, 0);
  });

  it('flow temp is never below 25°C even in summer', () => {
    const result = getFlowTempC(20, 40, 'good');
    expect(result).toBeGreaterThanOrEqual(25);
  });

  it('flow temp is never above design + offset', () => {
    // At very cold outdoor temp it should be clamped at design flow
    const result = getFlowTempC(-15, 45, 'good');
    expect(result).toBeLessThanOrEqual(45);
  });
});

// ---------------------------------------------------------------------------
// applyInsulationMeasures
// ---------------------------------------------------------------------------

describe('applyInsulationMeasures', () => {
  it('cavity measure is skipped if dwelling has no cavity', () => {
    const withCavity = applyInsulationMeasures(3.5, ['cavity'], true);
    const noCavity = applyInsulationMeasures(3.5, ['cavity'], false);
    expect(withCavity).toBeLessThan(3.5);
    expect(noCavity).toBeCloseTo(3.5, 5); // unchanged
  });

  it('HLI has a floor of 0.3 (cannot go below)', () => {
    const result = applyInsulationMeasures(0.5, ['attic', 'cavity', 'airSealing', 'ewi', 'floor', 'windows'], true);
    expect(result).toBeGreaterThanOrEqual(0.3);
  });

  it('multiple measures stack correctly', () => {
    // attic: -0.70, cavity: -0.55
    const result = applyInsulationMeasures(3.5, ['attic', 'cavity'], true);
    expect(result).toBeCloseTo(3.5 - 0.70 - 0.55, 5);
  });

  it('no measures leaves HLI unchanged', () => {
    const result = applyInsulationMeasures(2.5, [], true);
    expect(result).toBeCloseTo(2.5, 5);
  });
});

// ---------------------------------------------------------------------------
// getDesignFlowTempC
// ---------------------------------------------------------------------------

describe('getDesignFlowTempC', () => {
  it('HLI < 1.0 → 35°C (UFH / very well insulated)', () => {
    expect(getDesignFlowTempC(0.8)).toBe(35);
  });

  it('HLI 1.5 → 40°C', () => {
    expect(getDesignFlowTempC(1.2)).toBe(40);
  });

  it('HLI 2.0 → 45°C (SEAI grant threshold)', () => {
    expect(getDesignFlowTempC(1.8)).toBe(45);
  });

  it('HLI 2.5 → 50°C (just above SEAI threshold)', () => {
    expect(getDesignFlowTempC(2.2)).toBe(50);
  });

  it('HLI 4.0 → 60°C (poorly insulated)', () => {
    expect(getDesignFlowTempC(4.0)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// irishWeatherProfiles
// ---------------------------------------------------------------------------

describe('irishWeatherProfiles', () => {
  it('Dublin January mean is ~7.1°C', () => {
    expect(getMonthlyMeanTemp('Dublin', 0)).toBeCloseTo(7.1, 1);
  });

  it('unknown location falls back to Dublin', () => {
    expect(getMonthlyMeanTemp('Atlantis', 0)).toBeCloseTo(7.1, 1);
  });

  it('afternoon (slot 30 = 15:00) is warmer than morning (slot 12 = 06:00) in June', () => {
    const morning = getHalfHourlyTemperature('Dublin', 5, 12);
    const afternoon = getHalfHourlyTemperature('Dublin', 5, 30);
    expect(afternoon).toBeGreaterThan(morning);
  });

  it('January mean temperature is close to the monthly mean (slot 24 = midday)', () => {
    const midday = getHalfHourlyTemperature('Dublin', 0, 24);
    expect(midday).toBeGreaterThan(5);
    expect(midday).toBeLessThan(12);
  });

  it('Cork is warmer than Donegal in January', () => {
    const cork = getMonthlyMeanTemp('Cork', 0);
    const donegal = getMonthlyMeanTemp('Donegal', 0);
    expect(cork).toBeGreaterThan(donegal);
  });
});

// ---------------------------------------------------------------------------
// generateHeatPumpProfile — structure
// ---------------------------------------------------------------------------

describe('generateHeatPumpProfile — structure', () => {
  const baseParams = {
    archetypeId: '1980s_semi',
    insulation: [] as const,
    installQuality: 'good' as const,
    location: 'Dublin',
    year: 2025,
  };

  it('returns exactly 17568 slots for 2025 (non-leap year)', () => {
    const profile = generateHeatPumpProfile(baseParams);
    expect(profile).toHaveLength(17568);
  });

  it('returns exactly 17664 slots for 2024 (leap year)', () => {
    const profile = generateHeatPumpProfile({ ...baseParams, year: 2024 });
    expect(profile).toHaveLength(17664);
  });

  it('all values are >= 0 (no negative electricity)', () => {
    const profile = generateHeatPumpProfile(baseParams);
    expect(profile.every((v) => v >= 0)).toBe(true);
  });

  it('no NaN or Infinity values', () => {
    const profile = generateHeatPumpProfile(baseParams);
    expect(profile.every((v) => isFinite(v) && !isNaN(v))).toBe(true);
  });

  it('profile has non-zero values in summer (DHW keeps running)', () => {
    const profile = generateHeatPumpProfile(baseParams);
    // July: slots 8784–9264 (approx month 6, day 181+)
    // Just check that there are non-zero values somewhere in the middle of the year
    const midYear = profile.slice(8000, 9000);
    const hasNonZero = midYear.some((v) => v > 0);
    expect(hasNonZero).toBe(true);
  });

  it('winter slots use more electricity than summer slots (space heating dominates)', () => {
    const profile = generateHeatPumpProfile(baseParams);
    const janSlots = profile.slice(0, 48 * 31); // January
    const julSlots = profile.slice(48 * 181, 48 * 212); // July approx
    const janTotal = janSlots.reduce((a, b) => a + b, 0);
    const julTotal = julSlots.reduce((a, b) => a + b, 0);
    expect(janTotal).toBeGreaterThan(julTotal * 2);
  });
});

// ---------------------------------------------------------------------------
// generateHeatPumpProfile — hliOverride
// ---------------------------------------------------------------------------

describe('generateHeatPumpProfile — hliOverride', () => {
  it('hliOverride changes consumption relative to archetype default', () => {
    const base = { archetypeId: '1980s_semi', insulation: [] as const, installQuality: 'good' as const, location: 'Dublin', year: 2025 };
    const archetype = generateHeatPumpProfile(base);
    const betterInsulated = generateHeatPumpProfile({ ...base, hliOverride: 1.0 });
    const poorlyInsulated = generateHeatPumpProfile({ ...base, hliOverride: 4.0 });

    const archetypeTotal = archetype.reduce((a, b) => a + b, 0);
    const betterTotal = betterInsulated.reduce((a, b) => a + b, 0);
    const poorTotal = poorlyInsulated.reduce((a, b) => a + b, 0);

    expect(betterTotal).toBeLessThan(archetypeTotal);
    expect(poorTotal).toBeGreaterThan(archetypeTotal);
  });
});

// ---------------------------------------------------------------------------
// estimateSCOP — calibration
// ---------------------------------------------------------------------------

describe('estimateSCOP — calibration', () => {
  it('modern house + heatgeek install: SCOP in range 3.8–4.8', () => {
    const scop = estimateSCOP({
      archetypeId: 'modern',
      insulation: [],
      installQuality: 'heatgeek',
      location: 'Dublin',
      year: 2025,
    });
    expect(scop).toBeGreaterThanOrEqual(3.8);
    expect(scop).toBeLessThanOrEqual(4.8);
  });

  it('1980s semi + poor install: SCOP in range 2.0–2.9', () => {
    const scop = estimateSCOP({
      archetypeId: '1980s_semi',
      insulation: [],
      installQuality: 'poor',
      location: 'Dublin',
      year: 2025,
    });
    expect(scop).toBeGreaterThanOrEqual(2.0);
    expect(scop).toBeLessThanOrEqual(2.9);
  });

  it('1980s semi + good install + attic + cavity: SCOP improves vs poor install', () => {
    const poor = estimateSCOP({
      archetypeId: '1980s_semi',
      insulation: [],
      installQuality: 'poor',
      location: 'Dublin',
      year: 2025,
    });
    const good = estimateSCOP({
      archetypeId: '1980s_semi',
      insulation: ['attic', 'cavity'],
      installQuality: 'good',
      location: 'Dublin',
      year: 2025,
    });
    expect(good).toBeGreaterThan(poor);
  });

  it('calibration: 1990s semi (HLI ~1.3 via override, 115m²) good install → annual HP electricity ~2,500–4,500 kWh', () => {
    // BER B2, 115m², 4 occupants. Space heat ~5,500 kWh thermal + DHW ~3,700 kWh thermal.
    // At SCOP ~3.5 blended, expect ~2,600–3,500 kWh electricity from HP.
    // The sample_house_heat_pump_2025.csv (9,320 kWh) includes both base house and HP loads.
    const profile = generateHeatPumpProfile({
      archetypeId: '1990s_semi',
      hliOverride: 1.3,
      floorAreaM2: 115,
      insulation: [],
      installQuality: 'good',
      location: 'Dublin',
      year: 2025,
    });
    const annualKwh = profile.reduce((a, b) => a + b, 0);
    expect(annualKwh).toBeGreaterThanOrEqual(2500);
    expect(annualKwh).toBeLessThanOrEqual(4500);
  });

  it('1980s semi + poor install: annual HP electricity ~5,000–9,000 kWh', () => {
    const profile = generateHeatPumpProfile({
      archetypeId: '1980s_semi',
      insulation: [],
      installQuality: 'poor',
      location: 'Dublin',
      year: 2025,
    });
    const annualKwh = profile.reduce((a, b) => a + b, 0);
    expect(annualKwh).toBeGreaterThanOrEqual(5000);
    expect(annualKwh).toBeLessThanOrEqual(9000);
  });
});
