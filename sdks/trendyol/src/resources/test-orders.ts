import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  CreateTestOrderInput,
  CreateTestOrderResult,
  SetClaimsWaitingInActionInput,
  TestOrderStatus,
} from '../types/misc.js';

/**
 * STAGE-only helper endpoints for creating + driving test orders /
 * test claims through their state machine. **Do not use in PROD** —
 * Trendyol's test endpoints are scoped to the test environment.
 */
export class TestOrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /**
   * Create a test order with the given customer / addresses / lines. The
   * SDK forwards the typed payload verbatim — drill into Trendyol's
   * `createTestOrder` doc for inner field rules.
   *
   * Trendyol documents the response as `{ orderNumber: string }`; the SDK
   * surfaces it as `orderNumber` and keeps the untouched body on `raw`.
   *
   * @throws {ValidationError} when required top-level fields are missing.
   */
  async create(input: CreateTestOrderInput): Promise<CreateTestOrderResult> {
    for (const k of ['customer', 'invoiceAddress', 'shippingAddress', 'seller', 'lines']) {
      if (!input?.[k]) {
        throw new ValidationError({ message: `testOrders.create: ${k} is required` });
      }
    }
    const raw = await this.transport.request<{ orderNumber?: unknown } | undefined>({
      method: 'POST',
      path: `/integration/test/order/orders/core`,
      body: input,
      rateLimiter: this.limiter,
    });
    const out: CreateTestOrderResult = { raw };
    if (typeof raw?.orderNumber === 'string') out.orderNumber = raw.orderNumber;
    else if (typeof raw?.orderNumber === 'number') out.orderNumber = String(raw.orderNumber);
    return out;
  }

  /**
   * Push a test shipment package to the given status. Trendyol documents
   * the response as a bare `200 OK` (no body), hence `MutationResult`.
   */
  async updateStatus(packageId: string | number, status: TestOrderStatus): Promise<MutationResult> {
    const raw = await this.transport.request<unknown>({
      method: 'PUT',
      path: `/integration/test/order/sellers/${this.transport.sellerId}/shipment-packages/${encodeURIComponent(String(packageId))}/status`,
      body: { status },
      rateLimiter: this.limiter,
    });
    return { raw };
  }

  /**
   * Move test claims to the `WaitingInAction` state. Trendyol's
   * `updateTestOrderStatus` doc shows a `{ shipmentPackageId }` body (the
   * `orderShipmentPackageId` from `claims.list`); pass `input` to send it —
   * omitted, the request goes out body-less as before. Documented response
   * is a bare `200 OK` (no body), hence `MutationResult`.
   */
  async setClaimsWaitingInAction(input?: SetClaimsWaitingInActionInput): Promise<MutationResult> {
    const raw = await this.transport.request<unknown>({
      method: 'PUT',
      path: `/integration/test/order/sellers/${this.transport.sellerId}/claims/waiting-in-action`,
      ...(input ? { body: input } : {}),
      rateLimiter: this.limiter,
    });
    return { raw };
  }
}
