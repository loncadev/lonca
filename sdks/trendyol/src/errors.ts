import {
  AuthError,
  LoncaError,
  type LoncaErrorIssue,
  NotFoundError,
  parseRetryAfter,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';

// Re-exported from `@lonca/core` so the transport (and existing imports) keep a
// single, drift-free `Retry-After` parser shared with the Hepsiburada SDK.
export { parseRetryAfter };

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
  const issues = normalizeErrorIssues(body);
  switch (status) {
    case 401:
      return new AuthError({
        message: 'Trendyol authentication failed (check apiKey / apiSecret)',
        status,
        data,
        issues,
      });
    case 403:
      return new ValidationError({
        message: 'Trendyol forbidden (check User-Agent header or endpoint path)',
        status,
        data,
        issues,
      });
    case 404:
      return new NotFoundError({ message: 'Trendyol resource not found', status, data, issues });
    case 429:
      return new RateLimitError({
        message: 'Trendyol rate limit exceeded',
        status,
        retryAfterMs,
        data,
        issues,
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError({
        message: `Trendyol server error (${status})`,
        status,
        data,
        issues,
      });
    default:
      return new LoncaError({
        code: 'UNKNOWN',
        message: `Trendyol unexpected response (${status})`,
        status,
        data,
        issues,
        retryable: false,
      });
  }
}

/**
 * Normalize Trendyol's (inconsistent) error body into `LoncaErrorIssue[]`.
 * Trendyol returns either `{ errors: [{ field?, message }] }` or
 * `{ errors: [string] }`, sometimes nested under `{ body: { errors } }`.
 *
 * Only `{ field, code, message }` are copied — never the raw payload, which can
 * carry PII. The untouched body stays on `error.data` for debugging.
 */
function normalizeErrorIssues(body: unknown): LoncaErrorIssue[] {
  const errors = extractErrorsArray(body);
  if (!errors) return [];
  const issues: LoncaErrorIssue[] = [];
  for (const entry of errors) {
    if (typeof entry === 'string') {
      issues.push({ message: entry });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      if (typeof e.message !== 'string') continue;
      const issue: LoncaErrorIssue = { message: e.message };
      if (typeof e.field === 'string') issue.field = e.field;
      if (typeof e.code === 'string') issue.code = e.code;
      issues.push(issue);
    }
  }
  return issues;
}

function extractErrorsArray(body: unknown): unknown[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.errors)) return b.errors;
  const nested = b.body;
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>;
    if (Array.isArray(n.errors)) return n.errors;
  }
  return undefined;
}
