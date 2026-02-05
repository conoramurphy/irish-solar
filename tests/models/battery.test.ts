import { describe, expect, it } from 'vitest';
import { calculateBatteryCycles, clampBatteryConfig, estimateUsableCapacity } from '../../src/models/battery';

describe('battery model (minimal)', () => {
  it('clamps battery config values into valid ranges', () => {
    const c = clampBatteryConfig({ capacityKwh: -10, efficiency: 2, maxDepthOfDischarge: -1 });
    expect(c.capacityKwh).toBe(0);
    expect(c.efficiency).toBe(1);
    expect(c.maxDepthOfDischarge).toBe(0);
  });

  it('computes usable capacity', () => {
    expect(estimateUsableCapacity({ capacityKwh: 10, efficiency: 0.9, maxDepthOfDischarge: 0.8 })).toBe(8);
  });

  it('computes cycles from throughput', () => {
    expect(calculateBatteryCycles(200, 10)).toBe(10);
    expect(calculateBatteryCycles(200, 0)).toBe(0);
  });
});
