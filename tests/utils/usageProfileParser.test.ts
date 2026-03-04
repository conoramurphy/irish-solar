import { describe, it, expect } from 'vitest';
import { parseEsbUsageProfile } from '../../src/utils/usageProfileParser';

describe('parseEsbUsageProfile', () => {
  it('parses a simple CSV correctly into half-hourly slots', () => {
    // ESB readings (End Time), each row is one 30-min slot:
    // Slot 0 (00:00-00:30): end-time 00:30 -> 1kW * 0.5h = 0.5kWh
    // Slot 1 (00:30-01:00): end-time 01:00 -> 1kW * 0.5h = 0.5kWh
    // Slot 2 (01:00-01:30): end-time 01:30 -> 2kW * 0.5h = 1.0kWh
    // Slot 3 (01:30-02:00): end-time 02:00 -> 2kW * 0.5h = 1.0kWh
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2023 01:00
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 01:30
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 02:00`;

    const result = parseEsbUsageProfile(csv);
    
    expect(result.year).toBe(2023);
    expect(result.slotsPerDay).toBe(48);
    // 2023 is non-leap: 365 * 48 = 17520
    expect(result.hourlyConsumption.length).toBe(17520);
    // Slot 0: 00:00-00:30 -> 0.5kWh
    expect(result.hourlyConsumption[0]).toBeCloseTo(0.5);
    // Slot 1: 00:30-01:00 -> 0.5kWh
    expect(result.hourlyConsumption[1]).toBeCloseTo(0.5);
    // Slot 2: 01:00-01:30 -> 1.0kWh
    expect(result.hourlyConsumption[2]).toBeCloseTo(1.0);
    // Slot 3: 01:30-02:00 -> 1.0kWh
    expect(result.hourlyConsumption[3]).toBeCloseTo(1.0);
    // Total
    expect(result.totalKwh).toBeCloseTo(3.0);
  });

  it('handles data spanning years (filters to main year)', () => {
    // Parser uses interval START to assign year.
    // 31-12-2023 23:30 (end) -> start 23:00 -> 2023, slot 17518 (last two slots of year)
    // 01-01-2024 00:00 (end) -> start 23:30 -> 2023, slot 17519
    // 01-01-2024 00:30 (end) -> start 00:00 -> 2024
    // 2023 has 2 points, 2024 has 1 -> should pick 2023
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Import Interval (kW),31-12-2023 23:30
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2024 00:00
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2024 00:30`;
    
    const result = parseEsbUsageProfile(csv);
    expect(result.year).toBe(2023);
    
    // 2023 non-leap: 365 * 48 - 1 = slot 17519 (last slot: 23:30-00:00)
    // Slot 17518 has 0.5kWh (23:00-23:30), slot 17519 has 0.5kWh (23:30-00:00)
    expect(result.hourlyConsumption[17519]).toBeCloseTo(0.5);
  });

  it('throws on invalid CSV', () => {
    const csv = `Invalid CSV content`;
    expect(() => parseEsbUsageProfile(csv)).toThrow();
  });
  
  it('maps each 30-min reading to its own half-hourly slot', () => {
    // Slot 0 (00:00-00:30): 2kW -> 1kWh
    // Slot 1 (00:30-01:00): 4kW -> 2kWh
    // They remain separate slots (NOT summed into one hourly bucket)
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,4.0,Active Import Interval (kW),01-01-2023 01:00`;
      
    const result = parseEsbUsageProfile(csv);
    expect(result.hourlyConsumption[0]).toBeCloseTo(1.0); // slot 0: 2kW * 0.5h
    expect(result.hourlyConsumption[1]).toBeCloseTo(2.0); // slot 1: 4kW * 0.5h
    expect(result.totalKwh).toBeCloseTo(3.0);
  });
});
