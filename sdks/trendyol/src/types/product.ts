/** A `{ id, name }` reference object used in product/category/brand wire types. */
export interface NamedRef {
  id: string;
  name: string;
}

/**
 * A single attribute on a Trendyol product or variant.
 *
 * `attributeValueId` and `attributeValue` are mutually exclusive in createProduct
 * payloads but can both be present in filter responses.
 */
export interface ProductAttribute {
  attributeId: string;
  attributeName?: string;
  attributeValueId?: string;
  attributeValue?: string;
}

/**
 * A variant of a Trendyol product — the actual purchasable SKU.
 *
 * Trendyol scopes barcode + stock + commission to the variant level even for
 * products that only have a single variant. To read a product's barcode use
 * `product.variants[0].barcode`.
 */
export interface ProductVariant {
  variantId: string;
  barcode: string;
  commission?: number;
  attributes: ProductAttribute[];
  productUrl?: string;
  onSale?: boolean;
  /** Stock quantity (when the response includes stock data). */
  stock?: number;
  /** Untouched raw response for fields not modeled yet. */
  raw: Record<string, unknown>;
}

/**
 * A Trendyol marketplace product (approved variant).
 *
 * Lonca surfaces the stable fields we have verified against live Trendyol
 * responses. Everything else stays accessible via `raw`.
 */
export interface Product {
  contentId: string;
  productMainId: string;
  title: string;
  description?: string;
  brand: NamedRef;
  category: NamedRef;
  /** Image URLs in display order. */
  images: string[];
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  /** ISO 8601 UTC string (converted from Trendyol's ms-epoch). */
  createdAt: string;
  /** ISO 8601 UTC string. */
  updatedAt: string;
  lastModifiedBy?: string;
  /** Untouched raw response — read fields we have not modeled yet. */
  raw: Record<string, unknown>;
}

/**
 * Status of an async batch request returned by `createProducts`,
 * `updatePriceAndInventory`, and other Trendyol bulk endpoints.
 */
export type BatchRequestStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED' | (string & {});

export interface BatchRequestItemResult {
  requestItem?: unknown;
  status?: string;
  failureReasons?: string[];
}

/**
 * Result of polling `getBatchRequestResult` for a previously-submitted batch.
 *
 * Trendyol retains batch results for **4 hours** after the originating request.
 */
export interface BatchRequestResult {
  batchRequestId: string;
  status: BatchRequestStatus;
  itemCount?: number;
  failedItemCount?: number;
  items: BatchRequestItemResult[];
  /** ISO 8601 UTC string (converted from Trendyol's ms-epoch). */
  createdAt?: string;
  /** ISO 8601 UTC string. */
  lastModifiedAt?: string;
  /** Trendyol category of submission (e.g. `MarketPlace`). */
  sourceType?: string;
  /** Operation type (e.g. `CreateProducts`, `PriceUpdate`). */
  batchRequestType?: string;
  notes?: string;
  /** Storage object key Trendyol uses internally for the batch payload. */
  objectKey?: string;
  storeFrontCode?: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}
