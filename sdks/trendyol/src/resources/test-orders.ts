import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { CreateTestOrderInput, TestOrderStatus } from '../types/misc.js';

/**
 * STAGE-only helper endpoints for creating + driving test orders /
 * test claims through their state machine. **Do not use in PROD** —
 * Trendyol's test endpoints are scoped to the test environment.
 */
export class TestOrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /**
   * Create a test order with the given customer / addresses / lines. The
   * SDK forwards the typed payload verbatim — drill into Trendyol's
   * `createTestOrder` doc for inner field rules.
   *
   * @throws {ValidationError} when required top-level fields are missing.
   */
  async create(input: CreateTestOrderInput): Promise<unknown> {
    for (const k of ['customer', 'invoiceAddress', 'shippingAddress', 'seller', 'lines']) {
      if (!input?.[k]) {
        throw new ValidationError({ message: `testOrders.create: ${k} is required` });
      }
    }
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/test/order/orders/core`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Push a test shipment package to the given status. */
  async updateStatus(packageId: string | number, status: TestOrderStatus): Promise<unknown> {
    return this.transport.request<unknown>({
      method: 'PUT',
      path: `/integration/test/order/sellers/${this.sellerId}/shipment-packages/${encodeURIComponent(String(packageId))}/status`,
      body: { status },
      rateLimiter: this.limiter,
    });
  }

  /** Move test claims to the `WaitingInAction` state. */
  async setClaimsWaitingInAction(): Promise<unknown> {
    return this.transport.request<unknown>({
      method: 'PUT',
      path: `/integration/test/order/sellers/${this.sellerId}/claims/waiting-in-action`,
      rateLimiter: this.limiter,
    });
  }
}
