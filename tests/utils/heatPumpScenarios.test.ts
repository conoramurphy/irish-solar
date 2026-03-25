import { describe, it, expect } from 'vitest';
import {
  buildWaterfallScenarios,
  buildSolarMaxScenario,
  estimateFuelBaseline,
} from '../../src/utils/heatPumpScenarios';

// ---------------------------------------------------------------------------
// buildWaterfallScenarios — structure
// ---------------------------------------------------------------------------

describe('buildWaterfallScenarios — structure', () => {
  it('returns 9 steps for a cavity archetype (8 main + 1 drylining alternative)', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    expect(result.steps).toHaveLength(9);
    expect(result.steps.find((s) => s.id === 'drylining')?.alternativeTo).toBe('cavity');
  });

  it('returns 8 steps for a no-cavity archetype (cavity skipped, drylining is alternative)', () => {
    const result = buildWaterfallScenarios('pre1940_solid', 'Dublin', 2025);
    expect(result.steps).toHaveLength(8);
    const ids = result.steps.map((s) => s.id);
    expect(ids).not.toContain('cavity');
    expect(ids).toContain('drylining');
  });

  it('cumulative costs are monotonically non-decreasing for main (non-alternative) steps', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const mainSteps = result.steps.filter((s) => !s.alternativeTo);
    for (let i = 1; i < mainSteps.length; i++) {
      expect(mainSteps[i].cumulativeCostEur).toBeGreaterThanOrEqual(
        mainSteps[i - 1].cumulativeCostEur,
      );
    }
  });

  it('all HP profiles have length 17568 (2025, non-leap)', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    for (const step of result.steps) {
      expect(step.hpProfileKwh).toHaveLength(17568);
    }
  });

  it('solar steps have solarKwp > 0; pre-solar steps have solarKwp = 0', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const solarStep = result.steps.find((s) => s.id === 'solar');
    const atticStep = result.steps.find((s) => s.id === 'attic');
    expect(solarStep?.solarKwp).toBeGreaterThan(0);
    expect(atticStep?.solarKwp).toBe(0);
  });

  it('battery step has batteryKwh > 0; pre-battery steps have batteryKwh = 0', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const batteryStep = result.steps.find((s) => s.id === 'battery');
    const solarStep = result.steps.find((s) => s.id === 'solar');
    expect(batteryStep?.batteryKwh).toBeGreaterThan(0);
    expect(solarStep?.batteryKwh).toBe(0);
  });

  it('SCOP improves from poor → good install step', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const poor = result.steps.find((s) => s.id === 'hp_poor');
    const good = result.steps.find((s) => s.id === 'hp_good');
    expect(poor).toBeDefined();
    expect(good).toBeDefined();
    expect(good!.estimatedSCOP).toBeGreaterThan(poor!.estimatedSCOP);
  });

  it('SCOP improves when insulation is added (attic step vs good install step)', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const good = result.steps.find((s) => s.id === 'hp_good');
    const attic = result.steps.find((s) => s.id === 'attic');
    expect(attic!.estimatedSCOP).toBeGreaterThanOrEqual(good!.estimatedSCOP);
  });

  it('effectiveHLI decreases as insulation measures are added', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const poor = result.steps.find((s) => s.id === 'hp_poor')!;
    const attic = result.steps.find((s) => s.id === 'attic')!;
    const cavity = result.steps.find((s) => s.id === 'cavity')!;
    expect(attic.effectiveHLI).toBeLessThan(poor.effectiveHLI);
    expect(cavity.effectiveHLI).toBeLessThan(attic.effectiveHLI);
  });

  it('hliOverride is respected — changes effective HLI vs archetype default', () => {
    const withOverride = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025, undefined, 1.0);
    const withoutOverride = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    // First step (no insulation yet) should have lower HLI with override
    expect(withOverride.steps[0].effectiveHLI).toBeLessThan(withoutOverride.steps[0].effectiveHLI);
  });

  it('archetype label and id are returned correctly', () => {
    const result = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    expect(result.archetypeId).toBe('1980s_semi');
    expect(result.archetypeLabel).toBeTruthy();
    expect(result.location).toBe('Dublin');
  });
});

// ---------------------------------------------------------------------------
// buildSolarMaxScenario
// ---------------------------------------------------------------------------

describe('buildSolarMaxScenario', () => {
  it('has solarKwp = 10 and batteryKwh = 10', () => {
    const result = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    expect(result.solarKwp).toBe(10);
    expect(result.batteryKwh).toBe(10);
  });

  it('uses good install quality', () => {
    const result = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    expect(result.installQuality).toBe('good');
  });

  it('includes attic and airSealing for any archetype', () => {
    const solid = buildSolarMaxScenario('pre1940_solid', 'Dublin', 2025);
    expect(solid.insulation).toContain('attic');
    expect(solid.insulation).toContain('airSealing');
    expect(solid.insulation).not.toContain('cavity');
  });

  it('includes cavity for cavity archetypes', () => {
    const semi = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    expect(semi.insulation).toContain('cavity');
  });

  it('HP profile has 17568 slots', () => {
    const result = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    expect(result.hpProfileKwh).toHaveLength(17568);
  });

  it('cumulative cost > 0', () => {
    const result = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    expect(result.cumulativeCostEur).toBeGreaterThan(0);
  });

  it('SCOP is reasonable (2.5–4.6) for 1980s semi', () => {
    const result = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    expect(result.estimatedSCOP).toBeGreaterThanOrEqual(2.5);
    expect(result.estimatedSCOP).toBeLessThanOrEqual(4.6);
  });
});

// ---------------------------------------------------------------------------
// estimateFuelBaseline
// ---------------------------------------------------------------------------

describe('estimateFuelBaseline', () => {
  it('1980s_semi Dublin gas: annual bill roughly €1,400–3,000', () => {
    // 100m², HLI 2.5 → HLC 250 W/K, 3 occupants. Space heat + DHW both significant.
    const result = estimateFuelBaseline('1980s_semi', 'gas');
    expect(result.annualBillEur).toBeGreaterThanOrEqual(1400);
    expect(result.annualBillEur).toBeLessThanOrEqual(3000);
  });

  it('modern Dublin gas: annual bill roughly €1,000–3,000', () => {
    // 150m² (large), HLI 1.2, 5 occupants — larger house with significant DHW load.
    // Well insulated but large floor area + 5 occupants means meaningful total.
    const result = estimateFuelBaseline('modern', 'gas');
    expect(result.annualBillEur).toBeGreaterThanOrEqual(1000);
    expect(result.annualBillEur).toBeLessThanOrEqual(3000);
  });

  it('oil bill is different from gas bill (different fuel price)', () => {
    const gas = estimateFuelBaseline('1980s_semi', 'gas');
    const oil = estimateFuelBaseline('1980s_semi', 'oil');
    expect(gas.annualBillEur).not.toBeCloseTo(oil.annualBillEur, 0);
  });

  it('fuelType is returned correctly', () => {
    expect(estimateFuelBaseline('1980s_semi', 'gas').fuelType).toBe('gas');
    expect(estimateFuelBaseline('1980s_semi', 'oil').fuelType).toBe('oil');
  });

  it('CO₂ is positive and larger for oil than gas (higher emission factor)', () => {
    const gas = estimateFuelBaseline('1980s_semi', 'gas');
    const oil = estimateFuelBaseline('1980s_semi', 'oil');
    expect(gas.annualCo2Kg).toBeGreaterThan(0);
    expect(oil.annualCo2Kg).toBeGreaterThan(gas.annualCo2Kg);
  });

  it('hliOverride affects the baseline bill', () => {
    const highHLI = estimateFuelBaseline('1980s_semi', 'gas', undefined, 4.0);
    const lowHLI = estimateFuelBaseline('1980s_semi', 'gas', undefined, 1.0);
    expect(highHLI.annualBillEur).toBeGreaterThan(lowHLI.annualBillEur);
  });
});
