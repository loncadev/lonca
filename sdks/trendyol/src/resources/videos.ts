import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { CreateVideoInput, ListVideosParams, SellerVideo } from '../types/video.js';

/**
 * Trendyol Video API (`seller-integration-video-api`) — product video
 * uploads. Upload happens server-side from a URL the seller provides;
 * the SDK exposes the create + list endpoints.
 *
 * Base path: `/integration/video/sellers/{sellerId}/videos`.
 * Trendyol publishes per-endpoint rate limits — `create` at 200 req/min,
 * `list` at 1000 req/min — which the SDK provisions as two separate
 * token buckets so listing doesn't exhaust the create budget.
 */
export class VideosResource {
  private readonly createLimiter: TokenBucketRateLimiter;
  private readonly listLimiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    options: {
      createLimiter?: TokenBucketRateLimiter;
      listLimiter?: TokenBucketRateLimiter;
    } = {},
  ) {
    this.createLimiter =
      options.createLimiter ?? new TokenBucketRateLimiter({ capacity: 200, intervalMs: 60_000 });
    this.listLimiter =
      options.listLimiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * Queue a video for upload. Trendyol downloads from the URL in the
   * body asynchronously; poll `list()` (filtered by id) for status.
   *
   * @throws {ValidationError} when `input` is empty / not an object.
   */
  async create(input: CreateVideoInput): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'videos.create: input is required' });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/video/sellers/${this.transport.sellerId}/videos`,
      body: input,
      rateLimiter: this.createLimiter,
    });
  }

  /** List the seller's integration videos (optionally filtered by id / status). */
  async list(params: ListVideosParams = {}): Promise<SellerVideo[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/video/sellers/${this.transport.sellerId}/videos`,
      query: {
        id: params.id,
        sellerIntegrationStatus: params.sellerIntegrationStatus,
        page: params.offset,
        size: params.limit,
      },
      rateLimiter: this.listLimiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { content?: unknown[] })?.content)
        ? (data as { content: unknown[] }).content
        : Array.isArray((data as { items?: unknown[] })?.items)
          ? (data as { items: unknown[] }).items
          : [];
    return rows.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const out: SellerVideo = { raw: row };
      if (typeof row.id === 'string') out.id = row.id;
      if (typeof row.status === 'string') out.status = row.status as SellerVideo['status'];
      return out;
    });
  }
}
