/**
 * Hepsiburada Seller Promotions types (`satici-promosyonu-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `satici-promosyonu-entegrasyonu` v1.0.
 *
 * 9 endpoints — "self-campaign" (basket-discount) lifecycle: list seller's
 * eligible categories, query budgets/limits, list discounts, get single
 * discount, create three discount types (TL / Yüzde / X Al Y Öde), cancel.
 */

/** Body for `promotions.createTlDiscount()` — `{ amount, ... }`. */
export type CreateTlDiscountInput = Record<string, unknown>;

/** Body for `promotions.createPercentDiscount()` — `{ percent, ... }`. */
export type CreatePercentDiscountInput = Record<string, unknown>;

/** Body for `promotions.createXyDiscount()` — `{ buyQty, payQty, ... }`. */
export type CreateXyDiscountInput = Record<string, unknown>;

/** Body for `promotions.cancelDiscount()` — `{ campaignId, ... }`. */
export type CancelDiscountInput = Record<string, unknown>;

/** One seller-product-category row. */
export interface PromotionCategory {
  categoryId?: number | string;
  name?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Discount budgets summary (TL / Yüzde / XY per campaign type). */
export interface DiscountBudgets {
  /** Untouched raw response — Hepsiburada returns a per-type breakdown. */
  raw: Record<string, unknown>;
}

/** Discount limits summary. */
export interface DiscountLimits {
  raw: Record<string, unknown>;
}

/** One discount row. */
export interface Discount {
  campaignId?: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
