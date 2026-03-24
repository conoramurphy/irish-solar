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

  it('throws when header has Read Date but missing Read Value column (line 45)', () => {
    const csv = `MPRN,Meter Serial Number,Read Type,Read Date and End Time
10013715764,000000000024641939,Active Import Interval (kW),01-01-2023 00:30`;

    expect(() => parseEsbUsageProfile(csv)).toThrow('Missing Date or Value columns');
  });

  it('throws when header is valid but no parseable data rows exist (line 102)', () => {
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
,,,,
,,,,`;

    expect(() => parseEsbUsageProfile(csv)).toThrow('No valid usage data found in file.');
  });

  it('skips rows with Export read type (line 66)', () => {
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,5.0,Active Export Interval (kW),01-01-2023 01:00
10013715764,000000000024641939,3.0,Active Import Interval (kW),01-01-2023 01:30`;

    const result = parseEsbUsageProfile(csv);
    // Only 2 import rows: slot 0 = 0.5kWh, slot 2 = 1.5kWh; export row skipped
    expect(result.hourlyConsumption[0]).toBeCloseTo(0.5);
    expect(result.hourlyConsumption[1]).toBe(0); // export row was skipped
    expect(result.hourlyConsumption[2]).toBeCloseTo(1.5);
    expect(result.totalKwh).toBeCloseTo(2.0);
  });

  it('handles CSV without Read Type column (typeIdx === -1 branch at line 62)', () => {
    // Header without "Read Type" → typeIdx=-1 → skips the type check, processes all rows
    const csv = `MPRN,Meter Serial Number,Read Value,Read Date and End Time
10013715764,000000000024641939,2.0,01-01-2023 00:30
10013715764,000000000024641939,4.0,01-01-2023 01:00`;

    const result = parseEsbUsageProfile(csv);
    expect(result.hourlyConsumption[0]).toBeCloseTo(1.0); // 2kW * 0.5
    expect(result.hourlyConsumption[1]).toBeCloseTo(2.0); // 4kW * 0.5
    expect(result.totalKwh).toBeCloseTo(3.0);
  });

  it('skips rows where date has no time component (no space in date string, line 76)', () => {
    // "01-01-2023" without time → split by space gives ["01-01-2023"] → t=undefined → continue
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,5.0,Active Import Interval (kW),01-01-2023
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 01:00`;

    const result = parseEsbUsageProfile(csv);
    // First row (no time) skipped; only 2kW * 0.5 = 1kWh at slot 1
    expect(result.hourlyConsumption[1]).toBeCloseTo(1.0);
    expect(result.totalKwh).toBeCloseTo(1.0);
  });

  it('skips rows where day/month/year parse to 0 or falsy (line 80 branch)', () => {
    // "00-01-2023 12:00" → day=0 → !day is true → continue
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,5.0,Active Import Interval (kW),00-01-2023 12:30
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 01:00`;

    const result = parseEsbUsageProfile(csv);
    // First row (day=0) is skipped; only 2kW * 0.5 = 1kWh at slot 1
    expect(result.hourlyConsumption[1]).toBeCloseTo(1.0);
    expect(result.totalKwh).toBeCloseTo(1.0);
  });

  it('skips rows where Read Value is NaN (isNaN fallback at line 87)', () => {
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,abc,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2023 01:00`;

    const result = parseEsbUsageProfile(csv);
    // 'abc' is NaN → skipped. Only 2kW * 0.5 = 1kWh at slot 1
    expect(result.hourlyConsumption[0]).toBe(0); // NaN row skipped
    expect(result.hourlyConsumption[1]).toBeCloseTo(1.0);
    expect(result.totalKwh).toBeCloseTo(1.0);
  });

  it('falls back to current year when yearCounts is empty (all rows are export)', () => {
    // All rows are export type → yearCounts stays empty → fallback to new Date().getFullYear()
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Export Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,2.0,Active Export Interval (kW),01-01-2023 01:00`;

    // All export rows are skipped, so points is empty → throws 'No valid usage data found'
    expect(() => parseEsbUsageProfile(csv)).toThrow('No valid usage data found in file.');
  });

  it('skips slots where slotIndex is out of range for the year (line 149 false branch)', () => {
    // Use targetYear=2024 (leap year) but provide data for 2023 → sYear !== targetYear → slot skipped
    // Then also provide data for 2024 to ensure we have at least one valid row
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,5.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2024 00:30`;

    // With targetYear=2024, only the 2024 row is mapped
    const result = parseEsbUsageProfile(csv, 2024);
    expect(result.year).toBe(2024);
    expect(result.hourlyConsumption[0]).toBeCloseTo(1.0); // 2kW * 0.5
    expect(result.totalKwh).toBeCloseTo(1.0); // 2023 row skipped
  });

  it('filters data to the specified targetYear', () => {
    const csv = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,1.0,Active Import Interval (kW),01-01-2023 00:30
10013715764,000000000024641939,2.0,Active Import Interval (kW),01-01-2024 00:30`;

    const result = parseEsbUsageProfile(csv, 2024);
    expect(result.year).toBe(2024);
    // Only the 2024 row should be mapped: 2kW * 0.5 = 1.0kWh
    expect(result.hourlyConsumption[0]).toBeCloseTo(1.0);
    expect(result.totalKwh).toBeCloseTo(1.0);
  });
});
