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

/**
 * Query parameters for `promotions.listDiscounts()`. Both are required by
 * the API (`page` / `pagesize` on the wire); the SDK defaults them to
 * `page=1`, `pagesize=100`.
 */
export interface ListDiscountsParams {
  /** Page number (defaults to `1`). */
  page?: number;
  /** Page size (sent as `pagesize`; defaults to `100`). */
  pageSize?: number;
}

/**
 * Receipt returned by `promotions.createTlDiscount()` /
 * `createPercentDiscount()` / `createXyDiscount()` — the spec's
 * `CreateSelfCampaignResponse`: `{ success, data: { campaignId } }`.
 * `cancelDiscount()` only gets `{ success }` back and therefore resolves to a
 * plain `MutationResult`.
 */
export interface DiscountReceipt {
  /** Whether Hepsiburada accepted the campaign. */
  success?: boolean;
  /** Id of the campaign that was created (`data.campaignId` on the wire). */
  campaignId?: number;
  /** Untouched parsed response body (envelope included). */
  raw: unknown;
}

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
