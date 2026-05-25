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
 * Lifecycle status of an unapproved (draft) product on Trendyol.
 *
 * Verified values seen on STAGE/PROD as of 2026-05-25:
 * - `pendingApproval` — submitted; Trendyol content review in progress.
 * - `rejected` — review failed; `rejectReasonDetails` is populated.
 *
 * Older docs also mention `waiting`. Treat as open-enum (`(string & {})`)
 * since Trendyol can add new statuses without notice.
 */
export type UnapprovedProductStatus =
  | 'pendingApproval'
  | 'waiting'
  | 'rejected'
  | (string & {});

export interface UnapprovedProductRejectReason {
  /** Short title (e.g. "Kategori Bilgisi Eksik veya Yanlış"). */
  rejectReason?: string;
  /** Full explanation of the rejection. */
  rejectReasonDetail?: string;
}

/**
 * An unapproved (draft) product as returned by `filterUnapprovedProducts`.
 *
 * Important: the wire shape is **flatter** than the approved-product shape
 * exposed by `Product` — `barcode`, `quantity`, `salePrice`, etc. live at the
 * root (no `variants[]` array). Each draft is one barcode/SKU.
 *
 * Verified against Trendyol STAGE on 2026-05-25. The official OpenAPI spec
 * calls the image-list field `media`, but the live API returns it as
 * `images`. SDK normalizes to `images`.
 */
export interface UnapprovedProduct {
  /** Seller (supplier) ID echoed back by Trendyol. */
  supplierId?: string;
  productMainId: string;
  /** Lifecycle status — see `UnapprovedProductStatus`. */
  status?: UnapprovedProductStatus;
  brand: NamedRef;
  category: NamedRef;
  barcode: string;
  title: string;
  description?: string;
  /** Stock quantity at the moment of the query. */
  quantity?: number;
  listPrice?: number;
  salePrice?: number;
  /** VAT rate as a percentage (e.g. `20` for 20%). */
  vatRate?: number;
  dimensionalWeight?: number;
  stockCode?: string;
  /** Image URLs in display order (Trendyol's `images` field, spec says `media`). */
  images: string[];
  attributes: ProductAttribute[];
  /** Populated when `status === 'rejected'`. */
  rejectReasonDetails: UnapprovedProductRejectReason[];
  /** Returned by Trendyol; null when the seller has not configured this. */
  origin?: string | null;
  locationBasedDelivery?: 'ENABLED' | 'DISABLED' | null;
  lotNumber?: string | null;
  /** Special consumption tax (ÖTV) where applicable. */
  specialConsumptionTax?: number | null;
  /** Suggested governance retail price (Suggested Government Retail price). */
  sgrPrice?: number | null;
  /** ISO 8601 UTC string (from `createDateTime` ms-epoch). */
  createdAt?: string;
  /** ISO 8601 UTC string (from `lastUpdateDate`). */
  updatedAt?: string;
  /** ISO 8601 UTC string (from `lastPriceChangeDate`). */
  lastPriceChangedAt?: string;
  /** ISO 8601 UTC string (from `lastStockChangeDate`). */
  lastStockChangedAt?: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/**
 * Basic lifecycle info for a single product, returned by `getProductBase`.
 *
 * Cheap to call (no body — just barcode in path) and useful as a polling
 * primitive after `createProducts` to detect `approved: true`.
 */
export interface ProductBase {
  barcode: string;
  approved: boolean;
  archived: boolean;
  /** ISO 8601 UTC string (from `approvedDate` ms-epoch); `undefined` until approved. */
  approvedAt?: string;
  /** Stable listing ID assigned after approval. */
  listingId?: string;
  /** Trendyol's content ID — the same field on `Product.contentId`. */
  contentId?: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/**
 * Buybox status for a single barcode, returned by `getBuyboxInformation`.
 *
 * `buyboxOrder === 1` means you currently hold the buybox.
 * `secondBuyboxPrice` / `thirdBuyboxPrice` are surfaced from live wire (not
 * in the spec) so you can see what other sellers are charging.
 */
export interface BuyboxInfo {
  barcode: string;
  /** Position in the buybox ranking (1 = you hold it). */
  buyboxOrder?: number;
  /** Current buybox-winning price. */
  buyboxPrice?: number;
  hasMultipleSeller?: boolean;
  /** Second-best price (when multiple sellers compete). */
  secondBuyboxPrice?: number | null;
  /** Third-best price. */
  thirdBuyboxPrice?: number | null;
  /** Untouched raw response. */
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
