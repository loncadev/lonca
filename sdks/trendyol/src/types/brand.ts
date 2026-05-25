/**
 * A Trendyol marketplace brand.
 *
 * Trendyol returns numeric IDs; we normalize to `string` to match the
 * `@lonca/core` convention (string IDs across all Lonca SDKs).
 */
export interface Brand {
  id: string;
  name: string;
}
