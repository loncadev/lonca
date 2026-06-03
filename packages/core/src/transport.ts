import { randomUUID } from 'node:crypto';
import {
  LoncaError,
  NetworkError,
  TimeoutError,
  parseRetryAfter,
  isRetryableIdempotentOnly,
} from './errors.js';
import { retry } from './retry.js';
import { noopLogger, type Logger } from './logger.js';
import type { TokenBucketRateLimiter } from './rate-limiter.js';

/**
 * The request lifecycle shared by every marketplace SDK transport: acquire a
 * rate-limit token, build the URL/headers, fire `fetch` under a composed
 * timeout signal, map non-2xx responses to `LoncaError`s, and replay through
 * {@link retry}. Only the marketplace-specific seams (URL building, headers,
 * status→error mapping, log labels) are injected via {@link RequesterConfig},
 * so the loop itself lives in one place instead of being copy-pasted — and
 * drifting — across SDKs.
 */

/** The request fields the shared lifecycle reads. SDKs extend this with their own (e.g. `path`, `service`, `query`). */
export interface BaseRequestOptions {
  /** HTTP method. `GET` is treated as idempotent for retry purposes. */
  method: string;
  /** Request body. Serialized as JSON unless it is a `FormData` (sent as multipart). Skipped for `GET`. */
  body?: unknown;
  /** Caller abort signal, composed with the per-request timeout. */
  signal?: AbortSignal;
  /** Per-endpoint rate limiter; one token is acquired before each attempt. */
  rateLimiter?: TokenBucketRateLimiter;
  /**
   * Whether this request is safe to auto-replay on an ambiguous transient
   * failure (5xx / network drop / client timeout). `GET` is always idempotent.
   * For writes this defaults to `false`: a timed-out or 5xx write may already
   * have committed server-side, so only a `429` (provably rejected before
   * processing) is retried. Set `true` to opt a write back into full retries.
   */
  idempotent?: boolean;
  /** Extra per-request headers merged over the default header set (caller headers win). */
  headers?: Record<string, string>;
}

/** Marketplace-specific seams plus runtime dependencies for {@link createRequester}. */
export interface RequesterConfig<O extends BaseRequestOptions> {
  /** Underlying `fetch` (tests inject a mock). */
  fetch: typeof fetch;
  /** Structured logger. Defaults to a no-op. */
  logger?: Logger;
  /** Per-request timeout in ms. */
  timeoutMs: number;
  /** Human-readable marketplace name for error messages, e.g. `'Trendyol'`. */
  label: string;
  /** Log-event prefix, e.g. `'trendyol'` → `trendyol.request` / `trendyol.error` / `trendyol.retry`. */
  logPrefix: string;
  /** Build the absolute request URL from the SDK's options. */
  buildUrl(opts: O): string;
  /** Build the default header set; receives the generated correlation id. */
  buildHeaders(correlationId: string): Record<string, string>;
  /** Map a non-2xx response to a `LoncaError`. */
  mapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError;
  /** Optional extra structured fields merged into request/error log lines (e.g. `{ service }`). */
  logFields?(opts: O): Record<string, unknown>;
}

/**
 * Build a `request<T>(opts)` function that runs the shared transport lifecycle
 * for a given marketplace. Each SDK calls this once (per transport instance)
 * and exposes the returned function from its own transport class.
 */
export function createRequester<O extends BaseRequestOptions>(
  config: RequesterConfig<O>,
): <T>(opts: O) => Promise<T> {
  const logger = config.logger ?? noopLogger;

  return function request<T>(opts: O): Promise<T> {
    const safeToReplay = opts.method === 'GET' || opts.idempotent === true;
    const extra = () => config.logFields?.(opts) ?? {};

    return retry(
      async (attempt) => {
        if (opts.rateLimiter) await opts.rateLimiter.acquire(opts.signal);

        const correlationId = randomUUID();
        const url = config.buildUrl(opts);
        const headers = { ...config.buildHeaders(correlationId), ...opts.headers };
        const init: RequestInit = {
          method: opts.method,
          headers,
          signal: composeSignal(opts.signal, config.timeoutMs),
        };
        if (opts.body !== undefined && opts.method !== 'GET') {
          if (opts.body instanceof FormData) {
            // multipart: let fetch set Content-Type (it includes the boundary).
            init.body = opts.body;
            delete (headers as Record<string, string>)['Content-Type'];
          } else {
            init.body = JSON.stringify(opts.body);
          }
        }

        logger.debug(`${config.logPrefix}.request`, {
          method: opts.method,
          url,
          correlationId,
          attempt,
          ...extra(),
        });

        let response: Response;
        try {
          response = await config.fetch(url, init);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new TimeoutError({
              message: `${config.label} request timed out after ${config.timeoutMs}ms`,
              cause: err,
            });
          }
          throw new NetworkError({ message: `${config.label} network failure`, cause: err });
        }

        if (!response.ok) {
          const body = await safeJson(response);
          const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
          const error = config.mapHttpError(response.status, body, retryAfterMs);
          logger.warn(`${config.logPrefix}.error`, {
            method: opts.method,
            url,
            correlationId,
            status: response.status,
            code: error.code,
            retryable: error.retryable,
            ...extra(),
          });
          throw error;
        }

        logger.debug(`${config.logPrefix}.response`, {
          correlationId,
          status: response.status,
        });

        if (response.status === 204) return undefined as T;
        return (await safeJson(response)) as T;
      },
      {
        signal: opts.signal,
        // Non-idempotent writes only retry rate-limit (429) errors; ambiguous
        // 5xx/network/timeout failures are not replayed to avoid duplicate
        // side-effects. GET (and explicitly idempotent requests) retry normally.
        isRetryable: safeToReplay ? undefined : isRetryableIdempotentOnly,
        onRetry: (err, attempt, delay) => {
          if (err instanceof LoncaError) {
            logger.warn(`${config.logPrefix}.retry`, {
              attempt,
              delayMs: delay,
              code: err.code,
              status: err.status,
            });
          }
        },
      },
    );
  };
}

/** Compose a caller signal with a per-request timeout signal. */
export function composeSignal(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!external) return timeoutSignal;
  return AbortSignal.any([external, timeoutSignal]);
}

/** Read a response body as JSON, falling back to raw text (then `undefined` when empty). */
export async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
