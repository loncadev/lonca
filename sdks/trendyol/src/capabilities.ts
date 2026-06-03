import type { MarketplaceCapabilities } from '@lonca/core';

/**
 * Static feature-capability flags for the Trendyol marketplace, so consumers
 * can feature-detect instead of hard-coding marketplace quirks. Read them off
 * a client as `client.capabilities`.
 *
 * The flag *values* are marketplace-specific, but the const `satisfies` the
 * shared {@link MarketplaceCapabilities} contract so the key set can't drift
 * from the Hepsiburada SDK without a compile error. Kept `as const` so the
 * literal `true`/`false` values stay narrowed.
 */
export const trendyolCapabilities = {
  /** Trendyol has no time-bounded / scheduled pricing (`pricings[]`). */
  scheduledPricing: false,
  /** `inventory.update` accepts stock-only items (`quantity` with no price). */
  stockOnlyBatch: true,
  /** Products expose `updatedAt`, so last-write-wins guards are supported. */
  listingUpdatedAt: true,
} as const satisfies MarketplaceCapabilities;

/** Shape of {@link trendyolCapabilities}. */
export type TrendyolCapabilities = typeof trendyolCapabilities;
