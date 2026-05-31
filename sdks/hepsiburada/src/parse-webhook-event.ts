import { ValidationError } from '@lonca/core';
import {
  HEPSIBURADA_WEBHOOK_EVENTS,
  type HepsiburadaWebhookEvent,
  type ParsedHepsiburadaWebhookEvent,
} from './types/webhook-event.js';

/**
 * Parse a Hepsiburada webhook PUT body into a typed envelope.
 *
 * @param event   The event name. Hepsiburada's webhook model is
 *   endpoint-per-event — you already know the name from your route
 *   handler (e.g. `app.put('/hb/createOrder', ...)`). Must be one of
 *   {@link HEPSIBURADA_WEBHOOK_EVENTS}.
 * @param rawBody The raw request body — either a JSON string (Node's
 *   `req.body` when no body parser is mounted) or an already-parsed
 *   object (after `express.json()` etc.).
 *
 * @returns `{ event, body, raw }`. Both `body` and `raw` are the same
 *   parsed object; `raw` is provided as the forward-compat accessor for
 *   undocumented fields.
 *
 * @throws {ValidationError} when `event` isn't a recognized event name,
 *   when `rawBody` is a string but not valid JSON, or when `rawBody`
 *   doesn't parse to an object.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { parseHepsiburadaWebhookEvent } from '@lonca/hepsiburada';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.put('/hb/createOrder', (req, res) => {
 *   const { event, body } = parseHepsiburadaWebhookEvent('createOrder', req.body);
 *   // process the order...
 *   res.status(204).end();
 * });
 * ```
 */
export function parseHepsiburadaWebhookEvent<E extends HepsiburadaWebhookEvent>(
  event: E,
  rawBody: string | Record<string, unknown> | null | undefined,
): ParsedHepsiburadaWebhookEvent<E> {
  if (!isKnownEvent(event)) {
    throw new ValidationError({
      message: `parseHepsiburadaWebhookEvent: unknown event "${String(event)}". Allowed: ${HEPSIBURADA_WEBHOOK_EVENTS.join(', ')}`,
    });
  }

  if (rawBody == null) {
    throw new ValidationError({
      message: `parseHepsiburadaWebhookEvent(${event}): body is required`,
    });
  }

  let parsed: unknown;
  if (typeof rawBody === 'string') {
    try {
      parsed = JSON.parse(rawBody);
    } catch (err) {
      throw new ValidationError({
        message: `parseHepsiburadaWebhookEvent(${event}): body is not valid JSON`,
        cause: err,
      });
    }
  } else {
    parsed = rawBody;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError({
      message: `parseHepsiburadaWebhookEvent(${event}): body must parse to an object`,
    });
  }

  const body = parsed as Record<string, unknown>;
  return { event, body, raw: body };
}

/**
 * Short alias for {@link parseHepsiburadaWebhookEvent}. The Trendyol SDK
 * exports the same name, so each SDK's `parseWebhookEvent` is the
 * canonical entry point when callers import the helper via the
 * marketplace-specific package.
 *
 * Use whichever name reads better. The two are referentially identical.
 */
export const parseWebhookEvent = parseHepsiburadaWebhookEvent;

function isKnownEvent(value: unknown): value is HepsiburadaWebhookEvent {
  return (
    typeof value === 'string' && (HEPSIBURADA_WEBHOOK_EVENTS as readonly string[]).includes(value)
  );
}
