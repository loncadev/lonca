import type { MarketplaceCapabilities } from '@lonca/core';

/**
 * Static feature-capability flags for the Hepsiburada marketplace, so consumers
 * can feature-detect instead of hard-coding marketplace quirks. Read them off
 * a client as `client.capabilities`.
 *
 * The flag *values* are marketplace-specific, but the const `satisfies` the
 * shared {@link MarketplaceCapabilities} contract so the key set can't drift
 * from the Trendyol SDK without a compile error. Kept `as const` so the literal
 * `true`/`false` values stay narrowed.
 */
export const hepsiburadaCapabilities = {
  /** Listings support time-bounded pricing windows (`ListingPricing.startDate/endDate`). */
  scheduledPricing: true,
  /** `listings.uploadStock` accepts stock-only batches (no price). */
  stockOnlyBatch: true,
  /**
   * Listing rows don't reliably carry a last-update timestamp (`Listing.updatedAt`
   * is surfaced best-effort and is often `null`), so last-write-wins guards can't
   * depend on it.
   */
  listingUpdatedAt: false,
} as const satisfies MarketplaceCapabilities;

/** Shape of {@link hepsiburadaCapabilities}. */
export type HepsiburadaCapabilities = typeof hepsiburadaCapabilities;
