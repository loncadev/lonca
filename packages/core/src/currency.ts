/**
 * ISO 4217 three-letter currency code.
 *
 * Typed as a string for flexibility — Trendyol and similar marketplaces may
 * expose currencies beyond the common set, so we don't lock down to a union.
 * Use `isValidCurrencyCode` for runtime validation.
 */
export type Currency = string;

export const TRY = 'TRY';
export const USD = 'USD';
export const EUR = 'EUR';
export const GBP = 'GBP';

const ISO_4217_RE = /^[A-Z]{3}$/;

export function isValidCurrencyCode(code: string): boolean {
  return ISO_4217_RE.test(code);
}
