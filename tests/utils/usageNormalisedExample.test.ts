import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseEsbUsageProfile } from '../../src/utils/usageProfileParser';
import { DAYS_PER_MONTH_NON_LEAP } from '../../src/constants/calendar';

// Must match scripts/generate-normalised-usage.mjs
const TARGET_YEAR = 2025;
const TOLERANCE = 0.10;
const CURVE = [
  1.00, 0.95, 0.86, 0.75, 0.68, 0.62, 0.60, 0.62, 0.70, 0.82, 0.92, 0.98
];

describe('normalized usage example CSV', () => {
  it('parses cleanly and is not materially below the target curve in any month', () => {
    const csvPath = path.join(process.cwd(), 'public', 'data', 'usages', `usage_john_normalised_${TARGET_YEAR}.csv`);
    const csv = fs.readFileSync(csvPath, 'utf8');

    const result = parseEsbUsageProfile(csv);

    expect(result.year).toBe(TARGET_YEAR);
    // The parser now produces half-hourly slots (48/day): 365 * 48 = 17520
    const expectedSlots = DAYS_PER_MONTH_NON_LEAP.reduce((s, d) => s + d, 0) * 48;
    expect(result.hourlyConsumption.length).toBe(expectedSlots);
    expect(result.slotsPerDay).toBe(48);

    // Aggregate half-hourly slots to monthly totals
    const monthTotals = new Array(12).fill(0);
    let sIdx = 0;
    for (let m = 0; m < 12; m++) {
      const slots = DAYS_PER_MONTH_NON_LEAP[m] * 48;
      for (let s = 0; s < slots; s++) {
        monthTotals[m] += result.hourlyConsumption[sIdx++] || 0;
      }
    }

    const jan = monthTotals[0];
    expect(jan).toBeGreaterThan(0);

    for (let m = 0; m < 12; m++) {
      const ratio = monthTotals[m] / jan;
      const minAcceptable = CURVE[m] * (1 - TOLERANCE);
      expect(ratio + 1e-9).toBeGreaterThanOrEqual(minAcceptable);
    }
  });
});
