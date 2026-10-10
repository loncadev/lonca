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

/** One brand as Trendyol sends it (`GET /product/brands`, `GET /product/brands/by-name`). */
interface TrendyolBrandNode {
  id: number;
  name: string;
  /** Not in the docs; present on every brand in the prod wire baseline (2026-10-09). */
  luxe?: boolean;
}

/**
 * `GET /product/brands` response.
 *
 * Neither the docs nor the prod wire (baseline 2026-10-09: `{ brands: [{ id, luxe, name }] }`)
 * carry a page count, so `totalPages` / `totalElements` are optional — they are honoured only
 * if Trendyol ever sends them. See {@link BrandsResource.list} for how the next page is found.
 */
interface TrendyolBrandListResponse {
  brands?: TrendyolBrandNode[];
  totalPages?: number;
  totalElements?: number;
}

function toBrand(node: TrendyolBrandNode): Brand {
  const brand: Brand = { id: String(node.id), name: node.name };
  if (typeof node.luxe === 'boolean') brand.luxe = node.luxe;
  return brand;
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
   * **Next-page heuristic.** Trendyol's brand list carries no page count (neither the docs
   * nor the prod wire have `totalPages` / `totalElements` — the response is just
   * `{ brands: [...] }`). So when `totalPages` is absent, a **full page** (at least `limit`
   * brands — Trendyol may send ~1000 even for a smaller `limit`) means "there may be more"
   * and sets `nextCursor`; a short page is the last one. When the
   * total is an exact multiple of the page size, `paginate()` makes one extra request that
   * comes back empty and stops there. If Trendyol ever sends `totalPages`, it wins.
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

    const brands = data?.brands ?? [];
    const items: Brand[] = brands.map(toBrand);
    const hasMore =
      typeof data?.totalPages === 'number'
        ? page + 1 < data.totalPages
        : size > 0 && brands.length >= size;
    const nextCursor = hasMore ? String(page + 1) : undefined;

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
    const data = await this.transport.request<TrendyolBrandNode[]>({
      method: 'GET',
      path: '/integration/product/brands/by-name',
      query: { name },
      rateLimiter: this.limiter,
    });
    return (data ?? []).map(toBrand);
  }
}
