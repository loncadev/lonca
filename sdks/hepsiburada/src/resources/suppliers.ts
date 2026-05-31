import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CreateListingUpdateRequestInput,
  ListingUpdateRequestSearchInput,
  OpenPurchaseOrderSearchInput,
  SupplierListingSearchInput,
} from '../types/supplier.js';

const SERVICE = 'oms' as const;

/**
 * Hepsiburada Supplier integration (`tedarikci-entegrasyonu`).
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`.
 *
 * Covers purchase-order discovery, inventory search, and the offer
 * (`listingUpdateRequest`) lifecycle for suppliers.
 *
 * NOTE: Sandbox `beekod_dev` merchant doesn't have permission for this
 * surface; SIT calls return `403`. Endpoints typed from the developer-portal
 * spec; live-tested in production by integrators with the supplier role.
 */
export class SuppliersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /** Search open purchase orders. */
  async searchOpenPurchaseOrders(input: OpenPurchaseOrderSearchInput): Promise<unknown> {
    this.assertInput(input, 'suppliers.searchOpenPurchaseOrders');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/openPurchaseOrders/search`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Search the supplier's inventory listings. */
  async searchSupplierListings(input: SupplierListingSearchInput): Promise<unknown> {
    this.assertInput(input, 'suppliers.searchSupplierListings');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/supplierlistings/search`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Search the supplier's offers (`listingUpdateRequests`). */
  async searchListingUpdateRequests(input: ListingUpdateRequestSearchInput): Promise<unknown> {
    this.assertInput(input, 'suppliers.searchListingUpdateRequests');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/listingUpdateRequests/search`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Get a single offer by request id. */
  async getListingUpdateRequest(requestId: string): Promise<unknown> {
    if (!requestId) {
      throw new ValidationError({
        message: 'suppliers.getListingUpdateRequest: requestId is required',
      });
    }
    return this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/listingUpdateRequests/${encodeURIComponent(requestId)}`,
      rateLimiter: this.limiter,
    });
  }

  /** Create a new offer (`listingUpdateRequest`). */
  async createListingUpdateRequest(input: CreateListingUpdateRequestInput): Promise<unknown> {
    this.assertInput(input, 'suppliers.createListingUpdateRequest');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/listingUpdateRequests`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  private merchantSegment(): string {
    return encodeURIComponent(this.transport.merchantId);
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }
}
