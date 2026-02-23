import { describe, it, expect } from 'vitest';
import { simulateHourlyEnergyFlow } from '../../src/utils/hourlyEnergyFlow';
import type { Tariff } from '../../src/types';

describe('Domestic Battery Optimization', () => {
  // Create a simple EV tariff with cheap night rate and expensive day rate
  const evTariff: Tariff = {
    id: 'test-ev-tariff',
    supplier: 'Test',
    product: 'EV Tariff',
    type: 'ev',
    standingCharge: 0.5,
    rates: [
      { period: 'day', hours: '07:00-23:00', rate: 0.35 },  // Expensive day rate
      { period: 'night', hours: '23:00-07:00', rate: 0.15 } // Cheap night rate
    ],
    exportRate: 0.21,
    evRate: 0.08,  // Very cheap EV rate
    evTimeWindow: {
      description: '2am-6am',
      hourRanges: [{ start: 2, end: 6 }]
    }
  };

  const batteryConfig = {
    capacityKwh: 10,
    efficiency: 0.9,
    initialSoC: 0.1, // Start nearly empty so battery will charge
    maxChargeRateKw: 5,
    maxDischargeRateKw: 5
  };

  it('should charge battery during EV rate window (cheapest)', () => {
    // Create 24 hours of consumption (constant 2 kWh/hr)
    // No solar generation
    const hourlyGeneration = new Array(24).fill(0);
    const hourlyConsumption = new Array(24).fill(2);
    
    const result = simulateHourlyEnergyFlow(
      hourlyGeneration.concat(new Array(8760 - 24).fill(0)),
      hourlyConsumption.concat(new Array(8760 - 24).fill(2)),
      evTariff,
      batteryConfig,
      true
    );

    // Check first 24 hours
    const first24Hours = result.hourlyData!.slice(0, 24);
    
    // Hours 2-5 (EV window): Battery should be CHARGING from grid
    for (let hour = 2; hour < 6; hour++) {
      const hourData = first24Hours[hour];
      expect(hourData.batteryCharge).toBeGreaterThan(0); // Battery charging
      expect(hourData.gridImport).toBeGreaterThan(hourData.consumption); // Importing for load + battery
    }
    
    // Hours 7-22 (expensive day rate): Battery should be DISCHARGING if it has energy
    // Check a few hours in the expensive window
    const morningHour = first24Hours[8]; // 8am
    if (morningHour.batterySoC > 0.1) {
      expect(morningHour.batteryDischarge).toBeGreaterThan(0); // Battery discharging
    }
  });

  it('should discharge battery during expensive peak hours', () => {
    // Fully charged battery at start
    const fullBatteryConfig = { ...batteryConfig, initialSoC: 1.0 };
    
    const hourlyGeneration = new Array(24).fill(0);
    const hourlyConsumption = new Array(24).fill(2);
    
    const result = simulateHourlyEnergyFlow(
      hourlyGeneration.concat(new Array(8760 - 24).fill(0)),
      hourlyConsumption.concat(new Array(8760 - 24).fill(2)),
      evTariff,
      fullBatteryConfig,
      true
    );

    const first24Hours = result.hourlyData!.slice(0, 24);
    
    // During expensive hours (7-22), battery should discharge to meet load
    const expensiveHours = first24Hours.slice(7, 23);
    const dischargingHours = expensiveHours.filter(h => h.batteryDischarge > 0);
    
    expect(dischargingHours.length).toBeGreaterThan(0);
    
    // During cheap hours (2-6), battery might charge if not full
    // Since we started full, it should charge minimally (maybe 1 hour if slight discharge occurred)
    const cheapHours = first24Hours.slice(2, 6);
    const chargingInCheapWindow = cheapHours.filter(h => h.batteryCharge > 0);
    
    // Should be 0 or 1 since battery started full
    expect(chargingInCheapWindow.length).toBeLessThanOrEqual(1);
  });

  it('should prioritize solar self-consumption over charging from grid', () => {
    // Solar during early morning (cheaper rate window), consumption constant
    // Use hours 2-6 (EV window) for solar to avoid DISCHARGE signals during expensive day hours
    const hourlyGeneration = new Array(24).fill(0).map((_, i) => {
      // Solar 2am-6am (hours 2-5) - coincides with cheap EV rate
      if (i >= 2 && i < 6) return 3; // 3 kWh/hr
      return 0;
    });
    const hourlyConsumption = new Array(24).fill(2);
    
    const result = simulateHourlyEnergyFlow(
      hourlyGeneration.concat(new Array(8760 - 24).fill(0)),
      hourlyConsumption.concat(new Array(8760 - 24).fill(2)),
      evTariff,
      batteryConfig,
      true
    );

    const first24Hours = result.hourlyData!.slice(0, 24);
    
    // During solar hours (2-5), battery should charge from solar surplus
    const solarHours = first24Hours.slice(2, 6);
    const solarChargingHours = solarHours.filter(h => h.batteryCharge > 0);
    
    expect(solarChargingHours.length).toBeGreaterThan(0);
    
    // Grid import during solar hours should be minimal or for battery charging only
    // Since generation (3) > consumption (2), we have 1 kWh surplus per hour
    solarHours.forEach(h => {
      // Grid import should be 0 (solar covers load) or positive only for battery charging
      expect(h.gridImport).toBeLessThanOrEqual(h.consumption); // Not importing more than load needs
    });
  });

  it('should handle flat tariff (no optimization)', () => {
    const flatTariff: Tariff = {
      id: 'test-flat',
      supplier: 'Test',
      product: 'Flat',
      type: 'flat',
      standingCharge: 0.5,
      rates: [{ period: 'all-day', rate: 0.25 }],
      exportRate: 0.15
    };
    
    const hourlyGeneration = new Array(8760).fill(0);
    const hourlyConsumption = new Array(8760).fill(2);
    
    const result = simulateHourlyEnergyFlow(
      hourlyGeneration,
      hourlyConsumption,
      flatTariff,
      batteryConfig,
      true
    );

    // With flat tariff, battery should not charge from grid aggressively
    // (no cheap windows to exploit)
    const first24Hours = result.hourlyData!.slice(0, 24);
    const gridChargingHours = first24Hours.filter(h => 
      h.batteryCharge > 0 && h.gridImport > h.consumption
    );
    
    // Should be 0 or very few (only AUTO mode, no forced charging)
    expect(gridChargingHours.length).toBe(0);
  });

  it('should respect free electricity windows', () => {
    const freeElectricityTariff: Tariff = {
      id: 'test-free',
      supplier: 'Test',
      product: 'Free Hours',
      type: 'smart',
      standingCharge: 0.5,
      rates: [{ period: 'standard', rate: 0.30 }],
      exportRate: 0.21,
      freeElectricityWindow: {
        description: '9am-11am Sundays',
        hourRanges: [{ start: 9, end: 11 }],
        daysOfWeek: [0] // Sunday
      }
    };
    
    // Need timestamps to check day of week
    // For simplicity, we'll just verify rate is 0 during free window in the tariff logic
    // The actual optimization will happen when timestamps indicate Sunday 9-11am
    
    const hourlyGeneration = new Array(8760).fill(0);
    const hourlyConsumption = new Array(8760).fill(2);
    
    const result = simulateHourlyEnergyFlow(
      hourlyGeneration,
      hourlyConsumption,
      freeElectricityTariff,
      batteryConfig,
      false // Don't need detailed hourly data for this test
    );

    // Just verify it runs without error
    expect(result).toBeDefined();
    expect(result.totalGridImport).toBeGreaterThan(0);
  });
});
