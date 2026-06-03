import { TokenBucketRateLimiter, type CursorPage, type CursorPaginationParams } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { Brand } from '../types/brand.js';

/**
 * Default page size when callers don't specify `limit`.
 *
 * NOTE: Trendyol's live API enforces a **minimum** page size of 1000 — any smaller
 * `limit` value is silently ignored server-side and you still receive ~1000 brands
 * per page. The `limit` parameter is kept on the SDK signature for forward
 * compatibility, but in practice you'll always receive 1000 per request.
 */
const DEFAULT_PAGE_SIZE = 1000;

interface TrendyolBrandListResponse {
  brands: Array<{ id: number; name: string }>;
  totalPages: number;
  totalElements: number;
}

/**
 * Trendyol brand-list endpoint group.
 *
 * Rate limit: 50 req/min (per Trendyol service limits).
 *
 * Trendyol uses page-based pagination internally; we expose the cursor-based
 * `CursorPage` shape from `@lonca/core` so callers can drive everything with
 * `paginate()` and stay consistent across Lonca SDKs.
 */
export class BrandsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 50, intervalMs: 60_000 });
  }

  /**
   * List Trendyol brands, one page at a time.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const brand of paginate((p) => client.brands.list(p))) {
   *   console.log(brand.id, brand.name);
   * }
   * ```
   */
  async list(params: CursorPaginationParams = {}): Promise<CursorPage<Brand>> {
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const size = params.limit ?? DEFAULT_PAGE_SIZE;

    const data = await this.transport.request<TrendyolBrandListResponse>({
      method: 'GET',
      path: '/integration/product/brands',
      query: { page, size },
      rateLimiter: this.limiter,
    });

    const items: Brand[] = data.brands.map((b) => ({ id: String(b.id), name: b.name }));
    const nextCursor = page + 1 < data.totalPages ? String(page + 1) : undefined;

    return nextCursor !== undefined ? { items, nextCursor } : { items };
  }

  /**
   * Search brands by name. Useful when you need a brand's numeric ID for
   * `createProducts` and don't want to page through the full `list()`
   * (1000 brands per page).
   *
   * **Wire fact (verified STAGE 2026-05-25):** Trendyol's
   * doc claims this is a case-sensitive *exact* match, but live behaviour
   * is **substring + case-insensitive** — `search('Trendyol')` returns
   * 17 hits including `TRENDYOLMILLA`, `trendyol vavist`, `Trendyol Üyelik`.
   * Plan for ranking your results client-side if you need an exact match.
   * The endpoint returns an empty array when nothing matches (no 404).
   *
   * @param name The brand name to search for.
   */
  async search(name: string): Promise<Brand[]> {
    const data = await this.transport.request<Array<{ id: number; name: string }>>({
      method: 'GET',
      path: '/integration/product/brands/by-name',
      query: { name },
      rateLimiter: this.limiter,
    });
    return (data ?? []).map((b) => ({ id: String(b.id), name: b.name }));
  }
}
