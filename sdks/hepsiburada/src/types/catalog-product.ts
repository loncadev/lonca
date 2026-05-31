/**
 * Hepsiburada Catalog Product (merchant SKU rows) types.
 *
 * Source: discovery-first against
 * `mpop-sit.hepsiburada.com/product/api/products?merchantId=…` (2026-05).
 *
 * This is the **catalog** view of a merchant's SKUs — distinct from the
 * `listings` surface (which is stock/price/buybox-oriented). The catalog
 * tracks per-field revision history, validation status, matching state,
 * and product-quality scoring.
 *
 * Hepsiburada's raw shape is wide and undocumented (45+ top-level fields,
 * deeply nested `fields.{Barcode,price,tax_vat_rate,Image1,…}` with
 * per-field `value/history/detail/mandatory`). The SDK exposes a small
 * strict surface and keeps the full row available as `raw`.
 */

/** Query parameters for `catalog.listProducts()`. */
export interface ListCatalogProductsParams {
  /** Zero-based page index. Default: 0. */
  page?: number;
  /** Page size. Default: 100. */
  size?: number;
}

/** One field on a catalog product (value + revision history). */
export interface CatalogField<V = string> {
  /** Current value as last revised. */
  value: V;
  /** `true` if Hepsiburada considers this field mandatory. */
  mandatory?: boolean;
  /** Audit detail for the latest revision. */
  detail?: {
    revisedBy?: string;
    revisionDate?: string;
  };
  /** Full revision history (most-recent-last). */
  history?: Array<{
    revisedBy?: string;
    revisionDate?: string;
    value?: V;
  }>;
}

/** One row in the merchant's catalog. */
export interface CatalogProduct {
  /** Mongo-style document ID. */
  id: string;
  /** ISO timestamp the product was first created. */
  createdAt?: string;
  /** Merchant user / system that created the product. */
  createdBy?: string;
  /** ISO timestamp of the most recent modification. */
  modifiedAt?: string;
  /** Merchant user / system that last modified the product. */
  modifiedBy?: string;
  /** Merchant SKU (the merchant's external identifier). */
  merchantSku?: string;
  /** Hepsiburada SKU, once Hepsiburada has matched / created it. */
  preMatchedSku?: string;
  /** Sibling SKU group (variants of the same base product). */
  siblingSku?: string;
  /**
   * Product lifecycle status (`Draft`, `WaitingMatching`, `Active`,
   * `Rejected`, `Suspended`, …).
   */
  status?: string;
  /**
   * Listing creation flow status (`Created`, `Failed`, `Pending`, …).
   * Captured separately from `status` because Hepsiburada distinguishes
   * catalog-level lifecycle from listing-creation lifecycle.
   */
  listingStatus?: string;
  /** Last failure reason when `listingStatus === 'Failed'`. */
  listingFailureReason?: string;
  /** Validation phase outcome. */
  validationStatus?: string;
  /** Catalog Type Affinity (CTA) flag. */
  productType?: string;
  /** ISO timestamp the row was uploaded. */
  uploadDate?: string;
  /** Numeric product-quality score, when Hepsiburada has computed one. */
  productQuality?: number;
  /** Score from Hepsiburada's category-mapping model. */
  categoryScore?: number;
  /**
   * Per-field state map — keys are field names (Barcode, price,
   * Image1, …) and values are `CatalogField<…>` records carrying the
   * current value + revision history. Values are loosely typed as
   * `unknown` because Hepsiburada has hundreds of possible fields.
   */
  fields?: Record<string, CatalogField<unknown>>;
  /** Untouched raw row — every undocumented field lives here. */
  raw: Record<string, unknown>;
}
