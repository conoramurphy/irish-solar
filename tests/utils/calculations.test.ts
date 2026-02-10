import { describe, expect, it } from 'vitest';
import grantsData from '../../src/data/grants.json';
import tariffsData from '../../src/data/tariffs.json';
import historicalSolarData from '../../src/data/historical/solar-irradiance.json';
import historicalTariffData from '../../src/data/historical/tariff-history.json';
import { runCalculation } from '../../src/utils/calculations';
import { calculateLoanPayment } from '../../src/models/financial';
import { calculateGrantAmount } from '../../src/models/grants';

describe('runCalculation', () => {
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

  it('produces a result with expected shape', () => {
    const result = runCalculation(
      {
        annualProductionKwh: 22500,
        batterySizeKwh: 10,
        installationCost: 35_000,
        location: 'Dublin',
        businessType: 'hotel',
        systemSizeKwp: 30
      },
      [grantsData[0]],
      {
        equity: 15_000,
        interestRate: 0.05,
        termYears: 10
      },
      tariffsData[0],
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined,
      makeSolar()
    );

    // Audit monthly should include Year-1 debt payment allocation.
    expect(result.audit?.monthly).toHaveLength(12);
    const systemCost = 35_000;
    const { totalGrant } = calculateGrantAmount(systemCost, [grantsData[0] as any], { systemSizeKwp: 30 });
    const netCost = systemCost - totalGrant;
    const loanAmount = Math.max(0, netCost - 15_000);
    const annualLoanPayment = calculateLoanPayment(loanAmount, 0.05, 10);
    const expectedMonthlyDebt = annualLoanPayment / 12;

    for (const m of result.audit!.monthly) {
      expect(m.debtPayment).toBeCloseTo(expectedMonthlyDebt, 8);
      expect(m.netOutOfPocket).toBeCloseTo(m.savings - expectedMonthlyDebt, 8);
    }

    expect(result.systemCost).toBe(35_000);
    expect(result.netCost).toBeLessThanOrEqual(result.systemCost);
    expect(result.annualGeneration).toBeGreaterThan(0);
    expect(result.annualSelfConsumption).toBeGreaterThanOrEqual(0);
    expect(result.annualExport).toBeGreaterThanOrEqual(0);
    expect(result.cashFlows).toHaveLength(25);

    // Invariants
    expect(result.cashFlows[0].year).toBe(1);
    expect(result.cashFlows.at(-1)?.year).toBe(25);

    // Cumulative should update by yearly netCashFlow.
    for (let i = 1; i < result.cashFlows.length; i++) {
      const prev = result.cashFlows[i - 1];
      const curr = result.cashFlows[i];
      expect(curr.cumulativeCashFlow).toBeCloseTo(prev.cumulativeCashFlow + curr.netCashFlow, 8);
    }
  });

  it('clamps negative installation cost to 0', () => {
    const result = runCalculation(
      {
        annualProductionKwh: 22500,
        batterySizeKwh: 0,
        installationCost: -100,
        location: 'Dublin',
        businessType: 'hotel'
      },
      [],
      { equity: 0, interestRate: 0.05, termYears: 10 },
      tariffsData[0],
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      5,
      undefined,
      makeSolar()
    );

    expect(result.systemCost).toBe(0);
    expect(result.netCost).toBe(0);
  });

  it('battery size increases self-consumption (captures some would-be exports to offset night imports)', () => {
    const consumptionProfile = {
      months: Array.from({ length: 12 }, (_, monthIndex) => ({
        monthIndex,
        totalKwh: 1500,
        bucketShares: { night: 0.6, day: 0.3, peak: 0.05, other: 0.05 }
      }))
    };

    const base = runCalculation(
      { annualProductionKwh: 25_000, batterySizeKwh: 0, installationCost: 10_000, location: 'Dublin', businessType: 'hotel' },
      [],
      { equity: 10_000, interestRate: 0.05, termYears: 0 },
      tariffsData[1],
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      1,
      consumptionProfile as any,
      makeSolar()
    );

    const withBattery = runCalculation(
      { annualProductionKwh: 25_000, batterySizeKwh: 20, installationCost: 10_000, location: 'Dublin', businessType: 'hotel' },
      [],
      { equity: 10_000, interestRate: 0.05, termYears: 0 },
      tariffsData[1],
      { enabled: false },
      historicalSolarData as any,
      historicalTariffData as any,
      1,
      consumptionProfile as any,
      makeSolar()
    );

    expect(withBattery.annualSelfConsumption).toBeGreaterThan(base.annualSelfConsumption);
  });

  describe('empty/zero consumption edge cases', () => {
    it('handles completely zero consumption profile', () => {
      const zeroConsumption = {
        months: Array.from({ length: 12 }, (_, monthIndex) => ({
          monthIndex,
          totalKwh: 0,
          bucketShares: { 'all-day': 1.0 }
        }))
      };

      const result = runCalculation(
        {
          annualProductionKwh: 20_000,
          batterySizeKwh: 0,
          installationCost: 30_000,
          location: 'Test',
          businessType: 'hotel'
        },
        [],
        { equity: 30_000, interestRate: 0, termYears: 0 },
        tariffsData[0],
        { enabled: false },
        historicalSolarData as any,
        historicalTariffData as any,
        5,
        zeroConsumption as any,
        makeSolar()
      );

      // With zero consumption, all generation should be exported
      expect(result.annualSelfConsumption).toBe(0);
      expect(result.annualExport).toBeCloseTo(20_000, 0);
      expect(result.annualSavings).toBeGreaterThan(0); // From exports
    });

    it('handles undefined consumption profile', () => {
      const result = runCalculation(
        {
          annualProductionKwh: 20_000,
          batterySizeKwh: 0,
          installationCost: 30_000,
          location: 'Test',
          businessType: 'hotel'
        },
        [],
        { equity: 30_000, interestRate: 0, termYears: 0 },
        tariffsData[0],
        { enabled: false },
        historicalSolarData as any,
        historicalTariffData as any,
        5,
        undefined,
        makeSolar()
      );

      // Should default to zero consumption and export all generation
      expect(result.annualSelfConsumption).toBe(0);
      expect(result.annualExport).toBeCloseTo(20_000, 0);
    });

    it('handles empty months array in consumption profile', () => {
      const emptyProfile = { months: [] };

      const result = runCalculation(
        {
          annualProductionKwh: 20_000,
          batterySizeKwh: 0,
          installationCost: 30_000,
          location: 'Test',
          businessType: 'hotel'
        },
        [],
        { equity: 30_000, interestRate: 0, termYears: 0 },
        tariffsData[0],
        { enabled: false },
        historicalSolarData as any,
        historicalTariffData as any,
        5,
        emptyProfile as any,
        makeSolar()
      );

      // Should normalize to 12 months of zero consumption
      expect(result.annualSelfConsumption).toBe(0);
      expect(result.annualExport).toBeCloseTo(20_000, 0);
    });

    it('handles consumption profile with some zero months', () => {
      const mixedProfile = {
        months: Array.from({ length: 12 }, (_, monthIndex) => ({
          monthIndex,
          totalKwh: monthIndex < 6 ? 1000 : 0, // First half has consumption, second half zero
          bucketShares: { 'all-day': 1.0 }
        }))
      };

      const result = runCalculation(
        {
          annualProductionKwh: 20_000,
          batterySizeKwh: 0,
          installationCost: 30_000,
          location: 'Test',
          businessType: 'hotel'
        },
        [],
        { equity: 30_000, interestRate: 0, termYears: 0 },
        tariffsData[0],
        { enabled: false },
        historicalSolarData as any,
        historicalTariffData as any,
        5,
        mixedProfile as any,
        makeSolar()
      );

      // Should handle mixed consumption gracefully
      expect(result.annualSelfConsumption).toBeGreaterThan(0);
      expect(result.annualExport).toBeGreaterThan(0);
      expect(result.annualSelfConsumption + result.annualExport).toBeCloseTo(20_000, 0);
    });
  });
});
