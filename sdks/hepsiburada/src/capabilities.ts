/**
 * Static feature-capability flags for the Hepsiburada marketplace, so consumers
 * can feature-detect instead of hard-coding marketplace quirks.
 *
 * Intentionally a per-SDK literal constant (not a shared `@lonca/core` type):
 * the flags are marketplace-specific and the set is still small. Read them off
 * a client as `client.capabilities`.
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
} as const;

/** Shape of {@link hepsiburadaCapabilities}. */
export type HepsiburadaCapabilities = typeof hepsiburadaCapabilities;
