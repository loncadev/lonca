/**
 * Hepsiburada Catalog Product (merchant SKU rows) types.
 *
 * Source: `katalog-urun-entegrasyonu` v1.0 (developers.hepsiburada.com) +
 * discovery-first against `mpop[-sit].hepsiburada.com/product/api/products/*`.
 *
 * The catalog tracks per-field revision history, validation state,
 * matching state, and product-quality scoring per merchant SKU.
 */

/** Query parameters for `catalog.listProducts()`. */
export interface ListCatalogProductsParams {
  page?: number;
  size?: number;
}

/** Query parameters for `catalog.listProductsByStatus()`. */
export interface ListProductsByStatusParams {
  /** Hepsiburada lifecycle status (e.g. `Active`, `WaitingApproval`, `Rejected`). */
  status?: string;
  /** ISO timestamp. */
  modifiedAtSince?: string;
  page?: number;
  size?: number;
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
