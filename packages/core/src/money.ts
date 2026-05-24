import type { Currency } from './currency.js';

/**
 * A monetary amount in integer minor units (e.g., kuruş for TRY, cents for USD).
 *
 * Using integers avoids floating-point surprises. Convert to/from major units
 * with `moneyFromMajor` and `moneyToMajor`.
 */
export interface Money {
  amount: number;
  currency: Currency;
}

export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`Money amount must be an integer minor unit, got ${amount}`);
  }
  return { amount, currency };
}

export function moneyFromMajor(major: number, currency: Currency, minorScale = 2): Money {
  const factor = 10 ** minorScale;
  const amount = Math.round(major * factor);
  return money(amount, currency);
}

export function moneyToMajor(value: Money, minorScale = 2): number {
  return value.amount / 10 ** minorScale;
}

export function isSameCurrency(a: Money, b: Money): boolean {
  return a.currency === b.currency;
}

export function addMoney(a: Money, b: Money): Money {
  if (!isSameCurrency(a, b)) {
    throw new TypeError(`Cannot add Money of different currencies: ${a.currency} vs ${b.currency}`);
  }
  return money(a.amount + b.amount, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  if (!isSameCurrency(a, b)) {
    throw new TypeError(
      `Cannot subtract Money of different currencies: ${a.currency} vs ${b.currency}`,
    );
  }
  return money(a.amount - b.amount, a.currency);
}
