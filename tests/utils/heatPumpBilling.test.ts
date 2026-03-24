import { describe, it, expect } from 'vitest';
import { calculateDirectHpBill, calculateAllScenarioBills } from '../../src/utils/heatPumpBilling';
import { buildWaterfallScenarios, buildSolarMaxScenario, estimateFuelBaseline } from '../../src/utils/heatPumpScenarios';
import type { Tariff } from '../../src/types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Simple flat-rate tariff for deterministic tests */
const FLAT_TARIFF: Tariff = {
  id: 'test-flat',
  supplier: 'Test',
  product: 'Flat',
  type: 'flat',
  standingCharge: 0.50, // €0.50/day
  rates: [{ period: 'all', rate: 0.20 }], // €0.20/kWh
  exportRate: 0.21,
  flatRate: 0.20,
};

/** Night-saver tariff for TOU tests */
const TOU_TARIFF: Tariff = {
  id: 'test-tou',
  supplier: 'Test',
  product: 'NightSaver',
  type: 'time-of-use',
  standingCharge: 0.60,
  rates: [
    { period: 'day', hours: '8-23', rate: 0.25 },
    { period: 'night', hours: '23-8', rate: 0.10 },
  ],
  exportRate: 0.21,
  nightRate: 0.10,
  peakRate: 0.25,
};

// ---------------------------------------------------------------------------
// calculateDirectHpBill
// ---------------------------------------------------------------------------

describe('calculateDirectHpBill', () => {
  it('computes annual bill for a uniform 1 kWh/slot profile on flat tariff', () => {
    // 17568 slots × 1 kWh × €0.20/kWh + 365 days × €0.50/day
    const profile = new Array(17568).fill(1.0);
    const result = calculateDirectHpBill(profile, FLAT_TARIFF);

    expect(result.annualHpElecKwh).toBe(17568);
    expect(result.annualBillEur).toBeCloseTo(17568 * 0.20 + 365 * 0.50, 1);
    expect(result.annualSelfConsumptionKwh).toBe(0);
    expect(result.annualExportRevenueEur).toBe(0);
  });

  it('returns zero energy cost for zero-consumption profile', () => {
    const profile = new Array(17568).fill(0);
    const result = calculateDirectHpBill(profile, FLAT_TARIFF);

    expect(result.annualHpElecKwh).toBe(0);
    // Still has standing charge
    expect(result.annualBillEur).toBeCloseTo(365 * 0.50, 2);
  });

  it('applies different rates for day vs night on TOU tariff', () => {
    // Create profile with consumption only during night hours (23:00–08:00)
    // Night slots in a day (48 slots per day):
    //   23:00–00:00 = slots 46,47; 00:00–08:00 = slots 0–15 → 18 night slots
    const profile = new Array(17568).fill(0);
    for (let day = 0; day < 365; day++) {
      const dayStart = day * 48;
      // Night slots 0–15 (00:00–08:00) and 46–47 (23:00–00:00)
      for (let s = 0; s < 16; s++) profile[dayStart + s] = 1.0;
      profile[dayStart + 46] = 1.0;
      profile[dayStart + 47] = 1.0;
    }

    const result = calculateDirectHpBill(profile, TOU_TARIFF);
    const nightSlotsPerDay = 18;
    const totalNightKwh = 365 * nightSlotsPerDay;
    expect(result.annualHpElecKwh).toBe(totalNightKwh);
    // Night rate is €0.10/kWh
    const expectedEnergyCost = totalNightKwh * 0.10;
    const expectedBill = expectedEnergyCost + 365 * 0.60;
    expect(result.annualBillEur).toBeCloseTo(expectedBill, 0);
  });

  it('handles leap year profile (17664 slots)', () => {
    const profile = new Array(17664).fill(0.5);
    const result = calculateDirectHpBill(profile, FLAT_TARIFF);

    expect(result.annualHpElecKwh).toBeCloseTo(17664 * 0.5, 1);
    expect(result.annualBillEur).toBeCloseTo(17664 * 0.5 * 0.20 + 366 * 0.50, 1);
  });

  it('returns stepId as empty string (caller sets it)', () => {
    const profile = new Array(17568).fill(0);
    const result = calculateDirectHpBill(profile, FLAT_TARIFF);
    expect(result.stepId).toBe('');
  });
});

// ---------------------------------------------------------------------------
// calculateAllScenarioBills — non-solar path
// ---------------------------------------------------------------------------

describe('calculateAllScenarioBills — non-solar', () => {
  it('computes bills for all waterfall steps without solar data', () => {
    const waterfall = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const solarMax = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    const gasBaseline = estimateFuelBaseline('1980s_semi', 'gas');

    const result = calculateAllScenarioBills(
      waterfall.steps,
      solarMax,
      FLAT_TARIFF,
      null, // no solar data
      gasBaseline.annualBillEur,
    );

    expect(result.gasBaselineBillEur).toBe(gasBaseline.annualBillEur);
    expect(result.steps.length).toBe(waterfall.steps.length);

    // Each step should have a valid bill
    for (const step of result.steps) {
      expect(step.annualBillEur).toBeGreaterThan(0);
      expect(step.annualHpElecKwh).toBeGreaterThan(0);
      expect(step.stepId).toBeTruthy();
    }

    // Solar max should have a bill even without solar data (uses direct billing)
    expect(result.solarMax.annualBillEur).toBeGreaterThan(0);
    expect(result.solarMax.stepId).toBe('solar_max');
  });

  it('poor install has higher bill than good install', () => {
    const waterfall = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const solarMax = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    const gasBaseline = estimateFuelBaseline('1980s_semi', 'gas');

    const result = calculateAllScenarioBills(
      waterfall.steps,
      solarMax,
      FLAT_TARIFF,
      null,
      gasBaseline.annualBillEur,
    );

    const poorStep = result.steps.find((s) => s.stepId === 'hp_poor');
    const goodStep = result.steps.find((s) => s.stepId === 'hp_good');

    expect(poorStep).toBeDefined();
    expect(goodStep).toBeDefined();
    expect(poorStep!.annualBillEur).toBeGreaterThan(goodStep!.annualBillEur);
  });

  it('insulation reduces bill progressively', () => {
    const waterfall = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const solarMax = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    const gasBaseline = estimateFuelBaseline('1980s_semi', 'gas');

    const result = calculateAllScenarioBills(
      waterfall.steps,
      solarMax,
      FLAT_TARIFF,
      null,
      gasBaseline.annualBillEur,
    );

    // Non-solar steps (first 5 in sequence) should be monotonically decreasing
    const nonSolarSteps = result.steps.filter((s) => s.annualSelfConsumptionKwh === 0);
    for (let i = 1; i < nonSolarSteps.length; i++) {
      expect(nonSolarSteps[i].annualBillEur).toBeLessThanOrEqual(
        nonSolarSteps[i - 1].annualBillEur,
      );
    }
  });

  it('electricity bill is less than gas baseline for good install', () => {
    const waterfall = buildWaterfallScenarios('1980s_semi', 'Dublin', 2025);
    const solarMax = buildSolarMaxScenario('1980s_semi', 'Dublin', 2025);
    const gasBaseline = estimateFuelBaseline('1980s_semi', 'gas');

    const result = calculateAllScenarioBills(
      waterfall.steps,
      solarMax,
      FLAT_TARIFF,
      null,
      gasBaseline.annualBillEur,
    );

    // A well-insulated HP home with attic + cavity + air sealing should beat gas
    const airSealStep = result.steps.find((s) => s.stepId === 'airsealing');
    expect(airSealStep).toBeDefined();
    expect(airSealStep!.annualBillEur).toBeLessThan(gasBaseline.annualBillEur);
  });
});
