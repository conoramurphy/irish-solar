import { describe, expect, it } from 'vitest';
import { stripVat, addVat, VAT_RATE_REDUCED, VAT_RATE_STANDARD } from '../../src/utils/vat';

describe('VAT Utility', () => {
  describe('stripVat', () => {
    it('correctly strips 13.5% VAT', () => {
      const gross = 113.5;
      const net = stripVat(gross, VAT_RATE_REDUCED);
      expect(net).toBeCloseTo(100, 2);
    });

    it('correctly strips 23% VAT', () => {
      const gross = 123;
      const net = stripVat(gross, VAT_RATE_STANDARD);
      expect(net).toBeCloseTo(100, 2);
    });

    it('returns same amount if rate is 0', () => {
      expect(stripVat(100, 0)).toBe(100);
    });
  });

  describe('addVat', () => {
    it('correctly adds 13.5% VAT', () => {
      const net = 100;
      const gross = addVat(net, VAT_RATE_REDUCED);
      expect(gross).toBe(113.5);
    });

    it('correctly adds 23% VAT', () => {
      const net = 100;
      const gross = addVat(net, VAT_RATE_STANDARD);
      expect(gross).toBe(123);
    });

    it('returns same amount if rate is 0', () => {
      expect(addVat(100, 0)).toBe(100);
    });
  });
});
