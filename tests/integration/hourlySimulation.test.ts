import { describe, it, expect } from 'vitest';
import { runCalculation } from '../../src/utils/calculations';
import { parseSolarTimeseriesCSV } from '../../src/utils/solarTimeseriesParser';
import type { ConsumptionProfile, Tariff } from '../../src/types';

describe('Hourly Simulation Integration Tests', () => {
  const testTariff: Tariff = {
    id: 'test-tou',
    supplier: 'Test',
    product: 'Test TOU',
    type: 'time-of-use',
    standingCharge: 1.0,
    rates: [
      { period: 'night', hours: '23:00-08:00', rate: 0.15 },
      { period: 'day', hours: '09:00-17:00', rate: 0.30 },
      { period: 'peak', hours: '17:00-19:00,07:00-09:00', rate: 0.40 },
      { period: 'other', rate: 0.25 }
    ],
    exportRate: 0.20,
    psoLevy: 0.02
  };

  const testConsumptionProfile: ConsumptionProfile = {
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      monthIndex,
      totalKwh: 10000 - monthIndex * 200, // Declining consumption
      bucketShares: { night: 0.3, day: 0.5, peak: 0.1, other: 0.1 }
    }))
  };

  // Create minimal mock solar data for testing
  const createMockSolarData = () => {
    const timesteps = [];
    const year = 2020;

    // Build a canonical non-leap-year UTC sequence.
    const start = Date.UTC(year, 0, 1, 0, 0, 0);

    for (let hour = 0; hour < 8760; hour++) {
      const t = new Date(start + hour * 60 * 60 * 1000);
      const hourOfDay = t.getUTCHours();
      const monthIndex = t.getUTCMonth();
      const day = t.getUTCDate();

      // Simple solar curve: generate during daylight hours (8-18)
      const irradiance = hourOfDay >= 8 && hourOfDay < 18
        ? Math.max(0, 500 * Math.sin(((hourOfDay - 8) / 10) * Math.PI))
        : 0;

      timesteps.push({
        timestamp: t,
        stamp: { year, monthIndex, day, hour: hourOfDay },
        hourKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}`,
        irradianceWm2: irradiance,
        sourceIndex: hour
      });
    }

    const totalIrradiance = timesteps.reduce((sum, ts) => sum + ts.irradianceWm2, 0);

    return {
      location: 'Test',
      latitude: 53.0,
      longitude: -6.0,
      elevation: 100,
      year,
      timesteps,
      totalIrradiance
    };
  };

  it('should use hourly simulation when solar timeseries data is provided', () => {
    const solarData = createMockSolarData();
    
    const result = runCalculation(
      {
        annualProductionKwh: 22500,
        batterySizeKwh: 10,
        installationCost: 35000,
        location: 'Test',
        businessType: 'hotel'
      },
      [],
      { equity: 15000, interestRate: 0.05, termYears: 10 },
      testTariff,
      { enabled: false },
      {} as any,
      [] as any,
      25,
      testConsumptionProfile,
      solarData
    );

    // Should produce valid results
    expect(result.annualGeneration).toBe(22500);
    expect(result.annualSelfConsumption).toBeGreaterThan(0);
    expect(result.annualExport).toBeGreaterThanOrEqual(0);
    expect(result.annualSavings).toBeGreaterThan(0);
    
    // Self consumption + export should equal generation
    expect(result.annualSelfConsumption + result.annualExport).toBeCloseTo(22500, 1);
  });

  it('should throw when solar timeseries data is not provided (no monthly fallback)', () => {
    expect(() =>
      runCalculation(
        {
          annualProductionKwh: 22500,
          batterySizeKwh: 10,
          installationCost: 35000,
          location: 'Test',
          businessType: 'hotel'
        },
        [],
        { equity: 15000, interestRate: 0.05, termYears: 10 },
        testTariff,
        { enabled: false },
        {} as any,
        [] as any,
        25,
        testConsumptionProfile
        // No solar timeseries data
      )
    ).toThrow();
  });

  it('should apply degradation correctly over multiple years', () => {
    const solarData = createMockSolarData();
    
    const result = runCalculation(
      {
        annualProductionKwh: 10000,
        batterySizeKwh: 10,
        installationCost: 20000,
        location: 'Test',
        businessType: 'hotel'
      },
      [],
      { equity: 20000, interestRate: 0, termYears: 0 },
      testTariff,
      { enabled: false },
      {} as any,
      [] as any,
      5,
      testConsumptionProfile,
      solarData
    );

    // Year 1 should have full generation
    expect(result.cashFlows[0].generation).toBeCloseTo(10000, 1);
    
    // Year 5 should have degraded generation (0.5% per year)
    const expectedYear5 = 10000 * Math.pow(0.995, 4); // 4 years of degradation
    expect(result.cashFlows[4].generation).toBeCloseTo(expectedYear5, 1);
    
    // Each year should have less generation than previous
    for (let i = 1; i < result.cashFlows.length; i++) {
      expect(result.cashFlows[i].generation).toBeLessThan(result.cashFlows[i-1].generation);
    }
  });

  it('should handle edge case: no consumption', () => {
    const solarData = createMockSolarData();
    const noConsumption: ConsumptionProfile = {
      months: Array.from({ length: 12 }, (_, monthIndex) => ({
        monthIndex,
        totalKwh: 0,
        bucketShares: { day: 1.0 }
      }))
    };

    const result = runCalculation(
      {
        annualProductionKwh: 10000,
        batterySizeKwh: 0,
        installationCost: 20000,
        location: 'Test',
        businessType: 'hotel'
      },
      [],
      { equity: 20000, interestRate: 0, termYears: 0 },
      testTariff,
      { enabled: false },
      {} as any,
      [] as any,
      1,
      noConsumption,
      solarData
    );

    // All generation should be exported
    expect(result.annualExport).toBeCloseTo(10000, 1);
    expect(result.annualSelfConsumption).toBe(0);
  });

  it('should handle leap year with 8784 hours', () => {
    // Create mock leap year solar data (2020)
    const timesteps = [];
    const year = 2020; // Leap year

    const start = Date.UTC(year, 0, 1, 0, 0, 0);

    for (let hour = 0; hour < 8784; hour++) {
      const t = new Date(start + hour * 60 * 60 * 1000);
      const hourOfDay = t.getUTCHours();
      const monthIndex = t.getUTCMonth();
      const day = t.getUTCDate();

      const irradiance = hourOfDay >= 8 && hourOfDay < 18
        ? Math.max(0, 500 * Math.sin(((hourOfDay - 8) / 10) * Math.PI))
        : 0;

      timesteps.push({
        timestamp: t,
        stamp: { year, monthIndex, day, hour: hourOfDay },
        hourKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}`,
        irradianceWm2: irradiance,
        sourceIndex: hour
      });
    }

    const totalIrradiance = timesteps.reduce((sum, ts) => sum + ts.irradianceWm2, 0);
    const leapYearData = {
      location: 'Test',
      latitude: 53.0,
      longitude: -6.0,
      elevation: 100,
      year,
      timesteps,
      totalIrradiance
    };

    const result = runCalculation(
      {
        annualProductionKwh: 22500,
        batterySizeKwh: 10,
        installationCost: 35000,
        location: 'Test',
        businessType: 'hotel'
      },
      [],
      { equity: 15000, interestRate: 0.05, termYears: 10 },
      testTariff,
      { enabled: false },
      {} as any,
      [] as any,
      25,
      testConsumptionProfile,
      leapYearData
    );

    // Should handle leap year successfully
    expect(result.annualGeneration).toBe(22500);
    expect(result.audit).toBeDefined();
    expect(result.audit?.totalHours).toBe(8784);
    expect(result.audit?.year).toBe(2020);

    // Verify Feb 29 is included in hourly data
    const feb29Hours = result.audit?.hourly.filter(h => 
      h.monthIndex === 1 && h.hourKey?.includes('-02-29')
    );
    expect(feb29Hours?.length).toBe(24); // 24 hours for Feb 29
  });

  it('should handle edge case: no solar generation', () => {
    const solarData = createMockSolarData();

    const result = runCalculation(
      {
        annualProductionKwh: 0,
        batterySizeKwh: 0, // No battery to avoid optimization charging/discharging
        installationCost: 20000,
        location: 'Test',
        businessType: 'hotel'
      },
      [],
      { equity: 20000, interestRate: 0, termYears: 0 },
      testTariff,
      { enabled: false },
      {} as any,
      [] as any,
      1,
      testConsumptionProfile,
      solarData
    );

    // No self-consumption or exports (no solar, no battery)
    expect(result.annualGeneration).toBe(0);
    expect(result.annualSelfConsumption).toBe(0);
    expect(result.annualExport).toBe(0);
  });

  it('should preserve annual totals across hourly simulation', () => {
    const solarData = createMockSolarData();
    const annualProduction = 25000;

    const result = runCalculation(
      {
        annualProductionKwh: annualProduction,
        batterySizeKwh: 20,
        installationCost: 35000,
        location: 'Test',
        businessType: 'hotel'
      },
      [],
      { equity: 35000, interestRate: 0, termYears: 0 },
      testTariff,
      { enabled: false },
      {} as any,
      [] as any,
      1,
      testConsumptionProfile,
      solarData
    );

    // Year 1 generation should match input (no degradation yet)
    expect(result.cashFlows[0].generation).toBeCloseTo(annualProduction, 1);
    
    // Self-consumption + exports should equal generation
    const totalUsed = result.annualSelfConsumption + result.annualExport;
    expect(totalUsed).toBeCloseTo(annualProduction, 1);
  });
});
