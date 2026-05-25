import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { CommonLabel, CreateCommonLabelInput } from '../types/misc.js';

/**
 * Common-label (ortak etiket) endpoints — request and retrieve a
 * combined ZPL shipping label for a cargo tracking number.
 */
export class LabelsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 100, intervalMs: 60_000 });
  }

  /**
   * Request a common ZPL label for a cargo tracking number. After this
   * returns, call `getCommon()` with the same `cargoTrackingNumber` to
   * retrieve the generated label.
   *
   * @throws {ValidationError} when `format` is missing.
   */
  async createCommon(
    cargoTrackingNumber: string | number,
    input: CreateCommonLabelInput,
  ): Promise<unknown> {
    if (!input?.format) {
      throw new ValidationError({ message: 'labels.createCommon: format is required' });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/sellers/${this.sellerId}/common-label/${encodeURIComponent(String(cargoTrackingNumber))}`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Retrieve the previously-created common label. */
  async getCommon(cargoTrackingNumber: string | number): Promise<CommonLabel> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/sellers/${this.sellerId}/common-label/${encodeURIComponent(String(cargoTrackingNumber))}`,
      rateLimiter: this.limiter,
    });
    return { raw: (data ?? {}) as Record<string, unknown> };
  }
}
