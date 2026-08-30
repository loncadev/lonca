import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { CommonLabel, CommonLabelEntry, CreateCommonLabelInput } from '../types/misc.js';

/**
 * Common-label (ortak etiket) endpoints — request and retrieve a
 * combined ZPL shipping label for a cargo tracking number.
 */
export class LabelsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 100, intervalMs: 60_000 });
  }

  /**
   * Request a common ZPL label for a cargo tracking number. After this
   * returns, call `getCommon()` with the same `cargoTrackingNumber` to
   * retrieve the generated label.
   *
   * Trendyol documents this endpoint (`createCommonLabel`) as a bare
   * `200 OK` with no response body, so the SDK returns a `MutationResult`
   * whose `raw` is whatever the gateway sent (normally `undefined`).
   *
   * @throws {ValidationError} when `format` is missing.
   */
  async createCommon(
    cargoTrackingNumber: string | number,
    input: CreateCommonLabelInput,
  ): Promise<MutationResult> {
    if (!input?.format) {
      throw new ValidationError({ message: 'labels.createCommon: format is required' });
    }
    const raw = await this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/sellers/${this.transport.sellerId}/common-label/${encodeURIComponent(String(cargoTrackingNumber))}`,
      body: input,
      rateLimiter: this.limiter,
    });
    return { raw };
  }

  /**
   * Retrieve the previously-created common label. Trendyol returns
   * `{ data: [{ label, format }] }`; the SDK surfaces the array as
   * `labels[]` for ergonomic access.
   *
   * Typically `labels.length === 1` per tracking number, but kept as an
   * array to match the wire shape.
   */
  async getCommon(cargoTrackingNumber: string | number): Promise<CommonLabel> {
    interface WireResponse {
      data?: Array<{ label?: string; format?: string }>;
      [key: string]: unknown;
    }
    const raw = await this.transport.request<WireResponse>({
      method: 'GET',
      path: `/integration/sellers/${this.transport.sellerId}/common-label/${encodeURIComponent(String(cargoTrackingNumber))}`,
      rateLimiter: this.limiter,
    });

    const labels: CommonLabelEntry[] = (raw?.data ?? []).map((row) => ({
      label: row.label ?? '',
      format: (row.format ?? 'ZPL') as CommonLabelEntry['format'],
    }));
    return { labels, raw: (raw ?? {}) as Record<string, unknown> };
  }
}
