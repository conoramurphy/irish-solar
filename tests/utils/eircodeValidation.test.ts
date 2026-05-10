import { describe, it, expect } from 'vitest';
import { isValidEircode, normaliseEircode } from '../../src/utils/eircodeValidation';

describe('isValidEircode', () => {
  it('accepts valid Eircodes with and without space', () => {
    expect(isValidEircode('D02 X285')).toBe(true);
    expect(isValidEircode('D02X285')).toBe(true);
    expect(isValidEircode('A65 F4E2')).toBe(true);
    expect(isValidEircode('a65f4e2')).toBe(true); // case-insensitive
  });

  it('rejects malformed input', () => {
    expect(isValidEircode('')).toBe(false);
    expect(isValidEircode('D02')).toBe(false);
    expect(isValidEircode('D02 X28')).toBe(false);
    expect(isValidEircode('D02 X2855')).toBe(false);
    expect(isValidEircode('123 X285')).toBe(false);
    expect(isValidEircode('Hello world')).toBe(false);
  });
});

describe('normaliseEircode', () => {
  it('uppercases and inserts a single space', () => {
    expect(normaliseEircode('d02x285')).toBe('D02 X285');
    expect(normaliseEircode('D02 X285')).toBe('D02 X285');
    expect(normaliseEircode('  d02   x285  ')).toBe('D02 X285');
  });
});
