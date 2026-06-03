/**
 * Static feature-capability flags for the Trendyol marketplace, so consumers
 * can feature-detect instead of hard-coding marketplace quirks.
 *
 * Intentionally a per-SDK literal constant (not a shared `@lonca/core` type):
 * the flags are marketplace-specific and the set is still small. Read them off
 * a client as `client.capabilities`.
 */
export const trendyolCapabilities = {
  /** Trendyol has no time-bounded / scheduled pricing (`pricings[]`). */
  scheduledPricing: false,
  /** `inventory.update` accepts stock-only items (`quantity` with no price). */
  stockOnlyBatch: true,
  /** Products expose `updatedAt`, so last-write-wins guards are supported. */
  listingUpdatedAt: true,
} as const;

/** Shape of {@link trendyolCapabilities}. */
export type TrendyolCapabilities = typeof trendyolCapabilities;
