import { describe, it, expect } from 'vitest';
import {
  pickPathsFromSensitivity,
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
  it('picks three distinct, strictly-increasing-reduction cells when the sweep supports it', () => {
    const analysis = buildAnalysis([
      scenario(
        5,
        variant({ netCost: 5000, annualSavings: 3500, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 6000, annualSavings: 3800, batterySizeKwh: 2.5, batteryFactor: 0.5 }),
        variant({ netCost: 7000, annualSavings: 4000, batterySizeKwh: 5, batteryFactor: 1.0 }),
        variant({ netCost: 9000, annualSavings: 4200, batterySizeKwh: 10, batteryFactor: 2.0 })
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
    expect(p33.actualReductionPct).toBeGreaterThanOrEqual(33);
    expect(p50.actualReductionPct).toBeGreaterThan(p33.actualReductionPct);
    expect(p100.actualReductionPct).toBeGreaterThan(p50.actualReductionPct);
    expect(p33.targetMet).toBe(true);
    expect(p50.targetMet).toBe(true);
    expect(p100.targetMet).toBe(true);
  });

  it('drops the duplicate card when one cell satisfies multiple targets at the same reduction', () => {
    // Mirrors the live screenshot: 32.5 kWp gives 53% reduction and meets both
    // 33% and 50%. The 100% target jumps to a much bigger system.
    const analysis = buildAnalysis([
      scenario(
        32.5,
        variant({ netCost: 18316, annualSavings: 5300, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 19000, annualSavings: 5300, batterySizeKwh: 16, batteryFactor: 0.5 }),
        variant({ netCost: 20000, annualSavings: 5300, batterySizeKwh: 32, batteryFactor: 1.0 }),
        variant({ netCost: 22000, annualSavings: 5300, batterySizeKwh: 65, batteryFactor: 2.0 })
      ),
      scenario(
        65,
        variant({ netCost: 35000, annualSavings: 9500, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 50000, annualSavings: 10000, batterySizeKwh: 30, batteryFactor: 0.5 }),
        variant({ netCost: 61838, annualSavings: 10000, batterySizeKwh: 60, batteryFactor: 1.0 }),
        variant({ netCost: 80000, annualSavings: 10000, batterySizeKwh: 120, batteryFactor: 2.0 })
      ),
    ]);

    const paths = pickPathsFromSensitivity(analysis, 10_000);
    // Cards must be strictly-increasing in reduction.
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i].actualReductionPct).toBeGreaterThan(paths[i - 1].actualReductionPct);
    }
    // No two cards share kWp + battery (defence-in-depth check that we didn't
    // accidentally emit identical cards).
    const fingerprints = paths.map((p) => `${p.systemSizeKwp}-${p.batterySizeKwh}`);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('returns one card when the sweep can only reach one reduction level', () => {
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 8000, annualSavings: 5000, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 9000, annualSavings: 5000, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 10000, annualSavings: 5000, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 12000, annualSavings: 5000, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    const paths = pickPathsFromSensitivity(analysis, 10_000);
    expect(paths).toHaveLength(1);
    expect(paths[0].targetReductionPct).toBe(33);
    expect(paths[0].targetMet).toBe(true);
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
    expect(p50.batterySizeKwh).toBe(5);
    expect(p50.capexNet).toBe(8000);
    expect(p50.targetMet).toBe(true);
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

  it('emits picks in input target order', () => {
    const analysis = buildAnalysis([
      scenario(
        10,
        variant({ netCost: 5000, annualSavings: 3500, batterySizeKwh: 0, batteryFactor: 0 }),
        variant({ netCost: 8000, annualSavings: 5500, batterySizeKwh: 5, batteryFactor: 0.5 }),
        variant({ netCost: 12000, annualSavings: 8000, batterySizeKwh: 10, batteryFactor: 1.0 }),
        variant({ netCost: 16000, annualSavings: 10500, batterySizeKwh: 20, batteryFactor: 2.0 })
      ),
    ]);

    const paths = pickPathsFromSensitivity(analysis, 10_000);
    const targets = paths.map((p) => p.targetReductionPct);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]).toBeGreaterThan(targets[i - 1]);
    }
  });
});
