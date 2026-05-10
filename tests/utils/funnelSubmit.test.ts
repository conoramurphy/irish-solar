import { describe, it, expect } from 'vitest';
import {
  computeFunnelPaths,
  buildPersonalisedReport,
  rebuildResultFromSavedReport,
} from '../../src/utils/funnelSubmit';
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
  it('throws a user-facing error when spend is below the standing-charge floor', async () => {
    const baseline = makeBaseline(24_000);
    await expect(computeFunnelPaths(baseline, 200, stubSolarLoader)).rejects.toThrow(/standing charges/);
  });

  it('throws when the baseline has no sensitivityAnalysis snapshot', async () => {
    const baseline = makeBaseline(24_000);
    const broken = { ...baseline, result: undefined };
    await expect(computeFunnelPaths(broken, 24_000, stubSolarLoader)).rejects.toThrow(/sensitivityAnalysis/);
  });

  it('throws when the baseline has no hourlyConsumptionOverride', async () => {
    // Linear-scaling fallback was removed (see AGENTS.md "re-run the engine").
    // A baseline without an hourly profile can't be re-run on user-scaled load,
    // so the funnel must fail loudly rather than producing inflated savings.
    const baseline = makeBaseline(24_000);
    await expect(computeFunnelPaths(baseline, 24_000, stubSolarLoader)).rejects.toThrow(
      /hourlyConsumptionOverride/
    );
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
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
      paths,
      scaleFactor,
    } = await computeFunnelPaths(baseline, 24_000, stubSolarLoader);
    const out = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );
    expect(out.result?.audit?.hourly).toEqual([]);
  });

  it('persists the scaled hourlyConsumptionOverride so the report can be re-rendered later', async () => {
    // Used to drop this field; we now keep it so future engine updates can
    // re-render the report from inputs alone via rebuildResultFromSavedReport.
    const baseline = baselineWithHourly();
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      scaledHourlyConsumption,
      freshDetailResult,
      paths,
      scaleFactor,
    } = await computeFunnelPaths(baseline, 48_000, stubSolarLoader); // ~2x scale
    const out = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );
    expect(out.hourlyConsumptionOverride).toBeDefined();
    expect(out.hourlyConsumptionOverride!.length).toBe(baseline.hourlyConsumptionOverride!.length);
    // Every slot should be `baseline × scaleFactor` (commodity-corrected).
    // Allow 5e-5 tolerance because the persisted values are rounded to 4 dp
    // (0.1 Wh) to keep the payload small.
    const baseSlot = baseline.hourlyConsumptionOverride![0];
    const expected = baseSlot * scaleFactor;
    expect(out.hourlyConsumptionOverride!.every((k) => Math.abs(k - expected) < 5e-5)).toBe(true);
  });

  it('still scales monthly consumption and bills by the scale factor', async () => {
    const baseline = baselineWithHourly();
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
      paths,
      scaleFactor,
    } = await computeFunnelPaths(baseline, 48_000, stubSolarLoader); // ~2x scale
    const out = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );
    // curvedMonthlyKwh is [1000 × 12] in the fixture; scaled by scaleFactor.
    const expectedKwh = 1000 * scaleFactor;
    expect(out.curvedMonthlyKwh.every((k) => Math.abs(k - expectedKwh) < 1e-6)).toBe(true);
    // estimatedMonthlyBills was annualBill / 12 = 2000; scaled by scaleFactor.
    const expectedBill = 2000 * scaleFactor;
    expect(out.estimatedMonthlyBills.every((b) => Math.abs(b - expectedBill) < 1e-6)).toBe(true);
  });


  it('persisted result satisfies annualSavings === solar + battery + export to floating-point precision', async () => {
    // Pre-3d4d8df, the persisted result was approximate (componentScaleFactor ×
    // detailRatio applied to baseline-config components). Now that
    // freshDetailResult is the source of truth, every field comes from the
    // same simulation, so the algebraic identity should hold exactly.
    const baseline = baselineWithHourly();
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
      paths,
      scaleFactor,
    } = await computeFunnelPaths(baseline, 48_000, stubSolarLoader);
    const out = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );

    const r = out.result as CalculationResult;
    const sum =
      (r.annualSolarToLoadSavings ?? 0) +
      (r.annualBatteryToLoadSavings ?? 0) +
      (r.annualExportRevenue ?? 0);

    // Engine produces all four numbers from the same hourly simulation, so the
    // identity holds to floating-point precision.
    expect(Math.abs((r.annualSavings ?? 0) - sum)).toBeLessThan(1e-6);
  });

  it('round-trip: rebuildResultFromSavedReport reproduces the persisted result from inputs alone', async () => {
    // The "all inputs persisted forever" contract: take the SavedReport
    // emitted by buildPersonalisedReport, hand it to rebuildResultFromSavedReport
    // (which knows nothing about the original baseline or the user's spend),
    // and the recomputed result must match the persisted result.
    //
    // This is what makes "I update the engine, all reports refresh cleanly"
    // work — every input runCalculation needs is on the SavedReport.
    const baseline = baselineWithHourly();
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
      paths,
      scaleFactor,
    } = await computeFunnelPaths(baseline, 48_000, stubSolarLoader);
    const persisted = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );

    // Re-run from inputs alone — no baseline, no scaleFactor, no detail-pick.
    const recomputed = await rebuildResultFromSavedReport(persisted, stubSolarLoader);

    const persistedResult = persisted.result as CalculationResult;
    expect(recomputed.annualSavings).toBeCloseTo(persistedResult.annualSavings, 1);
    expect(recomputed.annualSolarToLoadSavings ?? 0).toBeCloseTo(
      persistedResult.annualSolarToLoadSavings ?? 0,
      1
    );
    expect(recomputed.annualBatteryToLoadSavings ?? 0).toBeCloseTo(
      persistedResult.annualBatteryToLoadSavings ?? 0,
      1
    );
    expect(recomputed.annualExportRevenue ?? 0).toBeCloseTo(
      persistedResult.annualExportRevenue ?? 0,
      1
    );
    expect(recomputed.systemCost).toBeCloseTo(persistedResult.systemCost, 1);
    expect(recomputed.netCost).toBeCloseTo(persistedResult.netCost, 1);
  });

  it('round-trip is deterministic — does not depend on system clock', async () => {
    // runCalculation uses solarTimeseriesData.year (or new Date().getFullYear()
    // as fallback). Every persisted report has selectedYear, so round-trip
    // must produce the same numbers regardless of when the test runs.
    const baseline = baselineWithHourly();
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
      paths,
      scaleFactor,
    } = await computeFunnelPaths(baseline, 48_000, stubSolarLoader);
    const persisted = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );

    const a = await rebuildResultFromSavedReport(persisted, stubSolarLoader);
    const b = await rebuildResultFromSavedReport(persisted, stubSolarLoader);
    expect(a.annualSavings).toBe(b.annualSavings);
  });

  it('produces a JSON-serializable payload well under 250KB so Cloudflare accepts the POST', async () => {
    // Mirror the production submitFunnelLead call: pass freshDetailResult and
    // scaledHourlyConsumption so the persisted size reflects what actually
    // goes over the wire (with ~17,520 floats taking realistic space).
    const baseline = baselineWithHourly();
    const {
      scaledSensitivity,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
      paths,
    } = await computeFunnelPaths(baseline, 48_000, stubSolarLoader);
    const out = buildPersonalisedReport(
      baseline,
      2.0,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );
    const size = JSON.stringify(out).length;
    expect(size).toBeLessThan(250_000);
  });
});
