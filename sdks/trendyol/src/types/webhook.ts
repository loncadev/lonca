/**
 * Trendyol webhook subscription types.
 *
 * Webhooks let Trendyol push shipment-package status events to a URL you
 * own instead of polling. Max 15 active webhooks per seller. Trendyol
 * itself authenticates against your endpoint (you don't sign Trendyol's
 * request) — pick `BASIC_AUTHENTICATION` (username+password) or `API_KEY`
 * (rotatable; recommended).
 */

import type { ShipmentPackageStatus } from './order.js';

/** Auth method Trendyol uses when calling your webhook URL. */
export type WebhookAuthenticationType = 'BASIC_AUTHENTICATION' | 'API_KEY';

/**
 * Payload for `webhooks.create` / `webhooks.update`. Same shape for both.
 */
export interface WebhookInput {
  /** Your endpoint URL (must accept POST JSON from Trendyol). */
  url: string;
  /** Auth scheme Trendyol will use to call your endpoint. */
  authenticationType: WebhookAuthenticationType;
  /** Username (only when `authenticationType === 'BASIC_AUTHENTICATION'`). */
  username?: string;
  /** Password (only when `authenticationType === 'BASIC_AUTHENTICATION'`). */
  password?: string;
  /** API key (only when `authenticationType === 'API_KEY'`). */
  apiKey?: string;
  /**
   * Order statuses you want events for. Empty/omitted = all statuses.
   * Trendyol accepts the same vocabulary as `ShipmentPackageStatus`
   * (the upper-snake-case variants — `'CREATED'`, `'PICKING'`, etc. — see
   * Trendyol docs for the exact wire spelling, which sometimes differs
   * from the read-side `'Created'`/`'Picking'`).
   */
  subscribedStatuses?: string[];
}

/** A registered webhook subscription as returned by `webhooks.list`. */
export interface Webhook {
  id: string;
  url?: string;
  authenticationType?: WebhookAuthenticationType;
  username?: string;
  apiKey?: string;
  subscribedStatuses?: string[];
  /** Active vs deactivated. */
  active?: boolean;
  /** Untouched raw webhook entry. */
  raw: Record<string, unknown>;
}

/**
 * Re-export the status vocabulary so callers can build `subscribedStatuses`
 * arrays with autocomplete (note: see `WebhookInput.subscribedStatuses`
 * about case-spelling).
 */
export type { ShipmentPackageStatus };
