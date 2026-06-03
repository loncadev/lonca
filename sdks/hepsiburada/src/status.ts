import { createStatusNormalizer, type NormalizedOrderStatus } from '@lonca/core';

/**
 * Hepsiburada order / package statuses the SDK maps exhaustively.
 *
 * Hepsiburada types `status` as a free string on the wire (no enum), so this is
 * the SDK-owned known set. It is intentionally conservative — only statuses
 * confirmed against the API are listed — and extended as more are confirmed.
 * Any value not in the map degrades to `{ normalized: 'unknown', mapped: false }`
 * (never a silent default), so an unrecognized status is visible, not hidden.
 */
export type KnownHepsiburadaOrderStatus =
  | 'Open'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Returned';

/**
 * Exhaustive map over {@link KnownHepsiburadaOrderStatus} → the
 * marketplace-agnostic {@link NormalizedOrderStatus} vocabulary. Adding a value
 * to the union without mapping it here is a compile-time error.
 */
export const statusMap: Record<KnownHepsiburadaOrderStatus, NormalizedOrderStatus> = {
  Open: 'created',
  Shipped: 'shipped',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
  Returned: 'returned',
};

/**
 * Normalize a raw Hepsiburada order/package status into the
 * {@link NormalizedOrderStatus} vocabulary. Unknown values resolve to
 * `{ normalized: 'unknown', mapped: false }` with the raw string preserved.
 */
export const normalizeStatus = createStatusNormalizer(statusMap);
