import {
  AuthError,
  LoncaError,
  type LoncaErrorIssue,
  normalizeIssueEntries,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';

/**
 * Map an n11 HTTP error response to a `@lonca/core` error.
 *
 * n11's portal documents error **messages** (the "API Hata Mesajları" page) but
 * not HTTP status codes or the JSON error envelope, so this mapping follows the
 * conventions of the other Lonca SDKs and is **unverified** until an account
 * exists:
 *
 * - `401` / `403` → `AuthError` (bad or missing `appkey` / `appsecret`)
 * - `400` / `422` → `ValidationError`
 * - `404` → `NotFoundError`
 * - `429` → `RateLimitError` (carries `retryAfterMs` when the server sent `Retry-After`)
 * - `5xx` → `ServerError` (retryable)
 * - other → `LoncaError` with code `UNKNOWN`
 *
 * The raw body stays on `error.data.body`; user-facing messages are fixed
 * strings so a server message that echoes request context never leaks into
 * logs that print `error.message`.
 */
export function mapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError {
  const data = { body } as Record<string, unknown>;
  const issues = normalizeErrorIssues(body);
  if (status === 401 || status === 403) {
    return new AuthError({
      message: `n11 rejected the credentials (HTTP ${status}) — check appKey / appSecret`,
      status,
      data,
      issues,
    });
  }
  if (status === 400 || status === 422) {
    return new ValidationError({
      message: `n11 rejected the request (HTTP ${status})`,
      status,
      data,
      issues,
    });
  }
  if (status === 404) {
    return new NotFoundError({ message: 'n11 resource not found', status, data, issues });
  }
  if (status === 429) {
    return new RateLimitError({
      message: 'n11 rate limit exceeded',
      status,
      retryAfterMs,
      data,
      issues,
    });
  }
  if (status >= 500) {
    return new ServerError({ message: `n11 server error (${status})`, status, data, issues });
  }
  return new LoncaError({
    code: 'UNKNOWN',
    message: `n11 unexpected response (${status})`,
    status,
    data,
    issues,
    retryable: false,
  });
}

/**
 * Best-effort extraction of field-level issues. The documented 2xx bodies of
 * n11's write services carry problems as `reasons: string[]` (task responses)
 * or `{ message }` (package split); error bodies are undocumented, so this
 * accepts `errors[]`, `reasons[]` and a flat `message`. Only `{ field, code,
 * message }` are copied — never the raw payload.
 */
function normalizeErrorIssues(body: unknown): LoncaErrorIssue[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.errors)) return normalizeIssueEntries(b.errors);
  if (Array.isArray(b.reasons)) return normalizeIssueEntries(b.reasons);
  if (typeof b.message === 'string') return [{ message: b.message }];
  return [];
}
