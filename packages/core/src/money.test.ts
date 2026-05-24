import { describe, expect, it } from 'vitest';
import {
  addMoney,
  isSameCurrency,
  money,
  moneyFromMajor,
  moneyToMajor,
  subMoney,
} from './money.js';

describe('money', () => {
  it('builds Money from integer minor units', () => {
    expect(money(12550, 'TRY')).toEqual({ amount: 12550, currency: 'TRY' });
  });

  it('rejects non-integer amounts', () => {
    expect(() => money(12.5, 'TRY')).toThrow(TypeError);
  });

  it('converts from major units with default scale 2', () => {
    expect(moneyFromMajor(125.5, 'TRY')).toEqual({ amount: 12550, currency: 'TRY' });
  });

  it('converts from major units with custom scale', () => {
    expect(moneyFromMajor(1.23456, 'BHD', 3)).toEqual({ amount: 1235, currency: 'BHD' });
  });

  it('rounds half-up on conversion from major units', () => {
    expect(moneyFromMajor(0.005, 'USD').amount).toBe(1);
  });

  it('converts back to major units', () => {
    expect(moneyToMajor({ amount: 12550, currency: 'TRY' })).toBe(125.5);
  });

  it('detects same currency', () => {
    expect(isSameCurrency(money(100, 'TRY'), money(200, 'TRY'))).toBe(true);
    expect(isSameCurrency(money(100, 'TRY'), money(100, 'USD'))).toBe(false);
  });

  it('adds Money of the same currency', () => {
    expect(addMoney(money(100, 'TRY'), money(50, 'TRY'))).toEqual({
      amount: 150,
      currency: 'TRY',
    });
  });

  it('rejects mixed-currency addition', () => {
    expect(() => addMoney(money(100, 'TRY'), money(50, 'USD'))).toThrow(TypeError);
  });

  it('subtracts Money of the same currency', () => {
    expect(subMoney(money(100, 'TRY'), money(30, 'TRY'))).toEqual({
      amount: 70,
      currency: 'TRY',
    });
  });

  it('allows negative results on subtraction', () => {
    expect(subMoney(money(30, 'TRY'), money(100, 'TRY')).amount).toBe(-70);
  });
});
