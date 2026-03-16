import { describe, expect, it } from 'vitest';
import { formatCurrency, formatCurrencyPrecise, formatNumber, formatKwh } from '../../src/utils/format';

describe('formatCurrency', () => {
  it('formats a normal positive value with no decimals', () => {
    expect(formatCurrency(1234)).toBe('€1,234');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('€0');
  });

  it('formats a negative value', () => {
    expect(formatCurrency(-500)).toBe('-€500');
  });

  it('formats a large value with grouping separators', () => {
    expect(formatCurrency(1_500_000)).toBe('€1,500,000');
  });

  it('rounds fractional values to no decimals', () => {
    expect(formatCurrency(99.49)).toBe('€99');
    expect(formatCurrency(99.5)).toBe('€100');
  });
});

describe('formatCurrencyPrecise', () => {
  it('formats a normal positive value with 2 decimal places', () => {
    expect(formatCurrencyPrecise(1234.56)).toBe('€1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrencyPrecise(0)).toBe('€0.00');
  });

  it('formats a negative value', () => {
    expect(formatCurrencyPrecise(-42.1)).toBe('-€42.10');
  });

  it('formats a large value with grouping separators', () => {
    expect(formatCurrencyPrecise(2_000_000)).toBe('€2,000,000.00');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatCurrencyPrecise(9.999)).toBe('€10.00');
  });
});

describe('formatNumber', () => {
  it('formats a normal positive value with no decimals', () => {
    expect(formatNumber(4567)).toBe('4,567');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats a negative value', () => {
    expect(formatNumber(-123)).toBe('-123');
  });

  it('formats a large value with grouping separators', () => {
    expect(formatNumber(1_234_567)).toBe('1,234,567');
  });

  it('rounds fractional values to no decimals', () => {
    expect(formatNumber(3.7)).toBe('4');
  });
});

describe('formatKwh', () => {
  it('formats a normal positive value with up to 3 decimal places', () => {
    expect(formatKwh(12.345)).toBe('12.345');
  });

  it('formats zero', () => {
    expect(formatKwh(0)).toBe('0');
  });

  it('formats a negative value', () => {
    expect(formatKwh(-7.5)).toBe('-7.5');
  });

  it('formats a large value with grouping separators', () => {
    expect(formatKwh(1_500_000.123)).toBe('1,500,000.123');
  });

  it('rounds to at most 3 decimal places', () => {
    expect(formatKwh(1.23456)).toBe('1.235');
  });

  it('does not pad trailing zeros', () => {
    expect(formatKwh(5)).toBe('5');
    expect(formatKwh(5.1)).toBe('5.1');
  });
});
