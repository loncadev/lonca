/**
 * Hepsiburada Catalog Product (merchant SKU rows) types.
 *
 * Source: `katalog-urun-entegrasyonu` v1.0 (developers.hepsiburada.com) +
 * discovery-first against `mpop[-sit].hepsiburada.com/product/api/products/*`.
 *
 * The catalog tracks per-field revision history, validation state,
 * matching state, and product-quality scoring per merchant SKU.
 */

/**
 * Paging for the catalog list endpoints. Hepsiburada pages the catalog by
 * **page number** (`page` / `size`, zero-based). `offset` / `limit` are
 * accepted as an alias so the methods plug straight into `paginateOffset`
 * from `@lonca/core` — `offset` must then be a whole multiple of `limit`,
 * because the API cannot address an arbitrary row offset. Use one style per
 * call, not both.
 *
 * @example
 * for await (const p of paginateOffset((q) => client.catalog.listProducts(q), { limit: 100 })) {
 *   console.log(p.merchantSku);
 * }
 */
export interface CatalogPagingParams {
  /** Zero-based page index. Omitted ⇒ Hepsiburada's default (`0`). */
  page?: number;
  /** Rows per page. Omitted ⇒ Hepsiburada applies its own default page size. */
  size?: number;
  /** Row offset (`paginateOffset` style). Must be a multiple of `limit`. */
  offset?: number;
  /** Rows per page (`paginateOffset` style alias of `size`). */
  limit?: number;
}

/** Query parameters for `catalog.listProducts()`. */
export interface ListCatalogProductsParams extends CatalogPagingParams {
  /** Narrow to one barcode (documented filter; verified live). */
  barcode?: string;
  /** Narrow to one merchant SKU (documented filter; verified live). */
  merchantSku?: string;
  /** Narrow to one Hepsiburada SKU (documented filter; verified live). */
  hbSku?: string;
}

/**
 * Catalog lifecycle status exactly as Hepsiburada's product API spells it —
 * the closed enum documented for the `productStatus` query parameter of
 * `products-by-merchant-and-status` (and the `status` field on
 * `all-products-of-merchant` rows). Values are UPPER_SNAKE; the API answers
 * HTTP 500 to anything else, including differently-cased spellings
 * (verified live 2026-08).
 */
export type CatalogProductLifecycleStatus =
  | 'WAITING'
  | 'IN_EXTERNAL_PROGRESS'
  | 'PRE_MATCHED'
  | 'MATCHED'
  | 'REJECTED'
  | 'MATCHED_WITH_STAGED'
  | 'MISSING_INFO'
  | 'CREATED'
  | 'BLOCKED';

/** Query parameters for `catalog.listProductsByStatus()`. */
export interface ListProductsByStatusParams extends CatalogPagingParams {
  /**
   * Lifecycle status to filter by — **required** by Hepsiburada (sent as the
   * `productStatus` query parameter). Use the API's UPPER_SNAKE vocabulary
   * (`'MATCHED'`, `'WAITING'`, …): the server returns HTTP 500 for unknown or
   * differently-cased values. Strings outside the documented union are passed
   * through unchanged so a newly added status works before this type catches up.
   */
  status: CatalogProductLifecycleStatus | (string & {});
  /**
   * Documented optional boolean filter, sent as `taskStatus`. Passed through
   * as-is — Hepsiburada does not document what it selects.
   */
  taskStatus?: boolean;
  /** Documented `version` query parameter (Hepsiburada's default is `1`). Passed through as-is. */
  version?: number;
  /**
   * @deprecated Not a documented parameter — Hepsiburada ignores it (verified
   *   live). It is no longer sent and will be removed in a future minor.
   */
  modifiedAtSince?: string;
}

/** One field on a catalog product (value + revision history). */
export interface CatalogField<V = string> {
  value: V;
  mandatory?: boolean;
  detail?: {
    revisedBy?: string;
    revisionDate?: string;
  };
  history?: Array<{
    revisedBy?: string;
    revisionDate?: string;
    value?: V;
  }>;
}

/** One row in the merchant's catalog. */
export interface CatalogProduct {
  id: string;
  createdAt?: string;
  createdBy?: string;
  modifiedAt?: string;
  modifiedBy?: string;
  merchantSku?: string;
  preMatchedSku?: string;
  siblingSku?: string;
  status?: string;
  listingStatus?: string;
  listingFailureReason?: string;
  validationStatus?: string;
  productType?: string;
  uploadDate?: string;
  productQuality?: number;
  categoryScore?: number;
  /**
   * Product title, resolved best-effort from the per-SKU `fields` map (or the
   * raw row). Hepsiburada's catalog keys this as `productName`/`name`, **not**
   * `title`. `undefined` when the catalog doesn't surface it — never guessed.
   */
  title?: string;
  /** Hepsiburada category id, resolved best-effort from `fields` / raw. */
  categoryId?: string;
  /** Human-readable category name, resolved best-effort from `fields` / raw. */
  categoryName?: string;
  /** Brand name, resolved best-effort from `fields` / raw. */
  brand?: string;
  /** Product description, resolved best-effort from `fields` / raw. */
  description?: string;
  /** Image URLs in display order, resolved best-effort from `fields` / raw. */
  images?: string[];
  /**
   * Raw per-field map (value + revision history) as returned by Hepsiburada.
   * The typed `title`/`categoryId`/… above are resolved from this; keep reading
   * `fields` directly for anything not promoted to a typed field.
   */
  fields?: Record<string, CatalogField<unknown>>;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/**
 * Receipt returned by upload endpoints — Hepsiburada synchronously returns
 * an opaque `trackingId` you can poll via `catalog.getProductStatus()`.
 */
export interface CatalogTrackingReceipt {
  trackingId: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/** Status check result for a tracking-id. */
export interface CatalogProductStatus {
  trackingId?: string;
  status?: string;
  message?: string;
  /** Per-row results when the upload contained multiple products. */
  rows?: Array<Record<string, unknown>>;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/** One tracking-id history entry. */
export interface TrackingIdHistoryEntry {
  trackingId?: string;
  createdAt?: string;
  status?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/**
 * Body for `catalog.uploadProductViaFile()` — an array of product objects
 * (one per SKU). Hepsiburada's portal documents the per-field rules
 * under "Ürün Bilgisi Gönderme".
 */
export type UploadProductsInput = unknown[];

/** Body for `catalog.uploadFastListing()`. */
export type FastListingInput = unknown[] | Record<string, unknown>;

/** Body for `catalog.approvePreMatch()` / `catalog.rejectPreMatch()`. */
export type PreMatchActionInput = Record<string, unknown>;

/** Body for `catalog.deleteByMerchantSkuList()` — Hepsiburada wants an SKU list. */
export type DeleteBySkuInput = { merchantSkuList?: string[]; [key: string]: unknown };

/** Body for `catalog.checkProductStatus()` — `{ trackingIds?: string[] }`. */
export type CheckProductStatusInput = Record<string, unknown>;
