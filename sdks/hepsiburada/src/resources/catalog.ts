import { TokenBucketRateLimiter } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type { CatalogProduct, ListCatalogProductsParams } from '../types/catalog-product.js';

const SERVICE = 'mpop' as const;

/**
 * Hepsiburada Catalog Products (`katalog-urun-entegrasyonu` +
 * `urun-guncelleme-entegrasyonu` — read surface).
 *
 * Lists the merchant's catalog rows — each row carries per-field
 * revision history, validation state, matching state, and product-quality
 * scoring. This is the **catalog** view; for stock / price / buybox use
 * the `listings` resource instead.
 *
 * **Service base URL**: `mpop[-sit].hepsiburada.com`.
 *
 * The endpoint returns a **raw array** (no envelope) and is filtered by
 * `merchantId` via query string (NOT a path param) — distinct from the
 * listing / OMS conventions.
 *
 * Hepsiburada doesn't publish an OpenAPI for this surface — endpoint
 * shapes were verified discovery-first against the SIT sandbox.
 */
export class CatalogResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * List the merchant's catalog products.
   *
   * @example
   * ```ts
   * const rows = await client.catalog.listProducts({ page: 0, size: 100 });
   * for (const p of rows) console.log(p.merchantSku, p.status, p.productQuality);
   * ```
   */
  async listProducts(params: ListCatalogProductsParams = {}): Promise<CatalogProduct[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: '/product/api/products',
      query: {
        merchantId: this.transport.merchantId,
        page: params.page,
        size: params.size,
      },
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data) ? data : [];
    return rows.map(normalizeCatalogProduct);
  }
}

function normalizeCatalogProduct(row: unknown): CatalogProduct {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: CatalogProduct = { id: String(r.id ?? ''), raw: r };
  if (typeof r.createdAt === 'string') out.createdAt = r.createdAt;
  if (typeof r.createdBy === 'string') out.createdBy = r.createdBy;
  if (typeof r.modifiedAt === 'string') out.modifiedAt = r.modifiedAt;
  if (typeof r.modifiedBy === 'string') out.modifiedBy = r.modifiedBy;
  if (typeof r.merchantSku === 'string') out.merchantSku = r.merchantSku;
  if (typeof r.preMatchedSku === 'string') out.preMatchedSku = r.preMatchedSku;
  if (typeof r.siblingSku === 'string') out.siblingSku = r.siblingSku;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.listingStatus === 'string') out.listingStatus = r.listingStatus;
  if (typeof r.listingFailureReason === 'string') out.listingFailureReason = r.listingFailureReason;
  if (typeof r.validationStatus === 'string') out.validationStatus = r.validationStatus;
  if (typeof r.productType === 'string') out.productType = r.productType;
  if (typeof r.uploadDate === 'string') out.uploadDate = r.uploadDate;
  if (typeof r.productQuality === 'number') out.productQuality = r.productQuality;
  if (typeof r.categoryScore === 'number') out.categoryScore = r.categoryScore;
  if (r.fields && typeof r.fields === 'object') {
    out.fields = r.fields as Record<string, never>;
  }
  return out;
}
