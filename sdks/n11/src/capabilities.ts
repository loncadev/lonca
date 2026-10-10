import type { MarketplaceCapabilities } from '@lonca/core';

/**
 * Static feature-capability flags for n11, derived from the developer portal
 * (not yet verified against a live account). Same contract as the Trendyol and
 * Hepsiburada SDKs, so a missing or renamed flag is a compile error.
 */
export const n11Capabilities = {
  /** No time-bounded / scheduled pricing is documented. */
  scheduledPricing: false,
  /**
   * `POST /ms/product/tasks/price-stock-update` accepts `quantity` without
   * prices ("fields you do not send are not updated").
   */
  stockOnlyBatch: true,
  /** `GET /ms/product-query` rows carry no last-update timestamp. */
  listingUpdatedAt: false,
} as const satisfies MarketplaceCapabilities;

/** Shape of {@link n11Capabilities}. */
export type N11Capabilities = typeof n11Capabilities;
