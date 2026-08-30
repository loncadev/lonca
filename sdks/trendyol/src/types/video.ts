/**
 * Trendyol Video API types — product video upload + listing.
 *
 * Source: developers.trendyol.com / `seller-integration-video-api`.
 *
 * Endpoints under `/integration/video/sellers/{sellerId}/videos`.
 */

import type { MutationResult, OffsetPaginationParams } from '@lonca/core';

/**
 * Status of a seller integration video as Trendyol processes it. Open
 * union — Trendyol may add new statuses without an SDK release.
 */
export type SellerIntegrationStatus =
  'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | (string & {});

/**
 * Documented `videoContentType` values for `videos.create()`. Open union —
 * Trendyol may add new types without an SDK release. Omitted, Trendyol
 * defaults to `PRODUCT_PROMOTION`.
 */
export type VideoContentType =
  | 'PRODUCT_PROMOTION'
  | 'ASSEMBLY_AND_INSTALLATION'
  | 'PACKAGING'
  | 'STORE_PROMOTION'
  | 'ADVERTISEMENT'
  | 'PRODUCT_USAGE_AND_EXPERIENCE'
  | (string & {});

/**
 * Body for `videos.create()` — initiates an async download + processing.
 * The documented fields are typed as optional hints; every extra key passes
 * through to Trendyol untouched (the SDK never strips unknown fields).
 */
export type CreateVideoInput = {
  /** Video title, 3–50 chars — documented as required. */
  title?: string;
  /** Video description, ≤500 chars. */
  description?: string;
  /** Public http(s) URL Trendyol downloads the video from — documented as required. */
  videoUrl?: string;
  /** Product content ids to attach (≤100; the doc's example sends strings). */
  productContentIds?: Array<string | number>;
  /** Video content type — defaults to `PRODUCT_PROMOTION` when omitted. */
  videoContentType?: VideoContentType;
} & Record<string, unknown>;

/**
 * Result of `videos.create()`. Trendyol documents the response as
 * `{ videoId: string }` (a UUID you can pass to `videos.list({ id })`);
 * `raw` keeps the untouched body.
 */
export interface CreateVideoResult extends MutationResult {
  /** ID of the queued video (absent when the body had none). */
  videoId?: string;
}

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
