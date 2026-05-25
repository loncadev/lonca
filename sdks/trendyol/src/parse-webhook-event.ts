/**
 * Top-level helper for parsing incoming Trendyol webhook event bodies
 * into the SDK's typed shape.
 *
 * Usage in an Express route:
 *
 * ```ts
 * import { parseWebhookEvent } from '@lonca/trendyol';
 *
 * app.post('/trendyol/webhook', express.json(), (req, res) => {
 *   const event = parseWebhookEvent(req.body);
 *   for (const pkg of event.packages) {
 *     // pkg: typed ShipmentPackage — same shape as orders.list()
 *     await myQueue.enqueue({ packageId: pkg.id, status: pkg.status });
 *   }
 *   res.sendStatus(200);
 * });
 * ```
 */

import { ValidationError } from '@lonca/core';
import { normalizeShipmentPackage } from './resources/orders.js';
import type { WebhookEvent } from './types/webhook-event.js';

/**
 * Parse an inbound webhook body into a typed `WebhookEvent`.
 *
 * Accepts either an already-parsed object or a JSON string. Returns
 * normalized `ShipmentPackage[]` (the same shape `orders.list()`
 * produces), plus the page envelope and the raw body for fallthrough.
 *
 * @throws {ValidationError} when the body isn't an object / valid JSON,
 *   or when `content` is missing or not an array.
 */
export function parseWebhookEvent(rawBody: unknown): WebhookEvent {
  let body: Record<string, unknown>;
  if (typeof rawBody === 'string') {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new ValidationError({
        message: 'parseWebhookEvent: rawBody is not valid JSON',
      });
    }
  } else if (rawBody && typeof rawBody === 'object') {
    body = rawBody as Record<string, unknown>;
  } else {
    throw new ValidationError({
      message: 'parseWebhookEvent: rawBody must be an object or JSON string',
    });
  }

  const content = body.content;
  if (!Array.isArray(content)) {
    throw new ValidationError({
      message: 'parseWebhookEvent: body.content must be an array',
    });
  }

  return {
    packages: content.map(normalizeShipmentPackage),
    pageInfo: {
      totalElements: typeof body.totalElements === 'number' ? body.totalElements : undefined,
      totalPages: typeof body.totalPages === 'number' ? body.totalPages : undefined,
      page: typeof body.page === 'number' ? body.page : undefined,
      size: typeof body.size === 'number' ? body.size : undefined,
    },
    raw: body,
  };
}
