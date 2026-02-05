import { describe, it, expect } from 'vitest';
import {
  simulateHourlyEnergyFlow,
  aggregateHourlyResultsToMonthly,
  type BatteryConfig
} from '../../src/utils/hourlyEnergyFlow';
import type { Tariff } from '../../src/types';

describe('hourlyEnergyFlow', () => {
  const flatTariff: Tariff = {
    id: 'flat',
    supplier: 'Test',
    product: 'Flat',
    type: '24-hour',
    standingCharge: 1.0,
    rates: [{ period: 'all-day', rate: 0.25 }],
    exportRate: 0.20,
    psoLevy: 0.02
  };

  const touTariff: Tariff = {
    id: 'tou',
    supplier: 'Test',
    product: 'TOU',
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

  describe('simulateHourlyEnergyFlow - no battery', () => {
    it('should handle zero generation and consumption', () => {
      const generation = Array(8760).fill(0);
      const consumption = Array(8760).fill(0);

      const result = simulateHourlyEnergyFlow(generation, consumption, flatTariff);

      expect(result.totalGridImport).toBe(0);
      expect(result.totalGridExport).toBe(0);
      expect(result.totalSelfConsumption).toBe(0);
    });

    it('should calculate correct imports when no solar', () => {
      const generation = Array(8760).fill(0);
      const consumption = Array(8760).fill(10); // 10 kWh/hour

      const result = simulateHourlyEnergyFlow(generation, consumption, flatTariff);

      expect(result.totalGridImport).toBe(8760 * 10);
      expect(result.totalGridExport).toBe(0);
      expect(result.totalSelfConsumption).toBe(0);
      expect(result.totalImportCost).toBeGreaterThan(0);
    });

    it('should calculate correct exports when generation exceeds consumption', () => {
      const generation = Array(8760).fill(10);
      const consumption = Array(8760).fill(5);

      const result = simulateHourlyEnergyFlow(generation, consumption, flatTariff);

      expect(result.totalGridImport).toBe(0);
      expect(result.totalGridExport).toBe(8760 * 5); // Export 5 kWh/hour
      expect(result.totalSelfConsumption).toBe(8760 * 5); // Self-consume 5 kWh/hour
      expect(result.totalExportRevenue).toBeGreaterThan(0);
    });

    it('should handle mixed scenarios', () => {
      const generation = Array(8760).fill(0);
      const consumption = Array(8760).fill(0);

      // First 4380 hours: high consumption, no generation (import)
      for (let i = 0; i < 4380; i++) {
        consumption[i] = 10;
        generation[i] = 0;
      }

      // Next 4380 hours: high generation, low consumption (export)
      for (let i = 4380; i < 8760; i++) {
        consumption[i] = 2;
        generation[i] = 8;
      }

      const result = simulateHourlyEnergyFlow(generation, consumption, flatTariff);

      expect(result.totalGridImport).toBeCloseTo(4380 * 10, 1);
      expect(result.totalGridExport).toBeCloseTo(4380 * 6, 1);
      expect(result.totalSelfConsumption).toBeCloseTo(4380 * 2, 1);
    });

    it('should calculate savings correctly', () => {
      const generation = Array(8760).fill(5);
      const consumption = Array(8760).fill(10);

      const result = simulateHourlyEnergyFlow(generation, consumption, flatTariff);

      // With solar: import 5 kWh/hour
      // Without solar: import 10 kWh/hour
      // Savings should be positive
      expect(result.totalSavings).toBeGreaterThan(0);
    });
  });

  describe('simulateHourlyEnergyFlow - with battery', () => {
    it('should charge battery from excess solar', () => {
      const generation = Array(8760).fill(10);
      const consumption = Array(8760).fill(5);
      const battery: BatteryConfig = {
        capacityKwh: 10,
        efficiency: 0.9,
        initialSoC: 0
      };

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        battery,
        true
      );

      // Battery should charge in first hour
      const firstHour = result.hourlyData![0];
      expect(firstHour.batteryCharge).toBeGreaterThan(0);
      expect(firstHour.batterySoC).toBeGreaterThan(0);

      // Once battery is full, should export
      expect(result.totalGridExport).toBeGreaterThan(0);
    });

    it('should discharge battery to meet demand', () => {
      // Setup: charge battery during day, discharge at night
      const generation = Array(8760).fill(0);
      const consumption = Array(8760).fill(0);

      // Day hours: generate 20, consume 5 (charge battery)
      for (let day = 0; day < 365; day++) {
        for (let hour = 8; hour < 18; hour++) {
          const hourIndex = day * 24 + hour;
          generation[hourIndex] = 20;
          consumption[hourIndex] = 5;
        }
        // Night hours: generate 0, consume 5 (discharge battery)
        for (let hour = 0; hour < 8; hour++) {
          const hourIndex = day * 24 + hour;
          generation[hourIndex] = 0;
          consumption[hourIndex] = 5;
        }
      }

      const battery: BatteryConfig = {
        capacityKwh: 50,
        efficiency: 0.9
      };

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        battery,
        true
      );

      // Should have both charging and discharging
      const hasCharge = result.hourlyData!.some(h => h.batteryCharge > 0);
      const hasDischarge = result.hourlyData!.some(h => h.batteryDischarge > 0);

      expect(hasCharge).toBe(true);
      expect(hasDischarge).toBe(true);

      // Grid import should be less than without battery
      const withoutBatteryResult = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff
      );
      expect(result.totalGridImport).toBeLessThan(withoutBatteryResult.totalGridImport);
    });

    it('should respect battery capacity limits', () => {
      const generation = Array(8760).fill(100); // Very high generation
      const consumption = Array(8760).fill(5);
      const battery: BatteryConfig = {
        capacityKwh: 10,
        efficiency: 0.9
      };

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        battery,
        true
      );

      // Battery SoC should never exceed capacity
      const maxSoC = Math.max(...result.hourlyData!.map(h => h.batterySoC));
      expect(maxSoC).toBeLessThanOrEqual(battery.capacityKwh);
    });

    it('should respect battery efficiency', () => {
      const generation = Array(100).fill(10).concat(Array(8660).fill(0));
      const consumption = Array(100).fill(0).concat(Array(8660).fill(5));
      
      const battery: BatteryConfig = {
        capacityKwh: 100,
        efficiency: 0.9,
        initialSoC: 0
      };

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        battery,
        true
      );

      // Check that efficiency is applied
      // 100 hours * 10 kWh = 1000 kWh surplus available
      // Battery capacity is 100 kWh, so it fills up after ~11 hours
      // With 90% efficiency: to store 100 kWh, we need 100/0.9 = 111.1 kWh input
      // So battery fills in first 12 hours, stores 100 kWh (capacity limit)
      const chargedEnergy = result.hourlyData!
        .slice(0, 100)
        .reduce((sum, h) => sum + h.batteryCharge, 0);
      
      // Should store up to battery capacity (100 kWh)
      expect(chargedEnergy).toBeCloseTo(100, 0);
      expect(chargedEnergy).toBeLessThanOrEqual(100);
    });

    it('should not charge battery from grid', () => {
      const generation = Array(8760).fill(0); // No solar
      const consumption = Array(8760).fill(10);
      const battery: BatteryConfig = {
        capacityKwh: 50,
        efficiency: 0.9,
        initialSoC: 0
      };

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        battery,
        true
      );

      // Battery should never charge (no solar)
      const totalCharge = result.hourlyData!.reduce((sum, h) => sum + h.batteryCharge, 0);
      expect(totalCharge).toBe(0);
    });
  });

  describe('simulateHourlyEnergyFlow - time-of-use tariff', () => {
    it('should apply correct rates for different time periods', () => {
      const generation = Array(8760).fill(0);
      const consumption = Array(8760).fill(10);

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        touTariff,
        undefined,
        true
      );

      // Check that different buckets are assigned
      const buckets = new Set(result.hourlyData!.map(h => h.tariffBucket));
      expect(buckets.size).toBeGreaterThan(1);

      // Check that import costs vary
      const costs = result.hourlyData!.map(h => h.importCost);
      const uniqueCosts = new Set(costs.map(c => Math.round(c * 100)));
      expect(uniqueCosts.size).toBeGreaterThan(1);
    });
  });

  describe('simulateHourlyEnergyFlow - edge cases', () => {
    it('should throw error for incorrect array lengths', () => {
      const shortArray = Array(100).fill(0);
      const validArray = Array(8760).fill(0);

      expect(() => 
        simulateHourlyEnergyFlow(shortArray, validArray, flatTariff)
      ).toThrow();

      expect(() => 
        simulateHourlyEnergyFlow(validArray, shortArray, flatTariff)
      ).toThrow();
    });

    it('should handle negative values by clamping to zero', () => {
      const generation = Array(8760).fill(-5); // Invalid negative
      const consumption = Array(8760).fill(10);

      const result = simulateHourlyEnergyFlow(generation, consumption, flatTariff);

      // Should treat negative as zero
      expect(result.totalGridImport).toBeCloseTo(8760 * 10, 1);
      expect(result.totalSelfConsumption).toBe(0);
    });

    it('should handle zero battery capacity', () => {
      const generation = Array(8760).fill(5);
      const consumption = Array(8760).fill(10);
      const battery: BatteryConfig = {
        capacityKwh: 0
      };

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        battery
      );

      // Should behave as if no battery
      expect(result.totalGridImport).toBeCloseTo(8760 * 5, 1);
    });
  });

  describe('aggregateHourlyResultsToMonthly', () => {
    it('should aggregate to 12 months', () => {
      const generation = Array(8760).fill(5);
      const consumption = Array(8760).fill(10);

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        undefined,
        true
      );

      const monthly = aggregateHourlyResultsToMonthly(result.hourlyData!);
      expect(monthly).toHaveLength(12);
    });

    it('should preserve totals when aggregating', () => {
      const generation = Array(8760).fill(5);
      const consumption = Array(8760).fill(10);

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        undefined,
        true
      );

      const monthly = aggregateHourlyResultsToMonthly(result.hourlyData!);

      const monthlyGenTotal = monthly.reduce((sum, m) => sum + m.generation, 0);
      const monthlyConsTotal = monthly.reduce((sum, m) => sum + m.consumption, 0);

      expect(monthlyGenTotal).toBeCloseTo(8760 * 5, 1);
      expect(monthlyConsTotal).toBeCloseTo(8760 * 10, 1);
    });

    it('should calculate correct monthly values', () => {
      const generation = Array(8760).fill(5);
      const consumption = Array(8760).fill(10);

      const result = simulateHourlyEnergyFlow(
        generation,
        consumption,
        flatTariff,
        undefined,
        true
      );

      const monthly = aggregateHourlyResultsToMonthly(result.hourlyData!);

      // January has 31 days
      expect(monthly[0].generation).toBeCloseTo(31 * 24 * 5, 1);
      expect(monthly[0].consumption).toBeCloseTo(31 * 24 * 10, 1);
      expect(monthly[0].gridImport).toBeCloseTo(31 * 24 * 5, 1);
    });
  });
});
