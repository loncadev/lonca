/**
 * Input types for Trendyol product write endpoints (V2).
 *
 * All five write endpoints (`createProducts`, `updateContentBulk`,
 * `updateVariantBulk`, `updateUnapproved`, `updateDeliveryInfoBulk`) are
 * async batch operations: SDK accepts the typed payload, Trendyol returns
 * `{ batchRequestId }`, and the caller polls via `products.getBatchStatus`.
 */

/** Response shape for every async write endpoint in the product API. */
export interface BatchAcceptedResponse {
  /** Opaque ID — pass to `products.getBatchStatus(...)` to track. */
  batchRequestId: string;
}

/** A V2 product attribute payload. Mutually-exclusive value selectors. */
export interface ProductAttributeV2Input {
  attributeId: number;
  /**
   * One or more attribute value IDs (V2 supports multi-value when the
   * attribute's `allowMultipleAttributeValues` flag is true).
   */
  attributeValueIds?: number[];
  /** Free-text value (only when the attribute's `allowCustom` flag is true). */
  attributeValue?: string;
}

/** Image entry: just a URL (Trendyol fetches the image asynchronously). */
export interface ProductImageInput {
  /** https URL; Trendyol recommends 1200×1800, 96 DPI. */
  url: string;
}

/** Per-variant delivery option (used by `create` + `updateUnapproved`). */
export interface DeliveryOptionInput {
  deliveryDuration?: number;
  fastDeliveryType?: 'SAME_DAY_SHIPPING' | 'FAST_DELIVERY';
}

/**
 * Payload for one item in `createProducts` (V2).
 *
 * Trendyol requires all 14 fields listed in the spec — the type makes them
 * non-optional so missing required fields fail at compile time, not at
 * runtime after a failed batch.
 */
export interface CreateProductV2Input {
  /** Barcode (≤40 chars, allows `.`, `-`, `_`). */
  barcode: string;
  /** Title (≤100 chars). */
  title: string;
  /** Parent product ID for variant grouping (≤40 chars). */
  productMainId: string;
  /** Trendyol numeric brand ID (from `brands.list`). */
  brandId: number;
  /** Trendyol numeric category ID (from `categories.list`). */
  categoryId: number;
  /** Initial stock quantity. */
  quantity: number;
  /** Seller-side stock code (≤100 chars). */
  stockCode: string;
  /** Desi value used for shipping cost calculation. */
  dimensionalWeight: number;
  /** HTML-friendly product description (≤30 000 chars). */
  description: string;
  /** List price (PSF). Must be ≥ `salePrice`. */
  listPrice: number;
  /** Sale price (TSF). */
  salePrice: number;
  /** 1–8 image URLs. */
  images: ProductImageInput[];
  /** VAT rate as integer percent (0, 1, 10, 20). */
  vatRate: number;
  /** Required attributes for the category — fetch via `categories.getAttributes`. */
  attributes: ProductAttributeV2Input[];
  /** Delivery duration / fast-delivery type. */
  deliveryOption?: DeliveryOptionInput;
  /** Lot/SKT info (≤100 chars). */
  lotNumber?: string | null;
  /** Shipment warehouse ID (from `suppliers.getAddresses`). */
  shipmentAddressId?: number;
  /** Returning warehouse ID. */
  returningAddressId?: number;
}

/** Payload for one item in `updateContentBulk` (only `contentId` is required). */
export interface UpdateContentInput {
  /** From `Product.contentId` on `products.list` results. */
  contentId: number;
  title?: string;
  description?: string;
  images?: ProductImageInput[];
  /**
   * If you update ANY attribute, you must send ALL attributes — partial
   * attribute updates are not supported by Trendyol on this endpoint.
   */
  attributes?: ProductAttributeV2Input[];
}

/**
 * Payload for one item in `updateVariantBulk`. `barcode` is the identifier;
 * Trendyol does not allow updating the barcode itself via this endpoint.
 */
export interface UpdateVariantInput {
  barcode: string;
  stockCode?: string;
  vatRate?: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  dimensionalWeight?: number;
  lotNumber?: string | null;
  locationBasedDelivery?: 'ENABLED' | 'DISABLED' | null;
}

/** Payload for one item in `updateUnapprovedProducts` — all optional except `barcode`. */
export interface UpdateUnapprovedInput {
  barcode: string;
  title?: string;
  description?: string;
  productMainId?: string;
  brandId?: number;
  categoryId?: number;
  stockCode?: string;
  dimensionalWeight?: number;
  vatRate?: number;
  deliveryOption?: DeliveryOptionInput;
  locationBasedDelivery?: 'ENABLED' | 'DISABLED' | null;
  lotNumber?: string | null;
  shipmentAddressId?: number;
  returningAddressId?: number;
  images?: ProductImageInput[];
  attributes?: ProductAttributeV2Input[];
}

/** Payload for one item in `updateDeliveryInfoBulk`. */
export interface UpdateDeliveryInfoInput {
  barcode: string;
  deliveryOptions?: {
    deliveryDuration?: number;
    fastDeliveryType?: 'SAME_DAY_SHIPPING' | 'FAST_DELIVERY';
  };
}
