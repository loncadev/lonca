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

/**
 * Convert a major-unit amount (e.g. lira, dollars) to {@link Money} in integer
 * minor units. This is the canonical lira→kuruş converter — prefer it over a
 * hand-rolled `Math.round(x * 100)`, which scatters rounding logic.
 *
 * Scaling is done in decimal space (via the number's string form) rather than
 * by multiplying, so a written decimal like `1.255` rounds the way a human
 * reads it: `Math.round(1.255 * 100)` is `125` (because `1.255 * 100` is
 * `125.49999999999999` in IEEE-754), whereas this returns `126`. Note this can
 * only respect the decimal you actually wrote — a literal that is itself
 * unrepresentable is already lost before the call.
 *
 * @example
 * ```ts
 * import { moneyFromMajor, TRY } from '@lonca/core';
 * // A marketplace price of 199.90 ₺:
 * moneyFromMajor(199.9, TRY); // { amount: 19990, currency: 'TRY' } — kuruş
 * moneyFromMajor(1.255, TRY); // { amount: 126, currency: 'TRY' }
 * ```
 */
export function moneyFromMajor(major: number, currency: Currency, minorScale = 2): Money {
  if (!Number.isFinite(major)) {
    throw new TypeError(`Money major amount must be a finite number, got ${major}`);
  }
  // Shift the decimal point with exponential notation (`"1.255e2"` parses to
  // exactly `125.5`) instead of `major * 10 ** minorScale`, which would first
  // produce a binary-rounded product like `125.49999999999999`. Values that
  // already stringify in exponential form (extremely large/small, far outside
  // any real price) can't be re-scaled by string append, so fall back to the
  // plain multiply for those.
  const str = `${major}`;
  const scaled =
    str.includes('e') || str.includes('E')
      ? major * 10 ** minorScale
      : Number(`${str}e${minorScale}`);
  const amount = Math.round(scaled);
  return money(amount, currency);
}

/**
 * Convert {@link Money} (integer minor units) back to a major-unit number —
 * the canonical kuruş→lira converter.
 *
 * @example
 * ```ts
 * import { moneyToMajor, TRY } from '@lonca/core';
 * moneyToMajor({ amount: 19990, currency: TRY }); // 199.9 (lira)
 * ```
 */
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
