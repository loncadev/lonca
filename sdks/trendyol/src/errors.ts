import {
  AuthError,
  LoncaError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';

/**
 * Map a Trendyol HTTP response status to a `@lonca/core` error.
 *
 * - `401` → `AuthError` (bad credentials)
 * - `403` → `ValidationError` (usually missing/malformed `User-Agent` header, or wrong endpoint path)
 * - `404` → `NotFoundError`
 * - `429` → `RateLimitError` (carries `retryAfterMs` if the server provided `Retry-After`)
 * - `5xx` → `ServerError` (retryable)
 * - other → `LoncaError` with code `UNKNOWN` (non-retryable)
 */
export function mapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError {
  const data = { body } as Record<string, unknown>;
  switch (status) {
    case 401:
      return new AuthError({
        message: 'Trendyol authentication failed (check apiKey / apiSecret)',
        status,
        data,
      });
    case 403:
      return new ValidationError({
        message: 'Trendyol forbidden (check User-Agent header or endpoint path)',
        status,
        data,
      });
    case 404:
      return new NotFoundError({ message: 'Trendyol resource not found', status, data });
    case 429:
      return new RateLimitError({
        message: 'Trendyol rate limit exceeded',
        status,
        retryAfterMs,
        data,
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError({
        message: `Trendyol server error (${status})`,
        status,
        data,
      });
    default:
      return new LoncaError({
        code: 'UNKNOWN',
        message: `Trendyol unexpected response (${status})`,
        status,
        data,
        retryable: false,
      });
  }
}

/** Parse a `Retry-After` header value (seconds OR HTTP-date) into milliseconds. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const epoch = Date.parse(header);
  if (!Number.isNaN(epoch)) return Math.max(0, epoch - Date.now());
  return undefined;
}
