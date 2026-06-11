import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CatalogPage,
  CatalogResult,
  Category,
  CategoryAttribute,
  CategoryAttributeValue,
  GetAttributesParams,
  ListCategoriesParams,
} from '../types/category.js';

const SERVICE = 'mpop' as const;
const BASE_PATH = '/product/api/categories';

/**
 * Hepsiburada Categories (`katalog-urun-entegrasyonu` — category surface).
 *
 * **Service base URL**: `mpop[-sit].hepsiburada.com` with `/product/api/`
 * prefix routed to the catalog category microservice.
 *
 * Three operations: list categories, list attributes (leaf-only), list
 * attribute values (for enum-style attributes).
 */
export class CategoriesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 600, intervalMs: 60_000 });
  }

  /** List the category tree. ~27,000 categories total — use `leaf: true` to filter to listable ones. */
  async list(params: ListCategoriesParams = {}): Promise<CatalogPage<Category>> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/get-all-categories`,
      query: {
        page: params.page,
        size: params.size,
        leaf: params.leaf,
        status: params.status,
        available: params.available,
      },
      rateLimiter: this.limiter,
    });
    return normalizeCatalogPage<Category>(data, normalizeCategory);
  }

  /**
   * Get attribute definitions for a leaf category.
   *
   * @throws {ValidationError} when `categoryId` is missing, or when
   *   Hepsiburada returns `success: false` (e.g. non-leaf category, code 1003).
   */
  async getAttributes(
    categoryId: number | string,
    params: GetAttributesParams = {},
  ): Promise<CategoryAttribute[]> {
    if (categoryId === undefined || categoryId === null || categoryId === '') {
      throw new ValidationError({ message: 'categories.getAttributes: categoryId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/${encodeURIComponent(String(categoryId))}/attributes`,
      query: { modifiedAtSince: params.modifiedAtSince },
      rateLimiter: this.limiter,
    });
    const result = normalizeCatalogResult<unknown>(data);
    if (!result.success) {
      throw new ValidationError({
        message: `categories.getAttributes: ${result.message ?? 'request rejected'} (code=${result.code})`,
      });
    }
    // Hepsiburada returns attributes nested in `data` under three buckets
    // (`baseAttributes` / `attributes` / `variantAttributes`) — verified live —
    // not as a bare array. Flatten them into one list, tagging each with its
    // group. Fall back to a bare array for any other/legacy shape.
    if (Array.isArray(result.data)) {
      return result.data.map((row) => normalizeAttribute(row));
    }
    const d = (result.data && typeof result.data === 'object' ? result.data : {}) as Record<string, unknown>;
    const buckets: Array<[string, CategoryAttribute['group']]> = [
      ['baseAttributes', 'base'],
      ['attributes', 'category'],
      ['variantAttributes', 'variant'],
    ];
    const out: CategoryAttribute[] = [];
    for (const [key, group] of buckets) {
      const arr = d[key];
      if (Array.isArray(arr)) for (const row of arr) out.push(normalizeAttribute(row, group));
    }
    return out;
  }

  /**
   * Get the allowed values for an enum-style attribute on a leaf category.
   *
   * @throws {ValidationError} when either id is missing or when Hepsiburada
   *   rejects (success: false).
   */
  async getAttributeValues(
    categoryId: number | string,
    attributeId: number | string,
  ): Promise<CategoryAttributeValue[]> {
    if (categoryId === undefined || categoryId === null || categoryId === '') {
      throw new ValidationError({
        message: 'categories.getAttributeValues: categoryId is required',
      });
    }
    if (attributeId === undefined || attributeId === null || attributeId === '') {
      throw new ValidationError({
        message: 'categories.getAttributeValues: attributeId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/${encodeURIComponent(String(categoryId))}/attribute/${encodeURIComponent(String(attributeId))}/values`,
      rateLimiter: this.limiter,
    });
    const result = normalizeCatalogResult<unknown>(data);
    if (!result.success) {
      throw new ValidationError({
        message: `categories.getAttributeValues: ${result.message ?? 'request rejected'} (code=${result.code})`,
      });
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.map(normalizeAttributeValue);
  }
}

function normalizeCatalogPage<T>(data: unknown, mapRow: (row: unknown) => T): CatalogPage<T> {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rows = Array.isArray(obj.data) ? obj.data.map(mapRow) : [];
  return {
    number: Number(obj.number ?? 0),
    totalPages: Number(obj.totalPages ?? 0),
    totalElements: Number(obj.totalElements ?? 0),
    numberOfElements: Number(obj.numberOfElements ?? 0),
    first: Boolean(obj.first),
    last: Boolean(obj.last),
    success: Boolean(obj.success),
    code: Number(obj.code ?? 0),
    message: typeof obj.message === 'string' ? obj.message : null,
    data: rows,
  };
}

function normalizeCatalogResult<T>(data: unknown): CatalogResult<T> {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    success: Boolean(obj.success),
    code: Number(obj.code ?? 0),
    message: typeof obj.message === 'string' ? obj.message : null,
    data: obj.data as T,
  };
}

function normalizeCategory(row: unknown): Category {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    categoryId: Number(r.categoryId ?? 0),
    name: String(r.name ?? ''),
    displayName: String(r.displayName ?? r.name ?? ''),
    parentCategoryId: Number(r.parentCategoryId ?? 0),
    paths: Array.isArray(r.paths) ? r.paths.map(String) : [],
    leaf: Boolean(r.leaf),
    status: String(r.status ?? ''),
    type: String(r.type ?? ''),
    sortId: typeof r.sortId === 'string' ? r.sortId : undefined,
    available: Boolean(r.available),
    productTypes: Array.isArray(r.productTypes) ? r.productTypes : [],
    merge: Boolean(r.merge),
  };
}

function normalizeAttribute(row: unknown, group?: CategoryAttribute['group']): CategoryAttribute {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: CategoryAttribute = { raw: r };
  if (typeof r.id === 'number' || typeof r.id === 'string') out.id = r.id;
  if (typeof r.name === 'string') out.name = r.name;
  if (typeof r.externalName === 'string') out.externalName = r.externalName;
  if (typeof r.mandatory === 'boolean') out.mandatory = r.mandatory;
  if (Array.isArray(r.values)) out.values = r.values;
  if (group) out.group = group;
  return out;
}

function normalizeAttributeValue(row: unknown): CategoryAttributeValue {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: CategoryAttributeValue = { raw: r };
  if (typeof r.id === 'number' || typeof r.id === 'string') out.id = r.id;
  if (typeof r.name === 'string') out.name = r.name;
  if (typeof r.externalName === 'string') out.externalName = r.externalName;
  return out;
}
