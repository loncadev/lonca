import { createStatusNormalizer, type NormalizedOrderStatus } from '@lonca/core';
import type { KnownShipmentPackageStatus } from './types/order.js';

/**
 * Exhaustive map from Trendyol's known shipment-package statuses to the
 * marketplace-agnostic {@link NormalizedOrderStatus} vocabulary.
 *
 * Because the key type is the **closed** {@link KnownShipmentPackageStatus}
 * union, adding a value there without mapping it here is a compile-time error.
 * Some Trendyol states have no exact normalized equivalent and are folded onto
 * the nearest lifecycle stage (noted inline).
 */
export const statusMap: Record<KnownShipmentPackageStatus, NormalizedOrderStatus> = {
  Created: 'created',
  Awaiting: 'created', // new order awaiting seller acceptance
  Verified: 'created', // accepted/verified, before picking
  Picking: 'picking',
  UnPacked: 'picking', // back in fulfillment after being unpacked
  Invoiced: 'invoiced',
  Shipped: 'shipped',
  AtCollectionPoint: 'shipped', // in transit, awaiting pickup
  UnDelivered: 'shipped', // delivery attempt failed; still in carrier's hands
  Delivered: 'delivered',
  Cancelled: 'cancelled',
  UnSupplied: 'cancelled', // seller couldn't supply → effectively cancelled
  Returned: 'returned',
};

/**
 * Normalize a raw Trendyol shipment-package status into the
 * {@link NormalizedOrderStatus} vocabulary.
 *
 * Unknown raw values resolve to `{ normalized: 'unknown', mapped: false }` with
 * the raw string preserved — never silently coerced to a valid-looking default.
 */
export const normalizeStatus = createStatusNormalizer(statusMap);
