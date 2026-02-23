import { describe, it, expect } from 'vitest';
import { normalizeHourlyConsumptionLength } from '../../src/utils/hourlyConsumptionNormalizer';

describe('normalizeHourlyConsumptionLength', () => {
  it('returns unchanged array when lengths match', () => {
    const data = new Array(8760).fill(1.5);
    const result = normalizeHourlyConsumptionLength(data, 8760);
    
    expect(result.normalized).toEqual(data);
    expect(result.corrections.padded).toBe(false);
    expect(result.corrections.trimmed).toBe(false);
    expect(result.corrections.warnings).toHaveLength(0);
  });

  it('pads non-leap year data to leap year (8760 -> 8784)', () => {
    // Create 8760 hours with known values
    const data = new Array(8760).fill(0).map((_, i) => i);
    
    const result = normalizeHourlyConsumptionLength(data, 8784);
    
    expect(result.normalized.length).toBe(8784);
    expect(result.corrections.originalLength).toBe(8760);
    expect(result.corrections.targetLength).toBe(8784);
    expect(result.corrections.padded).toBe(true);
    expect(result.corrections.trimmed).toBe(false);
    expect(result.corrections.warnings.length).toBeGreaterThan(0);
    
    // Feb 29 starts at hour 1416 (31 days in Jan * 24 + 28 days in Feb * 24)
    const feb29Start = 31 * 24 + 28 * 24; // 1416
    
    // Check that Feb 29 was inserted with averaged values
    // The code averages Feb 28 (starting at hour 1392) and Mar 1 (starting at hour 1416 in original)
    const feb28Start = 31 * 24 + 27 * 24; // 1392
    const mar1Start = 31 * 24 + 28 * 24;   // 1416 in original
    
    // First hour of Feb 29 should be average of first hour of Feb 28 and first hour of Mar 1
    const feb28FirstHour = data[feb28Start]; // 1392
    const mar1FirstHour = data[mar1Start];   // 1416
    const expectedFeb29FirstHour = (feb28FirstHour + mar1FirstHour) / 2; // (1392 + 1416) / 2 = 1404
    
    expect(result.normalized[feb29Start]).toBeCloseTo(expectedFeb29FirstHour, 5);
  });

  it('trims leap year data to non-leap year (8784 -> 8760)', () => {
    // Create 8784 hours
    const data = new Array(8784).fill(0).map((_, i) => i);
    
    const result = normalizeHourlyConsumptionLength(data, 8760);
    
    expect(result.normalized.length).toBe(8760);
    expect(result.corrections.originalLength).toBe(8784);
    expect(result.corrections.targetLength).toBe(8760);
    expect(result.corrections.padded).toBe(false);
    expect(result.corrections.trimmed).toBe(true);
    expect(result.corrections.warnings.length).toBeGreaterThan(0);
    
    // Feb 29 (hours 1416-1439) should be removed
    // Mar 1 hour 0 in leap year (index 1440) should now be at index 1416
    const feb29Start = 31 * 24 + 28 * 24;
    expect(result.normalized[feb29Start]).toBe(data[feb29Start + 24]); // Mar 1 data moved back
  });

  it('throws error for unexpected lengths', () => {
    const data = new Array(8000).fill(1);
    
    expect(() => {
      normalizeHourlyConsumptionLength(data, 8760);
    }).toThrow(/unexpected length/);
  });

  it('preserves total consumption when padding (within rounding)', () => {
    const data = new Array(8760).fill(0).map(() => Math.random() * 10);
    const originalTotal = data.reduce((a, b) => a + b, 0);
    
    const result = normalizeHourlyConsumptionLength(data, 8784);
    const newTotal = result.normalized.reduce((a, b) => a + b, 0);
    
    // The new total should be slightly higher (added 24 hours of averaged data)
    // But should be close to the original proportionally
    expect(newTotal).toBeGreaterThan(originalTotal);
    
    // The difference should be approximately 24 hours worth of average consumption
    const avgHourly = originalTotal / 8760;
    const expected24Hours = avgHourly * 24;
    const actualDiff = newTotal - originalTotal;
    
    // Should be roughly equal (within 15% margin for averaging effects and random variation)
    expect(Math.abs(actualDiff - expected24Hours) / expected24Hours).toBeLessThan(0.15);
  });
});
