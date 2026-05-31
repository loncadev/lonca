/**
 * Hepsiburada Catalog/Category types.
 *
 * Source: discovery-first against `mpop-sit.hepsiburada.com/product/api/*`
 * (2026-05). Hepsiburada doesn't publish an OpenAPI for the catalog API —
 * shapes derived from live SIT responses.
 *
 * The catalog API uses a **Spring-style** wrapped pagination envelope
 * (`{ success, code, version, message, totalElements, totalPages, number,
 * numberOfElements, first, last, data: T[] }`) — distinct from the OMS
 * `{ totalCount, items }` shape.
 */

/** Spring-style wrapped response from the catalog API. */
export interface CatalogPage<T> {
  /** Pages are zero-indexed. */
  number: number;
  /** Total number of pages at the requested `size`. */
  totalPages: number;
  /** Total number of rows matching the query. */
  totalElements: number;
  /** Number of rows on this page (≤ requested `size`). */
  numberOfElements: number;
  /** `true` when this is the first page. */
  first: boolean;
  /** `true` when this is the last page. */
  last: boolean;
  /** API status flag — `true` on success. */
  success: boolean;
  /** API status code — `0` on success. */
  code: number;
  /** Free-form error message — `null` on success. */
  message: string | null;
  /** Page rows. */
  data: T[];
}

/** Wrapper for non-paged responses (e.g. category attributes). */
export interface CatalogResult<T> {
  success: boolean;
  code: number;
  message: string | null;
  data: T;
}

/** Query parameters for `categories.list()`. */
export interface ListCategoriesParams {
  /** Zero-based page index. Default: 0. */
  page?: number;
  /** Page size. Default: 100. */
  size?: number;
  /**
   * Filter by leaf category. `true` returns only leaf categories
   * (the ones you can list products under).
   */
  leaf?: boolean;
}

/** One row in the category tree. */
export interface Category {
  /** Numeric category ID — used as the path param for sub-queries. */
  categoryId: number;
  /** Internal name. */
  name: string;
  /** Human-readable name shown in the merchant portal. */
  displayName: string;
  /** Parent category ID (`null` / `0` at the root). */
  parentCategoryId: number;
  /** Breadcrumb of category names from root to this node. */
  paths: string[];
  /** `true` when this category accepts product listings. */
  leaf: boolean;
  /** Category lifecycle status (`ACTIVE` / `INACTIVE` / `DEPRECATED`). */
  status: string;
  /** Source: `HB` for Hepsiburada-managed categories. */
  type: string;
  /** Sort index (string in the wire shape). */
  sortId?: string;
  /** `true` when products can currently be listed under this category. */
  available: boolean;
  /**
   * Product types Hepsiburada has defined under this category — used for
   * Catalog Type Affinity. Empty for non-leaf categories.
   */
  productTypes: unknown[];
  /** `true` when this category is part of a recent merge operation. */
  merge: boolean;
}

/**
 * One attribute definition returned by `categories.getAttributes()`. The
 * full Hepsiburada attribute shape is rich (mandatory flag, allowed
 * values, multi-select, dependencies); the SDK exposes the documented
 * fields and keeps `raw` for everything else.
 *
 * Note: `getAttributes()` only works against **leaf categories**. Calling
 * it on a non-leaf returns `{ success: false, code: 1003 }` which the SDK
 * surfaces as a `ValidationError`.
 */
export interface CategoryAttribute {
  /** Attribute ID. */
  id?: number | string;
  /** Attribute display name (Turkish). */
  name?: string;
  /** Attribute slug / internal name. */
  externalName?: string;
  /** `true` if the attribute is required when creating a product. */
  mandatory?: boolean;
  /** Allowed values (for enum-style attributes). */
  values?: unknown[];
  /** Untouched raw attribute object. */
  raw: Record<string, unknown>;
}
