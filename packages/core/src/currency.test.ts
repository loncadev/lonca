import { describe, expect, it } from 'vitest';
import { EUR, GBP, TRY, USD, isValidCurrencyCode } from './currency.js';

describe('currency', () => {
  it('exposes common ISO 4217 constants', () => {
    expect(TRY).toBe('TRY');
    expect(USD).toBe('USD');
    expect(EUR).toBe('EUR');
    expect(GBP).toBe('GBP');
  });

  it('validates ISO 4217 format', () => {
    expect(isValidCurrencyCode('TRY')).toBe(true);
    expect(isValidCurrencyCode('USD')).toBe(true);
    expect(isValidCurrencyCode('try')).toBe(false);
    expect(isValidCurrencyCode('TRYY')).toBe(false);
    expect(isValidCurrencyCode('TR')).toBe(false);
    expect(isValidCurrencyCode('123')).toBe(false);
  });
});
