import { describe, expect, it } from 'vitest';
import { calculateTradingRevenue } from '../../src/models/trading';

describe('trading model', () => {
  it('returns 0 when disabled', () => {
    expect(calculateTradingRevenue({ enabled: false })).toBe(0);
  });

  it('respects annual revenue override when enabled', () => {
    expect(calculateTradingRevenue({ enabled: true, annualRevenue: 1234 })).toBe(1234);
  });

  it('returns 0 when enabled without explicit annualRevenue', () => {
    expect(calculateTradingRevenue({ enabled: true })).toBe(0);
  });
});
