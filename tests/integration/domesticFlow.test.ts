import { describe, it, expect, vi } from 'vitest';
import { runCalculation } from '../../src/utils/calculations';
import type { SystemConfiguration, Grant, Financing, Tariff, TradingConfig } from '../../src/types';
import { prepareSimulationContext } from '../../src/utils/simulationContext';

// Mock dependencies if needed, but integration test should run real logic
// We need a minimal solar timeseries
const mockSolarTimeseries = {
  year: 2023,
  timesteps: Array.from({ length: 8760 }, (_, i) => ({
    stamp: { year: 2023, monthIndex: Math.floor(i / 730), day: 1, hour: i % 24 }, // Simplified stamp
    irradiance: 100 // Constant irradiance for simplicity
  }))
};

describe('Domestic Mode Integration', () => {
  const config: SystemConfiguration = {
    annualProductionKwh: 5000,
    batterySizeKwh: 8,
    installationCost: 10000,
    location: 'Cavan',
    businessType: 'house',
    systemSizeKwp: 6.4
  };

  const domesticGrant: Grant = {
    id: 'seai-domestic-solar-pv',
    name: 'Domestic Grant',
    type: 'SEAI',
    percentage: 0,
    maxAmount: 1800,
    eligibleFor: ['house'],
    calculation: { method: 'seai-domestic-solar-pv' }
  };

  const financing: Financing = {
    equity: 10000, // Cash purchase
    interestRate: 0,
    termYears: 0,
    isTaxReliefEligible: false
  };

  const tariff: Tariff = {
    id: 'test-tariff',
    supplier: 'Test',
    product: 'Flat',
    type: '24-hour',
    standingCharge: 0.5,
    rates: [{ period: 'all-day', rate: 0.25 }],
    exportRate: 0.15,
    psoLevy: 0
  };

  const trading: TradingConfig = { enabled: false };

  it('runs calculation with hourly consumption override', () => {
    // 1. Create fake hourly consumption (Real Usage)
    // E.g. 1kWh per hour constant
    const realUsage = new Array(8760).fill(1.0);
    const totalUsage = 8760; 

    // 2. Run calculation
    const result = runCalculation(
      config,
      [domesticGrant],
      financing,
      tariff,
      trading,
      {} as any, // Historical data
      [],
      25,
      undefined, // No monthly profile
      mockSolarTimeseries as any,
      undefined,
      realUsage // Pass the override
    );

    // 3. Verify Grants
    // 6.4 kWp > 4kWp.
    // 2kWp * 700 = 1400
    // 2kWp * 200 = 400
    // Total = 1800 (Cap is 1800)
    expect(result.netCost).toBe(10000 - 1800);

    // 4. Verify Consumption used in Audit
    // Since we passed 1.0 kWh/hr, the audit should reflect that
    const firstHour = result.audit?.hourly[0];
    expect(firstHour?.consumption).toBe(1.0);
    
    // Total consumption should match input
    // The engine might have battery activity affecting grid import, 
    // but "consumption" field in audit is usually gross site load.
    // Let's check `result.audit.monthly` sum of consumption
    const totalAuditConsumption = result.audit?.monthly.reduce((sum, m) => sum + m.consumption, 0);
    expect(totalAuditConsumption).toBeCloseTo(8760);
  });

  it('fails if override length is invalid (not 8760 or 8784)', () => {
    const shortUsage = new Array(100).fill(1.0);
    expect(() => {
      runCalculation(
        config,
        [],
        financing,
        tariff,
        trading,
        {} as any,
        [],
        25,
        undefined,
        mockSolarTimeseries as any,
        undefined,
        shortUsage
      );
    }).toThrow(/unexpected length/);
  });
  
  it('auto-normalizes leap year mismatch (8760 -> 8784)', () => {
    // Create leap year solar data
    const leapYearSolar = {
      year: 2020,
      timesteps: Array.from({ length: 8784 }, (_, i) => ({
        stamp: { year: 2020, monthIndex: Math.floor(i / 732), day: 1, hour: i % 24 },
        irradiance: 100
      }))
    };
    
    // Non-leap year consumption data
    const nonLeapUsage = new Array(8760).fill(1.0);
    
    // Should not throw, should auto-normalize
    const result = runCalculation(
      config,
      [],
      financing,
      tariff,
      trading,
      {} as any,
      [],
      25,
      undefined,
      leapYearSolar as any,
      undefined,
      nonLeapUsage
    );
    
    // Verify it ran successfully
    expect(result).toBeDefined();
    expect(result.audit?.totalHours).toBe(8784);
  });
});
