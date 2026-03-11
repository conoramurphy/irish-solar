import { describe, it, expect } from 'vitest';
import grantsData from '../../src/data/grants.json';
import tariffsData from '../../src/data/tariffs.json';
import historicalSolarData from '../../src/data/historical/solar-irradiance.json';
import historicalTariffData from '../../src/data/historical/tariff-history.json';
import { runCalculation } from '../../src/utils/calculations';
import { projectCashFlows } from '../../src/utils/exportRateProjection';

describe('sensitivity analysis (via runCalculation)', () => {
  const makeSolar = (year = 2021) => {
    const timesteps = [];
    const start = Date.UTC(year, 0, 1, 0, 0, 0);
    for (let hour = 0; hour < 8760; hour++) {
      const t = new Date(start + hour * 60 * 60 * 1000);
      const hourOfDay = t.getUTCHours();
      const monthIndex = t.getUTCMonth();
      const day = t.getUTCDate();
      timesteps.push({
        timestamp: t,
        stamp: { year, monthIndex, day, hour: hourOfDay },
        hourKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}`,
        irradianceWm2: hourOfDay >= 8 && hourOfDay < 18 ? 100 : 0,
        sourceIndex: hour
      });
    }
    const totalIrradiance = timesteps.reduce((s, ts) => s + ts.irradianceWm2, 0);
    return { location: 'Test', latitude: 0, longitude: 0, elevation: 0, year, timesteps, totalIrradiance };
  };

  const baseConfig = {
    annualProductionKwh: 25000,
    batterySizeKwh: 10,
    installationCost: 40_000,
    location: 'Dublin',
    businessType: 'hotel' as const,
    systemSizeKwp: 25
  };

  it('produces sensitivity analysis with expected structure', () => {
    const result = runCalculation(
      baseConfig,
      [grantsData[0] as any],
      { equity: 15_000, interestRate: 0.05, termYears: 10 },
      tariffsData[0] as any,
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined,
      makeSolar()
    );

    expect(result.sensitivityAnalysis).toBeDefined();
    const sens = result.sensitivityAnalysis!;
    expect(sens.rows).toBeDefined();
    expect(sens.rows.length).toBeGreaterThan(0);
    expect(sens.note).toBeDefined();

    const row = sens.rows[0];
    expect(row).toHaveProperty('scaleFactor');
    expect(row).toHaveProperty('annualGenerationKwh');
    expect(row).toHaveProperty('systemSizeKwp');
    expect(row).toHaveProperty('noBattery');
    expect(row).toHaveProperty('halfBattery');
    expect(row).toHaveProperty('fullBattery');
    expect(row).toHaveProperty('doubleBattery');

    const variant = row.noBattery;
    expect(variant).toHaveProperty('irr');
    expect(variant).toHaveProperty('year1NetCashFlow');
    expect(variant).toHaveProperty('year10NetCashFlow');
    expect(variant).toHaveProperty('equityAmount');
    expect(variant).toHaveProperty('netCost');
    expect(variant).toHaveProperty('annualSavings');
    expect(variant).toHaveProperty('spillageFraction');
  });

  it('every sensitivity cell has finite IRR when equity > 0', () => {
    const result = runCalculation(
      baseConfig,
      [grantsData[0] as any],
      { equity: 10_000, interestRate: 0.05, termYears: 8 },
      tariffsData[0] as any,
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined,
      makeSolar()
    );

    if (!result.sensitivityAnalysis) return;

    const sens = result.sensitivityAnalysis;
    const variants = sens.rows.flatMap((r) => [r.noBattery, r.halfBattery, r.fullBattery, r.doubleBattery]);
    for (const v of variants) {
      expect(Number.isFinite(v.irr), `IRR should be finite for variant (equity ${v.equityAmount})`).toBe(true);
    }
  });

  it('every sensitivity cell has finite IRR when equity is 0 (100% financed)', () => {
    const result = runCalculation(
      baseConfig,
      [grantsData[0] as any],
      { equity: 0, interestRate: 0.05, termYears: 15 },
      tariffsData[0] as any,
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined,
      makeSolar()
    );

    expect(result.simplePayback).toBeNaN();
    expect(Number.isFinite(result.irr)).toBe(true);

    if (!result.sensitivityAnalysis) return;

    const sens = result.sensitivityAnalysis;
    const variants = sens.rows.flatMap((r) => [r.noBattery, r.halfBattery, r.fullBattery, r.doubleBattery]);
    for (const v of variants) {
      expect(v.equityAmount).toBe(0);
      expect(Number.isFinite(v.irr), 'IRR should be finite when 100% financed (uses net cost)').toBe(true);
    }
  });

  it('current-size sensitivity cell IRR is consistent with projectCashFlows for same inputs', () => {
    const result = runCalculation(
      baseConfig,
      [grantsData[0] as any],
      { equity: 12_000, interestRate: 0.05, termYears: 10 },
      tariffsData[0] as any,
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined,
      makeSolar()
    );

    if (!result.sensitivityAnalysis) return;

    const currentRow = result.sensitivityAnalysis.rows.find((r) => Math.abs(r.scaleFactor - 1.0) < 0.01);
    if (!currentRow) return;

    const variant = currentRow.fullBattery;
    const baseCalendarYear = result.audit?.year ?? result.inputsUsed?.simulation?.year ?? 2021;

    const proj = projectCashFlows({
      year1OperationalSavings: variant.annualSavings,
      year1ExportRevenue: variant.year1ExportRevenue,
      year1TaxSavings: result.year1TaxSavings ?? 0,
      baseGeneration: variant.annualGenerationKwh,
      annualLoanPayment: variant.annualLoanPayment,
      loanTermYears: variant.loanTermYears,
      equityAmount: variant.equityAmount,
      effectiveNetCost: result.effectiveNetCost ?? result.netCost,
      analysisYears: 25,
      applyFutureRateChanges: false,
      baseCalendarYear,
    });

    expect(Number.isFinite(variant.irr)).toBe(true);
    expect(Number.isFinite(proj.irr)).toBe(true);
    expect(variant.irr).toBeCloseTo(proj.irr, 2);
  });
});
