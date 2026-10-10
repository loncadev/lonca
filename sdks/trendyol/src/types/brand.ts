/**
 * A Trendyol marketplace brand.
 *
 * Trendyol returns numeric IDs; we normalize to `string` to match the
 * `@lonca/core` convention (string IDs across all Lonca SDKs).
 */
export interface Brand {
  id: string;
  name: string;
  /**
   * Whether Trendyol flags the brand as a luxury brand. Undocumented by Trendyol but sent on
   * every brand of the prod `brands.list` response; omitted when the response lacks it.
   */
  luxe?: boolean;
}
