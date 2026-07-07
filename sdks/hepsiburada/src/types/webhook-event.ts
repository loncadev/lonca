/**
 * Hepsiburada webhook event types.
 *
 * Source: developers.hepsiburada.com — `siparis-olusturma-entegrasyonu`
 * "Sipariş Webhook Modeli" + `talep-entegrasyonu` "Talep Webhook Modelleri"
 * sections (2026-05).
 *
 * Hepsiburada's webhook model is **endpoint-per-event** (different from
 * Trendyol's body-discriminated single endpoint): merchants register one
 * base URL with Hepsiburada and Hepsiburada `PUT`s to
 * `<baseUrl>/<eventName>` when each event happens. So callers already
 * know the event name from their route handler — the SDK provides:
 *
 *   1. The exhaustive event-name unions (`OrderWebhookEvent`,
 *      `ClaimWebhookEvent`, `HepsiburadaWebhookEvent`) for compile-time
 *      switch exhaustiveness.
 *   2. A `parseHepsiburadaWebhookEvent()` helper that accepts a raw JSON
 *      string or an already-parsed object and returns a typed envelope
 *      `{ event, body, raw }`. Per-event body shapes are intentionally
 *      typed as `Record<string, unknown>` — Hepsiburada documents the
 *      field set per event in HTML tables; the SDK keeps `body` loose so
 *      undocumented fields stay accessible, and surfaces the raw payload
 *      verbatim.
 *
 * Success-response contract per Hepsiburada's "Webhook Önemli Bilgiler":
 *   - `2xx` ack within ~5s; 201/204 are the documented success codes
 *   - Implementation must be idempotent (Hepsiburada may retry)
 *   - Default IIS PUT must be enabled if hosted on IIS
 */

/**
 * Order webhook events. Each corresponds to a separate `PUT
 * <baseUrl>/<eventName>` endpoint on the merchant side.
 *
 *   - `createOrder`   — a new order has been paid for; one body per order
 *   - `createPackages` — Hepsiburada packaged your line items (alternative to
 *                       merchant-driven packaging via `orders.createPackages`)
 *   - `orderCancel`   — the buyer cancelled before shipment
 *   - `unpack`        — a previously-created package was unpacked
 *   - `intransit`     — package handed over to cargo
 *   - `deliver`       — package delivered to buyer
 *   - `undeliver`     — delivery failed
 *   - `changeShippingAddressOrder` — buyer updated the delivery address
 */
export type OrderWebhookEvent =
  | 'createOrder'
  | 'createPackages'
  | 'orderCancel'
  | 'unpack'
  | 'intransit'
  | 'deliver'
  | 'undeliver'
  | 'changeShippingAddressOrder';

/** Exhaustive list of order webhook event names — runtime use. */
export const ORDER_WEBHOOK_EVENTS = [
  'createOrder',
  'createPackages',
  'orderCancel',
  'unpack',
  'intransit',
  'deliver',
  'undeliver',
  'changeShippingAddressOrder',
] as const satisfies readonly OrderWebhookEvent[];

/**
 * Claim webhook events. As with orders, each corresponds to a separate
 * `PUT <baseUrl>/<eventName>` endpoint on the merchant side.
 *
 *   - `awaitingAction`         — a claim needs the merchant's accept/reject
 *   - `awaitingPreApproval`    — claim entered the pre-approval flow
 *   - `disputedClaimResult`    — disputed-claim decision (accept/reject) by Hepsiburada
 *   - `packageFromClaimResult` — a new return package was created after claim approval
 */
export type ClaimWebhookEvent =
  'awaitingAction' | 'awaitingPreApproval' | 'disputedClaimResult' | 'packageFromClaimResult';

/** Exhaustive list of claim webhook event names — runtime use. */
export const CLAIM_WEBHOOK_EVENTS = [
  'awaitingAction',
  'awaitingPreApproval',
  'disputedClaimResult',
  'packageFromClaimResult',
] as const satisfies readonly ClaimWebhookEvent[];

/** All Hepsiburada webhook event names — union over orders + claims. */
export type HepsiburadaWebhookEvent = OrderWebhookEvent | ClaimWebhookEvent;

/** Exhaustive list of every Hepsiburada webhook event — runtime use. */
export const HEPSIBURADA_WEBHOOK_EVENTS = [
  ...ORDER_WEBHOOK_EVENTS,
  ...CLAIM_WEBHOOK_EVENTS,
] as const satisfies readonly HepsiburadaWebhookEvent[];

/**
 * Parsed envelope returned by `parseHepsiburadaWebhookEvent()`.
 *
 * Per-event body shapes are typed as `Record<string, unknown>` because
 * Hepsiburada documents field sets in HTML tables (no machine-readable
 * spec). Use `.raw` to grab the original payload verbatim when you need
 * an undocumented field; use the documented field set per
 * developers.hepsiburada.com for routine work.
 */
export interface ParsedHepsiburadaWebhookEvent<
  E extends HepsiburadaWebhookEvent = HepsiburadaWebhookEvent,
> {
  /** The event name as routed by the merchant — matches the URL path segment. */
  event: E;
  /** Parsed JSON body. */
  body: Record<string, unknown>;
  /** Untouched raw payload for forward-compat access. */
  raw: Record<string, unknown>;
}
