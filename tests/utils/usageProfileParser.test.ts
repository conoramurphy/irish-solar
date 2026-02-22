import { describe, it, expect } from 'vitest';
import { parseEsbUsageProfile } from '../../src/utils/usageProfileParser';

describe('parseEsbUsageProfile', () => {
  it('parses a simple CSV correctly', () => {
    // Mock CSV: 2 hours of data
    // Hour 0: 00:30 (1kW), 01:00 (1kW) -> 0.5kWh + 0.5kWh = 1kWh
    // Hour 1: 01:30 (2kW), 02:00 (2kW) -> 1kWh + 1kWh = 2kWh
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2023 01:00
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 01:30
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 02:00`;

    const result = parseEsbUsageProfile(csv);
    
    expect(result.year).toBe(2023);
    // Hour 0 (00:00-01:00) should have 1kWh
    expect(result.hourlyConsumption[0]).toBe(1.0);
    // Hour 1 (01:00-02:00) should have 2kWh
    expect(result.hourlyConsumption[1]).toBe(2.0);
    
    // Total
    expect(result.totalKwh).toBe(3.0);
  });

  it('handles data spanning years (filters to main year)', () => {
    // 2023 data + one 2024 point
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Import Interval (kW),31-12-2023 23:30
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2024 00:00
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2024 00:30`;

    // 2023 has 1 point (Dec 31 23:30)
    // 2024 has 2 points (Jan 1 00:00 is technically end of Dec 31?? No, 00:00 usually belongs to previous day end? 
    // In our parser logic: 
    // 01-01-2024 00:00. Interval start = 31-12-2023 23:30. Year is 2023.
    // So 01-01-2024 00:00 belongs to 2023!
    
    // 01-01-2024 00:30. Interval start = 01-01-2024 00:00. Year is 2024.
    
    // So we have:
    // 31-12-2023 23:30 (Start 23:00) -> 2023
    // 01-01-2024 00:00 (Start 23:30) -> 2023
    // 01-01-2024 00:30 (Start 00:00) -> 2024
    
    // 2 points for 2023, 1 point for 2024. 
    // Should pick 2023.
    
    const result = parseEsbUsageProfile(csv);
    expect(result.year).toBe(2023);
    
    // Last hour of 2023 (8759)
    // Should have 0.5 (from 23:30) + 0.5 (from 00:00) = 1.0
    expect(result.hourlyConsumption[8759]).toBe(1.0);
  });

  it('throws on invalid CSV', () => {
    const csv = `Invalid CSV content`;
    expect(() => parseEsbUsageProfile(csv)).toThrow();
  });
  
  it('correctly sums 30-min intervals to hours', () => {
      // 00:00-00:30: 2kW -> 1kWh
      // 00:30-01:00: 4kW -> 2kWh
      // Total 00:00-01:00: 3kWh
      const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,4.0,Active Import Interval (kW),01-01-2023 01:00`;
      
      const result = parseEsbUsageProfile(csv);
      expect(result.hourlyConsumption[0]).toBe(3.0);
  });
});
