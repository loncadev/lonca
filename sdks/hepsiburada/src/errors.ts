import {
  AuthError,
  LoncaError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';

/**
 * Map Hepsiburada HTTP errors onto `@lonca/core`'s structured error hierarchy.
 *
 * Hepsiburada's error body shape is inconsistent across services — sometimes
 * `{ errors: [{ message, code }] }`, sometimes `{ message }`, sometimes just
 * a plain text 401. The SDK surfaces the raw body as `cause` so callers can
 * pull whatever detail they need.
 */
export function mapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError {
  const message = extractMessage(body) ?? `Hepsiburada HTTP ${status}`;
  const cause = body as Error | undefined;

  if (status === 401 || status === 403) {
    return new AuthError({
      message: status === 401 ? 'Hepsiburada authentication failed' : message,
      status,
      cause,
    });
  }
  if (status === 404) {
    return new NotFoundError({ message, status, cause });
  }
  if (status === 422 || status === 400) {
    return new ValidationError({ message, status, cause });
  }
  if (status === 429) {
    return new RateLimitError({
      message: 'Hepsiburada rate limit exceeded',
      status,
      retryAfterMs,
      cause,
    });
  }
  if (status >= 500) {
    return new ServerError({
      message: `Hepsiburada server error (${status})`,
      status,
      cause,
    });
  }
  return new LoncaError({ message, status, cause, code: 'UNKNOWN' });
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string') return b.message;
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    const first = b.errors[0] as Record<string, unknown>;
    if (typeof first.message === 'string') return first.message;
  }
  if (typeof b.title === 'string') return b.title;
  return undefined;
}

/**
 * Parse a `Retry-After` header into milliseconds. Accepts both
 * seconds-as-integer and HTTP-date formats.
 */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}
