import { describe, expect, it } from 'vitest';
import grantsData from '../../src/data/grants.json';
import tariffsData from '../../src/data/tariffs.json';
import historicalSolarData from '../../src/data/historical/solar-irradiance.json';
import historicalTariffData from '../../src/data/historical/tariff-history.json';
import { runCalculation } from '../../src/utils/calculations';
import type { ParsedSolarData } from '../../src/utils/solarTimeseriesParser';
import type { ParsedPriceData } from '../../src/utils/priceTimeseriesParser';

describe('Market Analysis Integration', () => {
  const makeSolar = (year = 2024): ParsedSolarData => {
    const timesteps = [];
    const start = Date.UTC(year, 0, 1, 0, 0, 0);
    // 2024 is a leap year (8784 hours)
    const hoursInYear = year % 4 === 0 ? 8784 : 8760;
    
    for (let hour = 0; hour < hoursInYear; hour++) {
      const t = new Date(start + hour * 60 * 60 * 1000);
      const hourOfDay = t.getUTCHours();
      const monthIndex = t.getUTCMonth();
      const day = t.getUTCDate();
      timesteps.push({
        timestamp: t,
        stamp: { year, monthIndex, day, hour: hourOfDay },
        hourKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}`,
        irradianceWm2: hourOfDay >= 8 && hourOfDay < 18 ? 200 : 0,
        sourceIndex: hour
      });
    }
    const totalIrradiance = timesteps.reduce((s, ts) => s + ts.irradianceWm2, 0);
    return { 
        year, 
        timesteps,
        meta: {
            location: 'Test',
            lat: 53,
            lon: -6,
            startYear: year,
            endYear: year,
            source: 'Mock'
        }
    };
  };

  const makePrices = (year = 2024): ParsedPriceData => {
    const timesteps = [];
    const start = Date.UTC(year, 0, 1, 0, 0, 0);
    const hoursInYear = year % 4 === 0 ? 8784 : 8760;

    for (let hour = 0; hour < hoursInYear; hour++) {
      const t = new Date(start + hour * 60 * 60 * 1000);
      const hourOfDay = t.getUTCHours();
      const monthIndex = t.getUTCMonth();
      const day = t.getUTCDate();
      
      // Variable price pattern: 
      // Night (0-7): Low (0.05)
      // Morning Peak (8-10): High (0.25)
      // Day (11-16): Medium (0.15)
      // Evening Peak (17-20): High (0.30)
      // Night (21-23): Low (0.08)
      let price = 0.10;
      if (hourOfDay < 7) price = 0.05;
      else if (hourOfDay < 11) price = 0.25;
      else if (hourOfDay < 17) price = 0.15;
      else if (hourOfDay < 21) price = 0.30;
      else price = 0.08;

      // Add some random noise to ensure uniqueness/realism
      price += (hour % 10) * 0.001;

      timesteps.push({
        timestamp: t,
        stamp: { year, monthIndex, day, hour: hourOfDay },
        hourKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}`,
        priceEur: price,
        sourceIndex: hour
      });
    }

    return {
      year,
      timesteps
    };
  };

  it('includes marketPrice in audit hourly data when trading is enabled', () => {
    const year = 2024;
    const solarData = makeSolar(year);
    const priceData = makePrices(year);

    const result = runCalculation(
      {
        annualProductionKwh: 10000,
        batterySizeKwh: 5,
        installationCost: 15000,
        location: 'Dublin',
        businessType: 'hotel',
        systemSizeKwp: 10
      },
      [grantsData[0]],
      {
        equity: 5000,
        interestRate: 0.05,
        termYears: 10
      },
      tariffsData[0],
      { 
          enabled: true,
          importMargin: 0.02,
          exportMargin: 0.02,
          hoursWindow: 4
      },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined, // Default consumption
      solarData,
      priceData
    );

    expect(result.audit).toBeDefined();
    expect(result.audit?.hourly).toBeDefined();
    expect(result.audit?.hourly.length).toBe(8784); // Leap year

    // Check first hour
    // Note: prices are EUR/MWh in raw data, but converted to EUR/kWh for calculations.
    const firstHour = result.audit!.hourly[0];
    expect(firstHour.marketPrice).toBeDefined();
    expect(firstHour.marketPrice).toBeCloseTo(0.05 / 1000, 5);

    // Check peak hour (hour 18 => 6pm)
    const peakHour = result.audit!.hourly[18];
    expect(peakHour.marketPrice).toBeDefined();
    expect(peakHour.marketPrice).toBeCloseTo(0.30 / 1000, 4);
  });

  it('does NOT include marketPrice when trading is disabled', () => {
    const year = 2024;
    const solarData = makeSolar(year);
    // Even if price data is provided, if trading is disabled, it shouldn't be used (or at least logic implies it might not be)
    // Actually, looking at calculations.ts:
    // if (trading.enabled && priceTimeseriesData) { ... set hourlyPrices ... }
    // So marketPrice should be undefined.
    const priceData = makePrices(year);

    const result = runCalculation(
      {
        annualProductionKwh: 10000,
        batterySizeKwh: 5,
        installationCost: 15000,
        location: 'Dublin',
        businessType: 'hotel',
        systemSizeKwp: 10
      },
      [grantsData[0]],
      {
        equity: 5000,
        interestRate: 0.05,
        termYears: 10
      },
      tariffsData[0],
      { 
          enabled: false // DISABLED
      },
      historicalSolarData as any,
      historicalTariffData as any,
      25,
      undefined,
      solarData,
      priceData
    );

    expect(result.audit).toBeDefined();
    const firstHour = result.audit!.hourly[0];
    expect(firstHour.marketPrice).toBeUndefined();
  });
});
