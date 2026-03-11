import { describe, it, expect, beforeEach } from 'vitest';
import { simulateHourlyEnergyFlow, type BatteryConfig } from '../../src/utils/hourlyEnergyFlow';
import type { Tariff, TradingConfig } from '../../src/types';

describe('Hourly Trading Logic', () => {
  const mockTariff: Tariff = {
    id: 'test',
    supplier: 'test',
    product: 'test',
    type: '24-hour',
    standingCharge: 0,
    rates: [{ period: '24h', rate: 0.2 }],
    exportRate: 0.1,
  };

  const batteryConfig: BatteryConfig = {
    capacityKwh: 10,
    efficiency: 1.0, // Simplify tests with 100% efficiency
    initialSoC: 0,
    maxChargeRateKw: 5,
    maxDischargeRateKw: 5,
  };

  const tradingConfig: TradingConfig = {
    enabled: true,
    importMargin: 0.02, // 2c margin
    exportMargin: 0.01, // 1c margin
    hoursWindow: 2,     // 2 cheapest hours charge, 2 most expensive discharge
  };

  let generation: number[];
  let consumption: number[];
  let prices: number[];
  
  // Create a full year (365 days) of data
  const totalHours = 8760;

  beforeEach(() => {
    generation = new Array(totalHours).fill(0);
    consumption = new Array(totalHours).fill(0);
    prices = new Array(totalHours).fill(0.10); // Base price 10c
    
    // Set up daily price profile pattern
    for (let d = 0; d < 365; d++) {
        const offset = d * 24;
        prices[offset + 2] = 0.05; // 2am (Cheap)
        prices[offset + 3] = 0.04; // 3am (Cheapest)
        prices[offset + 4] = 0.06; // 4am
        
        prices[offset + 17] = 0.30; // 5pm (Expensive)
        prices[offset + 18] = 0.40; // 6pm (Most Expensive)
    }
  });

  // We will test specific days/hours to verify logic
  const testDayOffset = 0; // Test Day 1

  it('should force charge during cheapest hours even with no solar', () => {
    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined, // timeStamps not critical for this logic test if we ignore tariffs
      prices,
      tradingConfig
    );

    const hourly = result.hourlyData!;
    
    // Hour 2 (2am): Second Cheapest (0.05). Should Charge.
    // Loop runs 0, 1, 2... so Hour 2 happens BEFORE Hour 3.
    // Battery starts empty.
    // Hour 2: Charge 5kWh. SoC: 0 -> 5kWh.
    expect(hourly[2].batteryCharge).toBe(5);
    expect(hourly[2].batterySoC).toBe(5);
    
    // Hour 3 (3am): Cheapest (0.04). Should Charge.
    // Battery is at 5kWh.
    // Hour 3: Charge 5kWh. SoC: 5 -> 10kWh (Full).
    expect(hourly[3].batteryCharge).toBe(5);
    expect(hourly[3].gridImport).toBe(5); // Imported from grid
    expect(hourly[3].batterySoC).toBe(10);
  });

  it('should force discharge during expensive hours', () => {
    // Start with full battery for this test? 
    // Or let previous test flow naturally?
    // Let's rely on the charging from previous test logic.
    
    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined,
      prices,
      tradingConfig
    );
    const hourly = result.hourlyData!;

    // By hour 17, battery should be full (10kWh) from morning charge.
    expect(hourly[16].batterySoC).toBe(10); // Check hour before

    // Hour 17 (0.30) -> Expensive. Discharge.
    // Max discharge 5kW.
    expect(hourly[17].batteryDischarge).toBe(5);
    expect(hourly[17].gridExport).toBe(5); // Exported to grid (no load)
    expect(hourly[17].batterySoC).toBe(5); // 10 -> 5

    // Hour 18 (0.40) -> Most Expensive. Discharge.
    expect(hourly[18].batteryDischarge).toBe(5);
    expect(hourly[18].gridExport).toBe(5);
    expect(hourly[18].batterySoC).toBe(0); // 5 -> 0
  });

  it('should calculate costs using dynamic prices + margins', () => {
    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined,
      prices,
      tradingConfig
    );
    const hourly = result.hourlyData!;

    // Hour 3 (Import 5kWh @ 0.04 price)
    // Cost = 5 * (0.04 + importMargin 0.02) = 5 * 0.06 = 0.30 EUR
    expect(hourly[3].importCost).toBeCloseTo(0.30);

    // Hour 18 (Export 5kWh @ 0.40 price)
    // Revenue = 5 * (0.40 - exportMargin 0.01) = 5 * 0.39 = 1.95 EUR
    expect(hourly[18].exportRevenue).toBeCloseTo(1.95);
  });

  it('should prioritize solar self-consumption in AUTO mode', () => {
    // Hour 12 (Noon). Price 0.10 (Mid-range, AUTO).
    // Solar 3kWh, Load 4kWh.
    generation[12] = 3;
    consumption[12] = 4;

    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined,
      prices,
      tradingConfig
    );
    const hourly = result.hourlyData!;

    // Net = 1kWh Deficit.
    // Battery is empty at noon?
    // (Charged at 2am/3am -> Discharged 5pm/6pm).
    // Noon is between. Battery should be full (10kWh) from night charge!
    // So it should discharge to cover deficit.
    
    // Hour 12
    // Solar covers 3kWh of load.
    // Remaining load 1kWh.
    // Battery covers 1kWh.
    expect(hourly[12].gridImport).toBe(0);
    expect(hourly[12].batteryDischarge).toBe(1);
    expect(hourly[12].batterySoC).toBe(9); // 10 -> 9
  });

  it('should prioritize solar during force charge', () => {
    // Hour 3 (3am): Cheapest (0.04). Force Charge.
    // Solar: 3kW. Load: 0.
    // Battery Config: Max Charge 5kW.
    // Expected: Solar provides 3kW. Grid provides 2kW. Total 5kW into battery.
    generation[3] = 3;
    consumption[3] = 0;

    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined,
      prices,
      tradingConfig
    );
    const hourly = result.hourlyData!;

    expect(hourly[3].generation).toBe(3);
    expect(hourly[3].batteryCharge).toBe(5);
    expect(hourly[3].gridImport).toBe(2); // Only 2kW from grid
    expect(hourly[3].batterySoC).toBe(10); // Full (5 start + 5 charge)
  });

  it('should prioritize load during force discharge', () => {
    // Hour 18 (6pm): Expensive (0.40). Force Discharge.
    // Solar: 0. Load: 3kW.
    // Battery Config: Max Discharge 5kW.
    // Expected: Battery provides 5kW. 3kW to Load. 2kW to Grid.
    // Battery starts full (from morning charge).
    generation[18] = 0;
    consumption[18] = 3;

    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined,
      prices,
      tradingConfig
    );
    const hourly = result.hourlyData!;

    expect(hourly[18].consumption).toBe(3);
    expect(hourly[18].batteryDischarge).toBe(5);
    expect(hourly[18].gridExport).toBe(2); // 5 - 3 = 2kW exported
    expect(hourly[18].gridImport).toBe(0); // Load fully covered
  });

  it('should handle efficiency losses correctly', () => {
    // Efficiency 0.9 (90%).
    const efficientConfig = { ...batteryConfig, efficiency: 0.9 };
    
    // Hour 3 (Force Charge). Grid Import 5kW.
    // Expected: Input 5kW -> Stored = 5 * 0.9 = 4.5kWh.
    generation[3] = 0;
    
    // Hour 18 (Force Discharge). 
    // Expected: Output 5kW (limited by max rate).
    // Stored Energy Removed = 5 / 0.9 = 5.55kWh.
    
    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      efficientConfig,
      true,
      undefined,
      prices,
      tradingConfig
    );
    const hourly = result.hourlyData!;

    // Charge step (Hour 3)
    // We imported 5kW (max charge rate input).
    expect(hourly[3].gridImport).toBe(5);
    expect(hourly[3].batteryCharge).toBeCloseTo(5); // input energy (stored = 5 * 0.9 = 4.5)
    // SoC should be 4.5 + initial (0? wait, hour 2 charged too).
    // Hour 2 charged 5kW -> 4.5kWh stored.
    // Hour 3 charges 5kW -> 4.5kWh stored.
    // Total SoC = 9.0kWh.
    expect(hourly[3].batterySoC).toBeCloseTo(9.0);

    // Discharge step (Hour 18)
    // Battery has ~9.0kWh - 5.55kWh = 3.44kWh.
    // Max Discharge Rate 5kW (Output).
    // Can we deliver 5kW? NO. 
    // Available output = 3.44 * 0.9 = 3.1kWh.
    expect(hourly[18].batteryDischarge).toBeCloseTo(3.1);
    
    // Grid Export = Discharge (3.1) - Load (0).
    expect(hourly[18].gridExport).toBeCloseTo(3.1); 
    
    // End SoC = 0.
    expect(hourly[18].batterySoC).toBeCloseTo(0);
  });

  it('should handle negative prices correctly', () => {
    // Set negative price for Hour 12 (Auto Mode, but let's force charge if it was lowest?)
    // Let's modify price to be negative but NOT lowest to test simply cost calc?
    // Or just test price calc.
    // Hour 10: Price -0.05 (Negative 5c).
    // Margin 0.02.
    // Effective Import Price = -0.05 + 0.02 = -0.03 (Get paid 3c to import).
    
    // THIS WILL TRIGGER FORCE CHARGE if it becomes one of the cheapest 2 hours!
    // Cheapest: 0.04 (3am). Second: 0.05 (2am).
    // -0.05 is the NEW cheapest.
    // So Hour 10 becomes FORCE CHARGE.
    
    const negPrices = [...prices];
    negPrices[10] = -0.05; 
    
    // Force some consumption at hour 10
    consumption[10] = 5;
    generation[10] = 0;
    
    const result = simulateHourlyEnergyFlow(
      generation,
      consumption,
      mockTariff,
      batteryConfig,
      true,
      undefined,
      negPrices,
      tradingConfig
    );
    const hourly = result.hourlyData!;
    
    // Import 5kW (Load) + 5kW (Battery Charge) = 10kW Total Import.
    expect(hourly[10].gridImport).toBe(10);
    
    // Cost = 10 * (-0.03) = -0.30 EUR (Revenue).
    expect(hourly[10].importCost).toBeCloseTo(-0.30);
  });
});
