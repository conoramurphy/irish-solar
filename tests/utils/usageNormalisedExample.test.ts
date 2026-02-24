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
    expect(result.hourlyConsumption.length).toBe(8760);
    expect(result.warnings).toEqual([]);

    // Aggregate hourly to monthly totals
    const monthTotals = new Array(12).fill(0);
    let hIdx = 0;
    for (let m = 0; m < 12; m++) {
      const hours = DAYS_PER_MONTH_NON_LEAP[m] * 24;
      for (let h = 0; h < hours; h++) {
        monthTotals[m] += result.hourlyConsumption[hIdx++] || 0;
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
