/**
 * Hepsiburada Listings (Listeleme) types.
 *
 * Shape source: official OpenAPI document at
 * developers.hepsiburada.com/api/v1/public/docs/hepsiburada/listeleme/v1/openapi
 * (HEPSIBURADA - LISTELEME ENTEGRASYONU v1, 17 operations / 25 schemas).
 */

/** Pricing window for a listing (date-bounded promo, contract pricing, etc.). */
export interface ListingPricing {
  finalPrice: number;
  /** ISO 8601 UTC. */
  startDate?: string;
  /** ISO 8601 UTC. */
  endDate?: string;
  debtors?: string[];
}

/** Free-form customizable property metadata returned by Hepsiburada. */
export interface CustomizableProperty {
  displayName?: string;
  displayLength: number;
  displayDescription?: string;
}

/** A single listing row from `listings.list()`. */
export interface Listing {
  listingId: string;
  uniqueIdentifier?: string;
  hepsiburadaSku?: string;
  merchantSku?: string;
  price: number;
  availableStock: number;
  dispatchTime: number;
  cargoCompany1?: string;
  cargoCompany2?: string;
  cargoCompany3?: string;
  shippingAddressLabel?: string;
  shippingProfileName?: string;
  claimAddressLabel?: string;
  maximumPurchasableQuantity: number;
  minimumPurchasableQuantity: number;
  pricings?: ListingPricing[];
  isSalable: boolean;
  customizableProperties?: CustomizableProperty[];
  /** Reasons Hepsiburada surfaces when a listing is `!isSalable`. */
  deactivationReasons?: string[];
  isSuspended: boolean;
  isLocked: boolean;
  lockReasons?: string[];
  isFrozen: boolean;
  freezeReasons?: string[];
  availableWarehouses?: string[];
  isFulfilledByHB: boolean;
  priceIncreaseDisabled: boolean;
  priceDecreaseDisabled: boolean;
  stockDecreaseDisabled: boolean;
  skuAfterSuspension?: string;
  productId?: string;
  hasVariant: boolean;
}

/** Paged response wrapping `Listing[]`. */
export interface ListingsPage {
  listings: Listing[];
  totalCount: number;
  limit: number;
  offset: number;
}

/** Filter / pagination params for `listings.list()`. */
export interface ListListingsParams {
  /** Pagination — required by Hepsiburada. */
  offset: number;
  /** Pagination — required by Hepsiburada. */
  limit: number;
  /** CSV of Hepsiburada SKUs to filter to. */
  hbSkuList?: string;
  /** CSV of merchant SKUs to filter to. */
  merchantSkuList?: string;
  /** Filter to listings that are salable. */
  salableListings?: boolean;
  /** Filter to listings that are NOT salable. */
  notsalableListings?: boolean;
  /** ISO 8601 UTC; filter to listings updated since this date. */
  updateStartDate?: string;
  /** ISO 8601 UTC; filter to listings updated before this date. */
  updateEndDate?: string;
  /** Filter to a single Hepsiburada product ID. */
  productId?: string;
}

// ─── Bulk upload models ──────────────────────────────────────────────────

/** One item in a `listings.uploadInventory()` batch. */
export interface InventoryUploadItem {
  hepsiburadaSku?: string;
  merchantSku?: string;
  price?: number;
  fixedShippingPrice?: string;
  availableStock?: number;
  cargoCompany1?: string;
  cargoCompany2?: string;
  cargoCompany3?: string;
  shippingAddressLabel?: string;
  claimAddressLabel?: string;
  maximumPurchasableQuantity?: number;
  customizationTextType?: string;
  customizationTextLength?: number;
  btCargoCompany?: string;
  ytCargoCompany?: string;
  /** CSV of warehouse codes. */
  availableWarehouses?: string;
  shippingProfileName?: string;
  hasInstallation?: boolean;
}

/** One item in a `listings.uploadStock()` batch. */
export interface StockUploadItem {
  hepsiburadaSku?: string;
  merchantSku?: string;
  availableStock?: number;
  maximumPurchasableQuantity?: number;
}

/** One item in a `listings.uploadPrice()` batch. */
export interface PriceUploadItem {
  hepsiburadaSku?: string;
  merchantSku?: string;
  price?: number;
}

/** One item in a `listings.uploadShippingInfo()` batch. */
export interface ShippingInfoUploadItem {
  hepsiburadaSku?: string;
  merchantSku?: string;
  dispatchTime?: number;
  fixedShippingPrice?: number;
  claimAddressLabel?: string;
  shippingAddressLabel?: string;
  cargoCompany1?: string;
  cargoCompany2?: string;
  cargoCompany3?: string;
  btCargoCompany?: string;
  ytCargoCompany?: string;
  /** CSV of warehouse codes. */
  availableWarehouses?: string;
  shippingProfileName?: string;
}

/** One item in a `listings.uploadAdditionalInfo()` batch. */
export interface AdditionalInfoUploadItem {
  hepsiburadaSku?: string;
  merchantSku?: string;
  customizationTextType?: string;
  customizationTextLength: number;
  hasInstallation?: boolean;
}

// ─── Async upload results ────────────────────────────────────────────────

/**
 * Response from every upload endpoint — Hepsiburada accepts the batch and
 * returns an opaque `id` you poll separately (`listings.getStockUpload(id)`,
 * etc.). The `id` lives 24+ hours on Hepsiburada's side.
 */
export interface UploadReceipt {
  id: string;
}

/** Lifecycle status of an upload. */
export type UploadStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPLETED_WITH_ERRORS'
  | (string & {});

/** Per-row failure surfaced by an upload result. */
export interface UploadError {
  /** Index of the failing item in the original request batch. */
  elementNo?: number;
  hepsiburadaSku?: string;
  merchantSku?: string;
  /** Underlying error messages from Hepsiburada validation. */
  errors?: string[];
  /** Untouched raw error row. */
  raw: Record<string, unknown>;
}

/**
 * Common result envelope shared by stock / shipping / additional-info uploads
 * (price uploads add `priceValidations` — see `PriceUploadResult` below).
 */
export interface UploadResult {
  id: string;
  status?: UploadStatus;
  /** ISO 8601 UTC. */
  createdAt?: string;
  total: number;
  errors: UploadError[];
}

/** Hepsiburada price-validation hint surfaced on `PriceUploadResult.priceValidations`. */
export interface PriceValidation {
  elementNo: number;
  hepsiburadaSku?: string;
  merchantSku?: string;
  /** Validation type (e.g. `MinPrice`, `MaxPrice`, `RegulativePrice`). */
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  regulativePriceDetail?: {
    minAmount?: number;
    maxAmount?: number;
    categoryName?: string;
  };
  description?: string;
}

export interface PriceUploadResult extends UploadResult {
  priceValidations?: PriceValidation[];
}

// ─── Single-SKU update + bulk unlock ─────────────────────────────────────

/** Body for `listings.updateSingleSku()`. */
export interface UpdateListingInput {
  newAvailableStock?: number;
  newPrice?: {
    /** ISO 4217 currency code (e.g. `'TRY'`). */
    currency?: string;
    amount: number;
  };
  newDispatchTime?: number;
}

/** Body for `listings.bulkUnlock()`. */
export interface BulkUnlockInput {
  hbSkuList: string[];
}

// ─── Buybox + commissions ────────────────────────────────────────────────

/** Row from `listings.getBuyboxOrder()`. Hepsiburada keeps the response shape sparse — pull from `raw` for fields the SDK doesn't model. */
export interface BuyboxOrderRow {
  hepsiburadaSku?: string;
  merchantSku?: string;
  buyboxOrder?: number;
  buyboxPrice?: number;
  raw: Record<string, unknown>;
}

/** Row from `listings.getCommissions()`. Conservative typing — `raw` carries the full response. */
export interface CommissionRow {
  hepsiburadaSku?: string;
  merchantSku?: string;
  commissionRate?: number;
  raw: Record<string, unknown>;
}
