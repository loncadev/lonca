/**
 * Hepsiburada Catalog/Category types.
 *
 * Source: `katalog-urun-entegrasyonu` v1.0 (developers.hepsiburada.com) +
 * discovery-first against `mpop[-sit].hepsiburada.com/product/api/*`.
 *
 * The catalog API uses a **Spring-style** wrapped pagination envelope
 * (`{ success, code, version, message, totalElements, totalPages, number,
 * numberOfElements, first, last, data: T[] }`) distinct from the OMS shape.
 */

/** Spring-style wrapped response from the catalog API. */
export interface CatalogPage<T> {
  number: number;
  totalPages: number;
  totalElements: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  success: boolean;
  code: number;
  message: string | null;
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
  page?: number;
  size?: number;
  /** Restrict to leaf (listable) categories. */
  leaf?: boolean;
  /** Filter by status string (`ACTIVE`, `INACTIVE`, …). */
  status?: string;
  /** Restrict to currently-available categories. */
  available?: boolean;
}

/** One row in the category tree. */
export interface Category {
  categoryId: number;
  name: string;
  displayName: string;
  parentCategoryId: number;
  paths: string[];
  leaf: boolean;
  status: string;
  type: string;
  sortId?: string;
  available: boolean;
  productTypes: unknown[];
  merge: boolean;
}

/** Query parameters for `categories.getAttributes()`. */
export interface GetAttributesParams {
  /** ISO timestamp — only return attributes modified at-or-after this. */
  modifiedAtSince?: string;
}

/** One attribute definition for a leaf category. */
export interface CategoryAttribute {
  id?: number | string;
  name?: string;
  externalName?: string;
  mandatory?: boolean;
  values?: unknown[];
  /**
   * Which bucket this attribute came from. Hepsiburada returns a leaf
   * category's attributes in three groups — `base` (common), `category`
   * (category-specific), and `variant` (variant-defining) — flattened into one
   * list here, with this tag so callers can tell them apart.
   */
  group?: 'base' | 'category' | 'variant';
  /** Untouched raw attribute object. */
  raw: Record<string, unknown>;
}

/** One attribute-value option (for enum-style attributes). */
export interface CategoryAttributeValue {
  id?: number | string;
  name?: string;
  externalName?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
