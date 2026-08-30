/**
 * Hepsiburada Seller Promotions types (`satici-promosyonu-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `satici-promosyonu-entegrasyonu` v1.0.
 *
 * 9 endpoints — "self-campaign" (basket-discount) lifecycle: list seller's
 * eligible categories, query budgets/limits, list discounts, get single
 * discount, create three discount types (TL / Yüzde / X Al Y Öde), cancel.
 */

/**
 * Body for `promotions.createTlDiscount()` — the diskonto spec's "Sepette TL
 * İndirimi Oluşturma" request. Undocumented fields pass through.
 */
export type CreateTlDiscountInput = {
  /** Campaign name shown to the seller. */
  name?: string;
  /** Campaign start date-time (ISO 8601). */
  startDate?: string;
  /** Campaign end date-time (ISO 8601). */
  endDate?: string;
  /** Category ids the campaign applies to. */
  conditionCategories?: string[];
  /** SKUs the campaign applies to. */
  conditionSkus?: string[];
  /** Campaign budget (TL). */
  budget?: number;
  /** Discount amount (TL). */
  discountAmount?: number;
  /** Minimum cart amount for the discount to apply. */
  conditionAmount?: number;
  /** Whether the campaign is one-time-use per customer. */
  oneTimeUsage?: boolean;
} & Record<string, unknown>;

/**
 * Body for `promotions.createPercentDiscount()` — the diskonto spec's
 * "Sepete % İndirimi Oluşturma" request. Undocumented fields pass through.
 */
export type CreatePercentDiscountInput = {
  /** Campaign name shown to the seller. */
  name?: string;
  /** Campaign start date-time (ISO 8601). */
  startDate?: string;
  /** Campaign end date-time (ISO 8601). */
  endDate?: string;
  /** Category ids the campaign applies to. */
  conditionCategories?: string[];
  /** SKUs the campaign applies to. */
  conditionSkus?: string[];
  /** Percentage discount to apply. */
  discountPercentage?: number;
  /** Minimum cart amount for the discount to apply. */
  conditionAmount?: number;
  /** Maximum discount amount that can be applied. */
  maxDiscountAmount?: number;
  /** Maximum number of carts the campaign applies to. */
  maxCartCount?: number;
  /** Whether the campaign is one-time-use per customer. */
  oneTimeUsage?: boolean;
} & Record<string, unknown>;

/**
 * Body for `promotions.createXyDiscount()` — the diskonto spec's "Sepete X Al
 * Y Öde İndirimi Oluşturma" request. Undocumented fields pass through.
 */
export type CreateXyDiscountInput = {
  /** Campaign name shown to the seller. */
  name?: string;
  /** Campaign start date-time (ISO 8601). */
  startDate?: string;
  /** Campaign end date-time (ISO 8601). */
  endDate?: string;
  /** Category ids the campaign applies to. */
  conditionCategories?: string[];
  /** SKUs the campaign applies to. */
  conditionSkus?: string[];
  /** Products required in the cart for the campaign to apply (the X in "buy X pay Y"). */
  conditionProductCount?: number;
  /** Products the customer pays for (the Y in "buy X pay Y"). */
  mustPayProductCount?: number;
  /** How many times the campaign can repeat within one cart. */
  iterationCount?: number;
  /** Maximum number of carts the campaign applies to. */
  maxCartCount?: number;
  /** Whether the campaign is one-time-use per customer. */
  oneTimeUsage?: boolean;
} & Record<string, unknown>;

/**
 * Body for `promotions.cancelDiscount()` — the diskonto spec's "Sepet
 * İndirimi İptali" request.
 */
export type CancelDiscountInput = {
  /** Unique id of the campaign to cancel. */
  campaignId?: number;
} & Record<string, unknown>;

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
