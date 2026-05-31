import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CatalogPage,
  CatalogResult,
  Category,
  CategoryAttribute,
  ListCategoriesParams,
} from '../types/category.js';

const SERVICE = 'mpop' as const;

/**
 * Hepsiburada Catalog Categories (`katalog-urun-entegrasyonu` —
 * category surface).
 *
 * **Service base URL**: `mpop[-sit].hepsiburada.com`. The catalog API
 * lives under the `mpop` (Merchant Platform Operations) umbrella, NOT
 * under one of the dedicated `*-external` hosts.
 *
 * The catalog API uses a Spring-style envelope
 * (`{ success, code, totalElements, totalPages, data }`) — distinct from
 * the OMS / listings shapes.
 *
 * Hepsiburada doesn't publish an OpenAPI for this surface — endpoint
 * shapes were verified discovery-first against the SIT sandbox.
 */
export class CategoriesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 600, intervalMs: 60_000 });
  }

  /**
   * List the Hepsiburada category tree. Set `leaf: true` to restrict to
   * leaf categories (the ones that accept product listings).
   *
   * @example
   * ```ts
   * const page = await client.categories.list({ leaf: true, page: 0, size: 100 });
   * for (const c of page.data) console.log(c.categoryId, c.paths.join(' > '));
   * ```
   */
  async list(params: ListCategoriesParams = {}): Promise<CatalogPage<Category>> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: '/product/api/categories/get-all-categories',
      query: {
        page: params.page,
        size: params.size,
        leaf: params.leaf,
      },
      rateLimiter: this.limiter,
    });
    return normalizeCatalogPage<Category>(data, normalizeCategory);
  }

  /**
   * Get the attribute definitions for a leaf category.
   *
   * Hepsiburada only exposes attributes for **leaf** categories — calling
   * this against a non-leaf returns `code: 1003` which the SDK surfaces
   * as a `ValidationError`.
   *
   * @throws {ValidationError} when `categoryId` is missing, or when
   *   Hepsiburada returns `success: false` (e.g. non-leaf category).
   *
   * @example
   * ```ts
   * const attrs = await client.categories.getAttributes(60123456);
   * for (const a of attrs) console.log(a.name, a.mandatory ? '(req)' : '');
   * ```
   */
  async getAttributes(categoryId: number | string): Promise<CategoryAttribute[]> {
    if (categoryId === undefined || categoryId === null || categoryId === '') {
      throw new ValidationError({
        message: 'categories.getAttributes: categoryId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/product/api/categories/${encodeURIComponent(String(categoryId))}/attributes`,
      rateLimiter: this.limiter,
    });
    const result = normalizeCatalogResult<unknown>(data);
    if (!result.success) {
      throw new ValidationError({
        message: `categories.getAttributes: ${result.message ?? 'request rejected'} (code=${result.code})`,
      });
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.map(normalizeAttribute);
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

function normalizeAttribute(row: unknown): CategoryAttribute {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: CategoryAttribute = { raw: r };
  if (typeof r.id === 'number' || typeof r.id === 'string') out.id = r.id;
  if (typeof r.name === 'string') out.name = r.name;
  if (typeof r.externalName === 'string') out.externalName = r.externalName;
  if (typeof r.mandatory === 'boolean') out.mandatory = r.mandatory;
  if (Array.isArray(r.values)) out.values = r.values;
  return out;
}
