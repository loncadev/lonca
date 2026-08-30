import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';

const SERVICE = 'oms-stub' as const;

/**
 * Payload for `testOrders.create()`. Hepsiburada's portal documents the
 * inner structure under "Test Siparişi Oluşturma"; the SDK accepts any
 * object so the deeply-nested customer/seller/lines structure can grow
 * without releases.
 */
export type CreateTestOrderInput = Record<string, unknown>;

/**
 * Hepsiburada test-order utility (`test-siparisi-olusturma`). **Sandbox
 * only** — Trendyol has the same `testOrders.create` shape.
 *
 * **Service base URL**: `oms-stub-external[-sit].hepsiburada.com`.
 */
export class TestOrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 30, intervalMs: 60_000 });
  }

  /**
   * Create a test order on Hepsiburada's stub OMS. Use only against the
   * SIT environment. Resolves to a `MutationResult` — the stub has no
   * published response schema, so the body is left untouched on `raw`.
   *
   * @throws {ValidationError} when `input` is empty / not an object.
   */
  async create(input: CreateTestOrderInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'testOrders.create: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `/orders/merchantId/${encodeURIComponent(this.transport.merchantId)}`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }
}
