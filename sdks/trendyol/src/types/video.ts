/**
 * Trendyol Video API types — product video upload + listing.
 *
 * Source: developers.trendyol.com / `seller-integration-video-api`.
 *
 * Endpoints under `/integration/video/sellers/{sellerId}/videos`.
 */

import type { OffsetPaginationParams } from '@lonca/core';

/**
 * Status of a seller integration video as Trendyol processes it. Open
 * union — Trendyol may add new statuses without an SDK release.
 */
export type SellerIntegrationStatus =
  'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | (string & {});

/** Body for `videos.create()` — initiates an async download + processing. */
export type CreateVideoInput = Record<string, unknown>;

/** Query parameters for `videos.list()`. */
export interface ListVideosParams extends OffsetPaginationParams {
  /** Filter by a single video id. */
  id?: string;
  /** Filter by processing status. */
  sellerIntegrationStatus?: SellerIntegrationStatus;
}

/** One video row returned by `videos.list()`. */
export interface SellerVideo {
  id?: string;
  status?: SellerIntegrationStatus;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
