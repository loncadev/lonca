import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  ProductUpdateHistoryEntry,
  ProductUpdateInput,
  ProductUpdateReceipt,
  ProductUpdateStatus,
} from '../types/product-update.js';

const SERVICE = 'oms' as const;
const BASE_PATH = '/api/integrator';

/**
 * Hepsiburada Product Updates (`urun-guncelleme-entegrasyonu`).
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`. 3-endpoint
 * surface — submit updates, poll status, query update history per
 * (merchantId, hbSku) pair.
 *
 * NOTE: Sandbox `beekod_dev` merchant doesn't have permission for this
 * surface; SIT calls return `403`. Behavior verified against the
 * developer-portal spec; live-tested in production by integrators with
 * the right scope.
 */
export class ProductUpdatesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * Submit a batch of product updates. Returns a `trackingId` you can poll
   * via `getUpdateStatus(trackingId)`.
   */
  async importUpdates(updates: ProductUpdateInput): Promise<ProductUpdateReceipt> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError({
        message: 'productUpdates.importUpdates: updates array is required (non-empty)',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/import`,
      body: updates,
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    return { trackingId: String(obj.trackingId ?? obj.id ?? ''), raw: obj };
  }

  /** Get the status of a previously-submitted update batch. */
  async getUpdateStatus(trackingId: string): Promise<ProductUpdateStatus> {
    if (!trackingId) {
      throw new ValidationError({
        message: 'productUpdates.getUpdateStatus: trackingId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/status/${encodeURIComponent(trackingId)}`,
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const out: ProductUpdateStatus = { raw: obj };
    if (typeof obj.trackingId === 'string') out.trackingId = obj.trackingId;
    if (typeof obj.status === 'string') out.status = obj.status;
    if (typeof obj.message === 'string') out.message = obj.message;
    if (Array.isArray(obj.rows)) out.rows = obj.rows as Array<Record<string, unknown>>;
    else if (Array.isArray(obj.items)) out.rows = obj.items as Array<Record<string, unknown>>;
    return out;
  }

  /** Get the full update history for one (merchantId, hbSku) pair. */
  async getUpdateHistory(hbSku: string): Promise<ProductUpdateHistoryEntry[]> {
    if (!hbSku) {
      throw new ValidationError({
        message: 'productUpdates.getUpdateHistory: hbSku is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/merchant/${encodeURIComponent(this.transport.merchantId)}/hbSku/${encodeURIComponent(hbSku)}`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const out: ProductUpdateHistoryEntry = { raw: r };
      if (typeof r.trackingId === 'string') out.trackingId = r.trackingId;
      if (typeof r.status === 'string') out.status = r.status;
      if (typeof r.modifiedAt === 'string') out.modifiedAt = r.modifiedAt;
      return out;
    });
  }
}
