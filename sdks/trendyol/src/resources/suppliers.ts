import { TokenBucketRateLimiter } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { SupplierAddress, SupplierAddressType } from '../types/supplier-address.js';

/**
 * One `supplierAddresses[]` row — the fields the docs (`SupplierAddress`) and the prod wire
 * (2026-10-10) agree on. There is no `name` / `fullName` on the wire.
 */
interface TrendyolSupplierAddressNode {
  id: number;
  addressType?: string;
  isShipmentAddress?: boolean;
  isReturningAddress?: boolean;
  isInvoiceAddress?: boolean;
  isDefault?: boolean;
  address?: string;
  fullAddress?: string;
  country?: string;
  city?: string;
  cityCode?: number;
  district?: string;
  districtId?: number;
  postCode?: string;
}

interface TrendyolSupplierAddressesResponse {
  supplierAddresses: TrendyolSupplierAddressNode[];
}

const VALID_TYPES: ReadonlySet<SupplierAddressType> = new Set([
  'SHIPMENT',
  'RETURNING',
  'INVOICE',
  'WAREHOUSE',
]);

function normalizeAddressType(raw: string | undefined): SupplierAddressType {
  // The docs spell the enum `Shipment` / `Invoice` / `Returning`; compare case-insensitively.
  const upper = typeof raw === 'string' ? raw.toUpperCase() : undefined;
  if (upper && VALID_TYPES.has(upper as SupplierAddressType)) {
    return upper as SupplierAddressType;
  }
  // Trendyol historically used suffixes like "_ADDRESS" — strip and re-check.
  const stripped = upper?.replace(/_ADDRESS$/, '');
  if (stripped && VALID_TYPES.has(stripped as SupplierAddressType)) {
    return stripped as SupplierAddressType;
  }
  return 'SHIPMENT';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;
}

function normalizeAddress(node: TrendyolSupplierAddressNode): SupplierAddress {
  return {
    id: String(node.id),
    addressType: normalizeAddressType(node.addressType),
    isShipmentAddress: node.isShipmentAddress ?? false,
    isReturningAddress: node.isReturningAddress ?? false,
    isInvoiceAddress: node.isInvoiceAddress ?? false,
    isDefault: node.isDefault ?? false,
    address: node.address,
    fullAddress: node.fullAddress,
    country: node.country,
    city: node.city,
    cityCode: optionalString(node.cityCode),
    district: node.district,
    districtId: optionalString(node.districtId),
    postCode: node.postCode,
  };
}

/** Default cache TTL: 1 hour, matching Trendyol's `1 req/hour` service limit. */
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

export interface SuppliersResourceOptions {
  /** Override the in-memory cache TTL. Defaults to 1 hour. */
  cacheTtlMs?: number;
}

interface CacheEntry {
  value: SupplierAddress[];
  expiresAt: number;
}

/**
 * Trendyol supplier address endpoints.
 *
 * **Critical:** Trendyol rate-limits `getSuppliersAddresses` to **1 request
 * per hour per seller**. This resource therefore wraps the endpoint with an
 * in-memory cache (default TTL: 1 hour) so callers can request addresses
 * as often as needed without tripping the limit.
 *
 * Use `{ forceRefresh: true }` or `invalidateCache()` only when you know the
 * address list changed in the Partner Panel.
 */
export class SuppliersResource {
  private cache: CacheEntry | null = null;
  private readonly cacheTtlMs: number;
  private readonly limiter: TokenBucketRateLimiter;
  private inflight: Promise<SupplierAddress[]> | null = null;

  constructor(
    private readonly transport: TrendyolTransport,
    options: SuppliersResourceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.limiter = new TokenBucketRateLimiter({
      capacity: 1,
      intervalMs: DEFAULT_CACHE_TTL_MS,
    });
  }

  /**
   * List the seller's registered addresses (shipment, returning, invoice, warehouse).
   *
   * Returns the cached value if it is still fresh. Concurrent calls share a
   * single in-flight request.
   */
  async getAddresses(options: { forceRefresh?: boolean } = {}): Promise<SupplierAddress[]> {
    if (!options.forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchFresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Drop the cache; the next `getAddresses()` call hits the API. */
  invalidateCache(): void {
    this.cache = null;
  }

  private async fetchFresh(): Promise<SupplierAddress[]> {
    const data = await this.transport.request<TrendyolSupplierAddressesResponse>({
      method: 'GET',
      path: `/integration/sellers/${this.transport.sellerId}/addresses`,
      rateLimiter: this.limiter,
    });
    const items = data.supplierAddresses.map(normalizeAddress);
    this.cache = { value: items, expiresAt: Date.now() + this.cacheTtlMs };
    return items;
  }
}
