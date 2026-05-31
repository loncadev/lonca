import { TokenBucketRateLimiter } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  ListOrdersParams,
  ListPackagesParams,
  Order,
  OrdersPage,
  ShippingPackage,
} from '../types/order.js';

const SERVICE = 'oms' as const;

/**
 * Hepsiburada Order Management (`siparis-olusturma-entegrasyonu` +
 * `oms-fulfilment-entegrasyonu`) — list orders and shipping packages
 * against the merchant's OMS.
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`.
 *
 * The orders surface returns a `{ totalCount, items[] }` envelope;
 * the packages surface returns a **raw array** (no envelope) — both shapes
 * are normalized by this resource.
 *
 * Hepsiburada doesn't publish an OpenAPI for this surface — endpoint
 * shapes were verified discovery-first against the SIT sandbox.
 */
export class OrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * List orders for the merchant.
   *
   * @example
   * ```ts
   * const page = await client.orders.list({ status: 'Open', limit: 100 });
   * for (const o of page.items) console.log(o.orderNumber, o.status);
   * ```
   */
  async list(params: ListOrdersParams = {}): Promise<OrdersPage> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/orders/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query: {
        offset: params.offset,
        limit: params.limit,
        status: params.status,
        beginDate: params.beginDate,
        endDate: params.endDate,
      },
      rateLimiter: this.limiter,
    });
    return normalizeOrdersPage(data);
  }

  /**
   * List shipping packages for the merchant. Each order can produce one
   * or more packages (depending on split-shipment policy).
   *
   * @example
   * ```ts
   * const pkgs = await client.orders.listPackages({ status: 'Open' });
   * for (const p of pkgs) console.log(p.packageNumber, p.cargoCompany);
   * ```
   */
  async listPackages(params: ListPackagesParams = {}): Promise<ShippingPackage[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/packages/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query: {
        offset: params.offset,
        limit: params.limit,
        status: params.status,
        beginDate: params.beginDate,
        endDate: params.endDate,
      },
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data) ? data : [];
    return rows.map(normalizePackage);
  }
}

function normalizeOrdersPage(data: unknown): OrdersPage {
  if (!data || typeof data !== 'object') {
    return { totalCount: 0, limit: 0, offset: 0, pageCount: 0, items: [] };
  }
  const obj = data as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items.map(normalizeOrder) : [];
  return {
    totalCount: Number(obj.totalCount ?? 0),
    limit: Number(obj.limit ?? 0),
    offset: Number(obj.offset ?? 0),
    pageCount: Number(obj.pageCount ?? 0),
    items,
  };
}

function normalizeOrder(row: unknown): Order {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: Order = { raw: r };
  if (typeof r.orderNumber === 'string') out.orderNumber = r.orderNumber;
  if (typeof r.externalOrderNumber === 'string') out.externalOrderNumber = r.externalOrderNumber;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.createdDate === 'string') out.createdDate = r.createdDate;
  if (typeof r.modifiedDate === 'string') out.modifiedDate = r.modifiedDate;
  if (r.total !== undefined && (typeof r.total === 'number' || typeof r.total === 'string')) {
    out.total = r.total;
  }
  return out;
}

function normalizePackage(row: unknown): ShippingPackage {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: ShippingPackage = { raw: r };
  if (typeof r.packageNumber === 'string') out.packageNumber = r.packageNumber;
  if (typeof r.orderNumber === 'string') out.orderNumber = r.orderNumber;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.cargoCompany === 'string') out.cargoCompany = r.cargoCompany;
  if (typeof r.trackingNumber === 'string') out.trackingNumber = r.trackingNumber;
  if (typeof r.createdDate === 'string') out.createdDate = r.createdDate;
  return out;
}
