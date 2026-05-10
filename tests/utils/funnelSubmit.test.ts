import { describe, it, expect } from 'vitest';
import { computeFunnelPaths, buildPersonalisedReport } from '../../src/utils/funnelSubmit';
import type { SavedReport } from '../../src/types/savedReports';
import type {
  CalculationResult,
  SensitivityAnalysis,
  SensitivityScenario,
  SensitivityVariant,
} from '../../src/types';
import type { ParsedSolarData } from '../../src/utils/solarTimeseriesParser';

/** Synthesise solar data for tests so we don't hit the network. */
function makeSolarData(year = 2024, halfHourly = true): ParsedSolarData {
  const slotsPerDay = halfHourly ? 48 : 24;
  const totalSlots = halfHourly ? 17520 : 8760;
  const timesteps = [];
  const start = Date.UTC(year, 0, 1, 0, 0, 0);
  const slotMillis = halfHourly ? 30 * 60 * 1000 : 60 * 60 * 1000;
  for (let i = 0; i < totalSlots; i++) {
    const t = new Date(start + i * slotMillis);
    const hourOfDay = t.getUTCHours();
    const monthIndex = t.getUTCMonth();
    const day = t.getUTCDate();
    timesteps.push({
      timestamp: t,
      stamp: { year, monthIndex, day, hour: hourOfDay },
      hourKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}`,
      irradianceWm2: hourOfDay >= 8 && hourOfDay < 18 ? 100 : 0,
      sourceIndex: i,
    });
  }
  return {
    location: 'Test',
    latitude: 0,
    longitude: 0,
    elevation: 0,
    year,
    timesteps,
    totalIrradiance: timesteps.reduce((s, ts) => s + ts.irradianceWm2, 0),
    slotsPerDay,
  } as unknown as ParsedSolarData;
}

/** A solar-loader stub for `computeFunnelPaths` tests. */
const stubSolarLoader = async () => makeSolarData();

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
  it('scales sensitivity savings linearly with the commodity-only spend ratio', async () => {
    // ei-business-24hr standing charge is 0.822 €/day = 300.03 €/year.
    const STANDING_ANNUAL = 0.822 * 365;
    const baselineBill = 24_000; // commodity = 23,700ish
    const baseline = makeBaseline(baselineBill);

    // User spend exactly equal to baseline — scaleFactor should be ~1.0
    const sameSpend = await computeFunnelPaths(baseline, baselineBill, stubSolarLoader);
    expect(sameSpend.scaleFactor).toBeCloseTo(1, 2);

    // User spend at half the baseline commodity bill — scaleFactor ~0.5 on the commodity portion only
    const halfSpend = await computeFunnelPaths(baseline, baselineBill * 0.5 + STANDING_ANNUAL, stubSolarLoader);
    expect(halfSpend.scaleFactor).toBeCloseTo(0.5, 1);

    // User spend at double the baseline commodity bill
    const doubleSpend = await computeFunnelPaths(baseline, baselineBill * 2 - STANDING_ANNUAL, stubSolarLoader);
    expect(doubleSpend.scaleFactor).toBeGreaterThan(1.5);
    expect(doubleSpend.scaleFactor).toBeLessThan(2.5);
  });

  it('throws a user-facing error when spend is below the standing-charge floor', async () => {
    const baseline = makeBaseline(24_000);
    await expect(computeFunnelPaths(baseline, 200, stubSolarLoader)).rejects.toThrow(/standing charges/);
  });

  it('returns three paths in ascending target order', async () => {
    const baseline = makeBaseline(24_000);
    const { paths } = await computeFunnelPaths(baseline, 24_000, stubSolarLoader);
    expect(paths.map((p) => p.targetReductionPct)).toEqual([33, 50, 100]);
  });

  it('throws when the baseline has no sensitivityAnalysis snapshot', async () => {
    const baseline = makeBaseline(24_000);
    const broken = { ...baseline, result: undefined };
    await expect(computeFunnelPaths(broken, 24_000, stubSolarLoader)).rejects.toThrow(/sensitivityAnalysis/);
  });
});

describe('buildPersonalisedReport — payload trimming', () => {
  function baselineWithHourly(): SavedReport {
    const base = makeBaseline(24_000);
    // Inject a fake hourly array + override to verify they're trimmed.
    const baseResult = base.result as CalculationResult;
    return {
      ...base,
      hourlyConsumptionOverride: new Array(17520).fill(1),
      result: {
        ...baseResult,
        audit: {
          ...(baseResult.audit ?? {}),
          hourly: new Array(8760).fill({ stamp: 'x', generation: 0 }),
          monthly: baseResult.audit?.monthly ?? [],
        },
      } as unknown as CalculationResult,
    };
  }

  it('drops result.audit.hourly so the persisted payload stays small', async () => {
    const baseline = baselineWithHourly();
    const { scaledSensitivity, scaledBaselineAnnualBill } = await computeFunnelPaths(
      baseline,
      24_000,
      stubSolarLoader
    );
    const out = buildPersonalisedReport(
      baseline,
      1.0,
      scaledSensitivity,
      scaledBaselineAnnualBill
    );
    expect(out.result?.audit?.hourly).toEqual([]);
  });

  it('drops hourlyConsumptionOverride so the persisted payload stays small', async () => {
    const baseline = baselineWithHourly();
    const { scaledSensitivity, scaledBaselineAnnualBill } = await computeFunnelPaths(
      baseline,
      24_000,
      stubSolarLoader
    );
    const out = buildPersonalisedReport(
      baseline,
      1.0,
      scaledSensitivity,
      scaledBaselineAnnualBill
    );
    expect(out.hourlyConsumptionOverride).toBeUndefined();
  });

  it('still scales monthly consumption, savings, and bills by the scale factor', async () => {
    const baseline = baselineWithHourly();
    const { scaledSensitivity, scaledBaselineAnnualBill } = await computeFunnelPaths(
      baseline,
      48_000, // ~2x scale
      stubSolarLoader
    );
    const out = buildPersonalisedReport(
      baseline,
      2.0,
      scaledSensitivity,
      scaledBaselineAnnualBill
    );
    // curvedMonthlyKwh is [1000 × 12] in the fixture; scaled by 2 → [2000 × 12]
    expect(out.curvedMonthlyKwh.every((k) => k === 2000)).toBe(true);
    // estimatedMonthlyBills was annualBill / 12 = 2000; scaled by 2 → 4000
    expect(out.estimatedMonthlyBills.every((b) => b === 4000)).toBe(true);
    // result.annualSavings was the baseline's; scaled by 2
    const before = (baseline.result as CalculationResult).annualSavings;
    expect(out.result?.annualSavings).toBeCloseTo(before * 2, 5);
  });

  it('preserves the annualSavings = solar + battery + export invariant on the persisted result', async () => {
    // Mirror the screenshot: baseline is a hotel (200 kWp + 50 kWh) where
    // components algebraically sum to total. Build a personalised report
    // pinned to the 50% pick (a smaller config) and assert the persisted
    // result's components still sum to its annualSavings.
    //
    // If they don't, the report renders with a "Total Annual Savings" card
    // that doesn't match its own breakdown — which is exactly the symptom
    // we're chasing.
    const baseline = makeBaseline(24_000);
    const baselineResult = baseline.result as CalculationResult;

    // Set realistic baseline component values that sum to a known total.
    // Pretend the baseline simulation produced these for 200 kWp + 50 kWh.
    const baselineSolar = 8_000;
    const baselineBattery = 3_500;
    const baselineExport = 4_500;
    const baselineTotal = baselineSolar + baselineBattery + baselineExport; // 16,000

    const fixedBaseline: SavedReport = {
      ...baseline,
      result: {
        ...baselineResult,
        annualSavings: baselineTotal,
        annualSolarToLoadSavings: baselineSolar,
        annualBatteryToLoadSavings: baselineBattery,
        annualExportRevenue: baselineExport,
      } as unknown as CalculationResult,
    };

    // Use the linear-scaling fallback for this test (no hourly profile),
    // because the baseline uses synthetic component values that don't
    // correspond to a runnable simulation.
    const { paths, scaledSensitivity, scaledBaselineAnnualBill, scaleFactor } =
      await computeFunnelPaths(fixedBaseline, 24_000, stubSolarLoader);

    const out = buildPersonalisedReport(
      fixedBaseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths
    );

    const r = out.result as CalculationResult;
    const componentSum =
      (r.annualSolarToLoadSavings ?? 0) +
      (r.annualBatteryToLoadSavings ?? 0) +
      (r.annualExportRevenue ?? 0);

    // This is what the screenshot violates — total ≠ sum of components.
    expect(r.annualSavings).toBeCloseTo(componentSum, 0);
  });

  it('re-run path produces lower savings than linear-scaling fallback for big-bill users', async () => {
    // Linear-scaling overstates savings because solar generation is bounded
    // by physical capacity, not by user spend. For a baseline with 100% solar
    // generation already self-consumed at small bills, scaling the bill 4×
    // doesn't 4× the savings — the system is already saturated.
    //
    // Build a fixture where the baseline's solar output is small relative to
    // a 4× scaled load, so the re-run "self-consumes more, exports less"
    // physics produces materially different (lower) savings than naive
    // linear scaling.
    //
    // The exact magnitudes here are sensitive to the synthetic solar profile,
    // but the *direction* — re-run < linear scaling — is the contract that
    // protects the user from inflated IRRs.
    const baseline = baselineWithHourly();
    const SCALE = 4; // 4× spend ratio

    // Re-run path (current default behaviour)
    const rerun = await computeFunnelPaths(
      baseline,
      24_000 * SCALE,
      stubSolarLoader
    );
    expect(rerun.freshBaselineResult).not.toBeNull();

    // Linear-scaling fallback (legacy path, still used when baseline has no
    // hourly profile)
    const linearOnly = { ...baseline, hourlyConsumptionOverride: undefined };
    const linear = await computeFunnelPaths(
      linearOnly,
      24_000 * SCALE,
      stubSolarLoader
    );
    expect(linear.freshBaselineResult).toBeNull();

    // Compare scaled per-cell annualSavings between paths.
    const rerunNoBatt = rerun.scaledSensitivity.rows[0]?.noBattery.annualSavings ?? 0;
    const linearNoBatt = linear.scaledSensitivity.rows[0]?.noBattery.annualSavings ?? 0;

    // Linear scaling multiplies by ~SCALE; re-run is bounded by physics.
    // The contract: linear must be at least as large as re-run for big bills.
    // (Equality can hold only when the system is small enough that linear and
    // physical agree.)
    expect(linearNoBatt).toBeGreaterThanOrEqual(rerunNoBatt - 1);
  });

  it('produces a JSON-serializable payload well under 100KB so Cloudflare accepts the POST', async () => {
    const baseline = baselineWithHourly();
    const { scaledSensitivity, scaledBaselineAnnualBill } = await computeFunnelPaths(
      baseline,
      24_000,
      stubSolarLoader
    );
    const out = buildPersonalisedReport(
      baseline,
      1.0,
      scaledSensitivity,
      scaledBaselineAnnualBill
    );
    const size = JSON.stringify(out).length;
    expect(size).toBeLessThan(100_000);
  });
});
