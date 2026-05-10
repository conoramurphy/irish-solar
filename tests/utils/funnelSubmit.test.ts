import { describe, it, expect } from 'vitest';
import { computeFunnelPaths } from '../../src/utils/funnelSubmit';
import type { SavedReport } from '../../src/types/savedReports';
import type {
  CalculationResult,
  SensitivityAnalysis,
  SensitivityScenario,
  SensitivityVariant,
} from '../../src/types';

function makeVariant(netCost: number, savings: number, batteryKwh: number, batteryFactor: 0 | 0.5 | 1.0 | 2.0): SensitivityVariant {
  return {
    batteryFactor,
    batterySizeKwh: batteryKwh,
    systemCost: netCost + 1000,
    netCost,
    annualSavings: savings,
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
  };
}

function makeScenario(kwp: number, factor: number, savings: number): SensitivityScenario {
  return {
    scaleFactor: factor,
    annualGenerationKwh: 1000 * kwp,
    systemSizeKwp: kwp,
    noBattery: makeVariant(5000 * factor, savings * 0.6, 0, 0),
    halfBattery: makeVariant(7000 * factor, savings * 0.8, kwp * 0.5, 0.5),
    fullBattery: makeVariant(9000 * factor, savings, kwp, 1.0),
    doubleBattery: makeVariant(13000 * factor, savings * 1.05, kwp * 2, 2.0),
  };
}

function makeBaseline(annualBill: number): SavedReport {
  // annualBill is split across 12 months equally for the audit.
  const monthly = Array.from({ length: 12 }, () => ({
    monthIndex: 0,
    generation: 0,
    consumption: 0,
    gridImport: 0,
    gridExport: 0,
    selfConsumption: 0,
    baselineCost: annualBill / 12,
    importCost: 0,
    exportRevenue: 0,
    savings: 0,
    debtPayment: 0,
    netOutOfPocket: 0,
  }));

  const sensitivity: SensitivityAnalysis = {
    rows: [
      makeScenario(10, 1.0, annualBill * 0.4),
      makeScenario(20, 2.0, annualBill * 0.7),
      makeScenario(30, 3.0, annualBill * 1.0),
    ],
    note: '',
  };

  const result = {
    sensitivityAnalysis: sensitivity,
    annualGeneration: 0,
    annualSavings: 0,
    audit: { mode: 'hourly', year: 2024, totalHours: 8760, hourly: [], monthly, provenance: {} },
  } as unknown as CalculationResult;

  return {
    id: 'baseline-test',
    name: 'test baseline',
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    config: { businessType: 'hotel' } as never,
    financing: {} as never,
    selectedGrantIds: [],
    trading: {} as never,
    tariffId: 'ei-business-24hr',
    exampleMonths: [],
    tariffConfig: { type: 'preset' } as never,
    curvedMonthlyKwh: Array.from({ length: 12 }, () => 1000),
    estimatedMonthlyBills: Array.from({ length: 12 }, () => annualBill / 12),
    selectedDomesticTariffId: undefined,
    selectedYear: 2024,
    hourlyConsumptionOverride: undefined,
    uploadSummary: undefined,
    result,
    // Standing charge is read from the tariff lookup, not the SavedReport itself.
    // The test uses the real ei-business-24hr tariff (€0.822/day = €300.03/year).
    // Caller may override expected standing charge accordingly.
  };
}

describe('computeFunnelPaths', () => {
  it('scales sensitivity savings linearly with the commodity-only spend ratio', () => {
    // ei-business-24hr standing charge is 0.822 €/day = 300.03 €/year.
    const STANDING_ANNUAL = 0.822 * 365;
    const baselineBill = 24_000; // commodity = 23,700ish
    const baseline = makeBaseline(baselineBill);

    // User spend exactly equal to baseline — scaleFactor should be ~1.0
    const sameSpend = computeFunnelPaths(baseline, baselineBill);
    expect(sameSpend.scaleFactor).toBeCloseTo(1, 2);

    // User spend at half the baseline commodity bill — scaleFactor ~0.5 on the commodity portion only
    const halfSpend = computeFunnelPaths(baseline, baselineBill * 0.5 + STANDING_ANNUAL);
    expect(halfSpend.scaleFactor).toBeCloseTo(0.5, 1);

    // User spend at double the baseline commodity bill
    const doubleSpend = computeFunnelPaths(baseline, baselineBill * 2 - STANDING_ANNUAL);
    expect(doubleSpend.scaleFactor).toBeGreaterThan(1.5);
    expect(doubleSpend.scaleFactor).toBeLessThan(2.5);
  });

  it('throws a user-facing error when spend is below the standing-charge floor', () => {
    const baseline = makeBaseline(24_000);
    expect(() => computeFunnelPaths(baseline, 200)).toThrow(/standing charges/);
  });

  it('returns three paths in ascending target order', () => {
    const baseline = makeBaseline(24_000);
    const { paths } = computeFunnelPaths(baseline, 24_000);
    expect(paths.map((p) => p.targetReductionPct)).toEqual([33, 50, 100]);
  });

  it('throws when the baseline has no sensitivityAnalysis snapshot', () => {
    const baseline = makeBaseline(24_000);
    const broken = { ...baseline, result: undefined };
    expect(() => computeFunnelPaths(broken, 24_000)).toThrow(/sensitivityAnalysis/);
  });
});
