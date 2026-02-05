import { describe, expect, it } from 'vitest';
import { calculateTradingRevenue } from '../../src/models/trading';

describe('trading model', () => {
  it('returns 0 when disabled', () => {
    expect(calculateTradingRevenue({ enabled: false }, 100, 1)).toBe(0);
  });

  it('respects annual revenue override when enabled', () => {
    expect(calculateTradingRevenue({ enabled: true, annualRevenue: 1234 }, 100, 1)).toBe(1234);
  });

  it('uses heuristic when enabled without override', () => {
    expect(calculateTradingRevenue({ enabled: true }, 10, 1)).toBeGreaterThan(0);
  });
});
