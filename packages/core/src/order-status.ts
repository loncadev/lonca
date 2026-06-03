/**
 * The closed, marketplace-agnostic order/shipment status vocabulary that every
 * SDK normalizes its raw statuses into.
 *
 * This union is intentionally **closed** (no `(string & {})` catch-all): a value
 * a marketplace SDK can't map lands on `'unknown'` at runtime via
 * {@link createStatusNormalizer}, surfaced by `mapped: false` — never silently
 * coerced to a valid-looking default.
 */
export type NormalizedOrderStatus =
  | 'created'
  | 'picking'
  | 'invoiced'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'unknown';

/**
 * Result of normalizing a raw marketplace status. The raw value is always
 * preserved, and `mapped` makes an unrecognized status visible at runtime
 * instead of letting it disappear into a default.
 */
export interface NormalizedStatusResult {
  /** Mapped normalized status, or `'unknown'` when the raw value wasn't recognized. */
  normalized: NormalizedOrderStatus;
  /** The original raw status string from the marketplace, preserved verbatim. */
  raw: string;
  /** `false` when the raw value had no mapping (normalized fell back to `'unknown'`). */
  mapped: boolean;
}

/**
 * Build a status normalizer from an SDK-owned, **exhaustive** map of that
 * marketplace's known statuses. Because the map key type is a closed union,
 * forgetting to map a newly added known status is a compile-time error in the
 * SDK — while an unknown value arriving on the wire stays safe at runtime
 * (`{ normalized: 'unknown', mapped: false }`).
 *
 * @example
 * ```ts
 * const statusMap = { Created: 'created', Shipped: 'shipped' } as const;
 * const normalizeStatus = createStatusNormalizer(statusMap);
 * normalizeStatus('Shipped'); // { normalized: 'shipped', raw: 'Shipped', mapped: true }
 * normalizeStatus('Martian'); // { normalized: 'unknown', raw: 'Martian', mapped: false }
 * ```
 */
export function createStatusNormalizer<Known extends string>(
  map: Record<Known, NormalizedOrderStatus>,
): (raw: string) => NormalizedStatusResult {
  const lookup = map as Record<string, NormalizedOrderStatus | undefined>;
  return (raw: string): NormalizedStatusResult => {
    const normalized = lookup[raw];
    return normalized !== undefined
      ? { normalized, raw, mapped: true }
      : { normalized: 'unknown', raw, mapped: false };
  };
}
