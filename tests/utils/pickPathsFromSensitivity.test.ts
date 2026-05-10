import { describe, it, expect } from 'vitest';
import {
  pickPathsFromSensitivity,
  type PathRecommendation,
} from '../../src/utils/pickPathsFromSensitivity';
import type {
  SensitivityAnalysis,
  SensitivityScenario,
  SensitivityVariant,
} from '../../src/types';

function variant(
  overrides: Partial<SensitivityVariant> & {
    netCost: number;
    annualSavings: number;
    batterySizeKwh: number;
    batteryFactor: SensitivityVariant['batteryFactor'];
  }
): SensitivityVariant {
  return {
    systemCost: overrides.netCost + 1000,
    year1ExportRevenue: 0,
    annualGenerationKwh: 0,
    equityAmount: 0,
    annualLoanPayment: 0,
    loanTermYears: 0,
    irr: 0.1,
    year1NetCashFlow: 0,
    year10NetCashFlow: 0,
    spillageFraction: 0,
    exportPaidFraction: 0,
    exportUnpaidFraction: 0,
    exportCurtailedHours: 0,
    ...overrides,
  };
}

function scenario(
  systemSizeKwp: number,
  noBattery: SensitivityVariant,
  halfBattery: SensitivityVariant,
  fullBattery: SensitivityVariant,
  doubleBattery: SensitivityVariant
): SensitivityScenario {
  return {
    scaleFactor: 1,
    annualGenerationKwh: 1000 * systemSizeKwp,
    systemSizeKwp,
    noBattery,
    halfBattery,
    fullBattery,
    doubleBattery,
  };
}

function buildAnalysis(rows: SensitivityScenario[]): SensitivityAnalysis {
  return { rows, note: 'test' };
}

describe('pickPathsFromSensitivity', () => {
  it('picks the lowest-CapEx cell that meets each target', () => {
    // Baseline bill €10,000. Three rows of increasing system size.
    const analysis = buildAnalysis([
      scenario(
        5,
        variant({ netCost: 5000, annualSavings: 3000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 6000, annualSavings: 3500, batterySizeKwh: 2.5, batteryFactor: 0.5 }),
        variant({ netCost: 7000, annualSavings: 4000, batterySizeKwh: 5, batteryFactor: 1.0 }),
        variant({ netCost: 9000, annualSavings: 4500, batterySizeKwh: 10, batteryFactor: 2.0 })
      ),
      scenario(
        10,
        variant({ netCost: 10000, annualSavings: 5500, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 11000, annualSavings: 6500, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 12000, annualSavings: 7500, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 14000, annualSavings: 8500, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
      scenario(
        20,
        variant({ netCost: 18000, annualSavings: 9000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 19000, annualSavings: 9700, batterySizeKwh: 10, batteryFactor: 0.5 }),
        variant({ netCost: 20000, annualSavings: 10000, batterySizeKwh: 20, batteryFactor: 1.0 }),
        variant({ netCost: 22000, annualSavings: 10000, batterySizeKwh: 40, batteryFactor: 2.0 })
      ),
    ]);

    const paths = pickPathsFromSensitivity(analysis, 10_000);
    expect(paths).toHaveLength(3);

    const [p33, p50, p100] = paths;
    // 33% of €10k = €3,300 in savings — first row's noBattery (€5k, €3k savings) is below 33%.
    // halfBattery on row 1 (3.5k savings) clears 33%. Lowest cost meeting the target.
    expect(p33.actualReductionPct).toBeGreaterThanOrEqual(33);
    expect(p33.targetMet).toBe(true);
    expect(p33.capexNet).toBeLessThanOrEqual(p50.capexNet);

    // 50% target: 5k+ savings. Row 2 noBattery (5.5k) is the cheapest.
    expect(p50.actualReductionPct).toBeGreaterThanOrEqual(50);
    expect(p50.targetMet).toBe(true);
    expect(p50.batterySizeKwh).toBe(0); // confirms battery-free is cheapest path

    // 100% target: full €10k savings. Row 3 fullBattery (10k savings, €20k cost).
    expect(p100.actualReductionPct).toBeGreaterThanOrEqual(100);
    expect(p100.targetMet).toBe(true);
  });

  it('omits batteries when battery-free row is cheapest at the same target', () => {
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 8000, annualSavings: 5000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 9000, annualSavings: 5100, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 10000, annualSavings: 5200, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 12000, annualSavings: 5300, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    const [p33] = pickPathsFromSensitivity(analysis, 10_000, [33]);
    expect(p33.batterySizeKwh).toBe(0);
    expect(p33.targetMet).toBe(true);
  });

  it('keeps a battery when it is genuinely the cheapest path', () => {
    // Force a scenario where the battery row's netCost beats the no-battery row at the same target.
    // (E.g. a generous battery grant making the bigger system cheaper net.)
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 10000, annualSavings: 4000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 8000, annualSavings: 6000, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 12000, annualSavings: 7000, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 14000, annualSavings: 8000, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    const [p50] = pickPathsFromSensitivity(analysis, 10_000, [50]);
    // halfBattery (€8k net, 6k savings) is cheapest meeting 50% of €10k.
    expect(p50.batterySizeKwh).toBe(5);
    expect(p50.capexNet).toBe(8000);
    expect(p50.targetMet).toBe(true);
  });

  it('falls back to highest-reduction cell with targetMet=false when target is unreachable', () => {
    // Tiny grid that maxes out at 60% reduction — 100% target is out of reach.
    const analysis = buildAnalysis([
      scenario(
        5,
        variant({ netCost: 5000, annualSavings: 4000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 6000, annualSavings: 5000, batterySizeKwh: 2.5, batteryFactor: 0.5 }),
        variant({ netCost: 7000, annualSavings: 6000, batterySizeKwh: 5, batteryFactor: 1.0 }),
        variant({ netCost: 9000, annualSavings: 6000, batterySizeKwh: 10, batteryFactor: 2.0 })
      ),
    ]);

    const [p100] = pickPathsFromSensitivity(analysis, 10_000, [100]);
    expect(p100.targetMet).toBe(false);
    // Should pick the highest-savings cell; the fullBattery row at 6,000 savings.
    expect(p100.annualSavings).toBe(6000);
    expect(p100.actualReductionPct).toBeCloseTo(60, 1);
  });

  it('returns finite payback when annualSavings > 0', () => {
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 10000, annualSavings: 2000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 11000, annualSavings: 4000, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 12000, annualSavings: 5500, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 13000, annualSavings: 6000, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    const paths = pickPathsFromSensitivity(analysis, 10_000);
    paths.forEach((p) => {
      if (p.annualSavings > 0) {
        expect(Number.isFinite(p.simplePaybackYears)).toBe(true);
        expect(p.simplePaybackYears).toBeGreaterThan(0);
      }
    });
  });

  it('throws on non-positive baseline bill', () => {
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 10000, annualSavings: 5000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 11000, annualSavings: 5500, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 12000, annualSavings: 6000, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 13000, annualSavings: 6500, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    expect(() => pickPathsFromSensitivity(analysis, 0)).toThrow();
    expect(() => pickPathsFromSensitivity(analysis, -1)).toThrow();
  });

  it('throws on empty analysis', () => {
    expect(() => pickPathsFromSensitivity({ rows: [], note: '' }, 10_000)).toThrow();
  });

  it('orders default targets ascending: 33 → 50 → 100', () => {
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 5000, annualSavings: 3500, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 8000, annualSavings: 5500, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 12000, annualSavings: 8000, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 16000, annualSavings: 10500, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    const paths: PathRecommendation[] = pickPathsFromSensitivity(analysis, 10_000);
    expect(paths.map((p) => p.targetReductionPct)).toEqual([33, 50, 100]);
  });
});
