/**
 * The cross-marketplace feature-capability contract.
 *
 * Each SDK exposes a literal `*Capabilities` constant that `satisfies` this
 * interface (kept `as const`, so the marketplace-specific `true`/`false` values
 * stay narrowed). Sharing the *contract* — not the values — means consumers
 * writing marketplace-agnostic code can rely on the same key set being present
 * on every `client.capabilities`, and a renamed or missing flag becomes a
 * compile error instead of a silent `undefined` at runtime.
 */
export interface MarketplaceCapabilities {
  /** Whether the marketplace supports time-bounded / scheduled pricing windows. */
  scheduledPricing: boolean;
  /** Whether stock-only batch updates (quantity without price) are accepted. */
  stockOnlyBatch: boolean;
  /**
   * Whether listing rows reliably carry a last-update timestamp, so
   * last-write-wins guards can depend on it.
   */
  listingUpdatedAt: boolean;
}
