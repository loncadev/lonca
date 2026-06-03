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
// single, drift-free `Retry-After` parser shared with the Trendyol SDK.
export { parseRetryAfter };

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
  const data = { body } as Record<string, unknown>;
  const issues = normalizeErrorIssues(body);

  if (status === 401 || status === 403) {
    return new AuthError({
      message: status === 401 ? 'Hepsiburada authentication failed' : message,
      status,
      cause,
      data,
      issues,
    });
  }
  if (status === 404) {
    return new NotFoundError({ message, status, cause, data, issues });
  }
  if (status === 422 || status === 400) {
    return new ValidationError({ message, status, cause, data, issues });
  }
  if (status === 429) {
    return new RateLimitError({
      message: 'Hepsiburada rate limit exceeded',
      status,
      retryAfterMs,
      cause,
      data,
      issues,
    });
  }
  if (status >= 500) {
    return new ServerError({
      message: `Hepsiburada server error (${status})`,
      status,
      cause,
      data,
      issues,
    });
  }
  return new LoncaError({ message, status, cause, data, issues, code: 'UNKNOWN' });
}

/**
 * Normalize Hepsiburada's (inconsistent) error body into `LoncaErrorIssue[]`:
 * `{ errors: [{ message, code }] }`, `{ errors: [string] }`, a flat
 * `{ message }`, or `{ title }`. Only `{ field, code, message }` are copied —
 * never the raw payload, which can carry PII. The untouched body stays on
 * `error.data` for debugging.
 */
function normalizeErrorIssues(body: unknown): LoncaErrorIssue[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.errors)) {
    const issues: LoncaErrorIssue[] = [];
    for (const entry of b.errors) {
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
  if (typeof b.message === 'string') return [{ message: b.message }];
  if (typeof b.title === 'string') return [{ message: b.title }];
  return [];
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
