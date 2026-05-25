/**
 * Inbound webhook event payloads — what Trendyol POSTs to YOUR endpoint
 * when a subscribed shipment-package status event fires.
 *
 * Per Trendyol's "Webhook Model" doc:
 *   - Method: POST, body: JSON
 *   - Wire shape: identical to `getShipmentPackages` response envelope
 *     (`{ totalElements, totalPages, page, size, content: [...] }`)
 *   - Sent on every status transition for a subscribed status (see
 *     `WebhookEventStatus` below) — the full order data is delivered
 *     each time, not a delta.
 *
 * Trendyol authenticates against YOUR endpoint using the method you
 * configured on the subscription (BASIC_AUTHENTICATION or API_KEY). The
 * SDK does NOT validate auth on its end — handle that in your request
 * middleware before passing the body to `parseWebhookEvent`.
 *
 * Retry: on a non-2xx response, Trendyol retries every 5 minutes; after
 * persistent failures the subscription is auto-deactivated (you'll get
 * 2 emails). Reactivate via `client.webhooks.activate(id)` once your
 * endpoint is healthy again.
 */

import type { ShipmentPackage } from './order.js';

/**
 * Status values Trendyol sends as the event trigger. Note the
 * **upper-snake-case** spelling here, distinct from `ShipmentPackageStatus`
 * (which uses PascalCase on the API read responses).
 */
export type WebhookEventStatus =
  | 'CREATED'
  | 'PICKING'
  | 'INVOICED'
  | 'SHIPPED'
  | 'CANCELLED'
  | 'DELIVERED'
  | 'UNDELIVERED'
  | 'RETURNED'
  | 'UNSUPPLIED'
  | 'AWAITING'
  | 'UNPACKED'
  | 'AT_COLLECTION_POINT'
  | 'VERIFIED'
  | (string & {});

/**
 * Origin of a package, surfaced as `ShipmentPackage.createdBy` on the
 * normalized event payload. Useful for routing logic (e.g. trigger a
 * different flow for `'split'` packages than `'order-creation'`).
 */
export type PackageCreatedBy = 'order-creation' | 'cancel' | 'split' | 'transfer' | (string & {});

/**
 * The parsed webhook event body. `packages` is the normalized
 * `content[]` from the inbound JSON; `pageInfo` carries Trendyol's
 * pagination envelope verbatim so you can log / surface it.
 *
 * In practice `packages.length === 1` for status-change events, but the
 * model is defined as a page so the same handler can absorb future
 * batch events without breaking.
 */
export interface WebhookEvent {
  packages: ShipmentPackage[];
  pageInfo: {
    totalElements?: number;
    totalPages?: number;
    page?: number;
    size?: number;
  };
  /** Raw inbound body — fall back here for fields the SDK doesn't surface. */
  raw: Record<string, unknown>;
}
