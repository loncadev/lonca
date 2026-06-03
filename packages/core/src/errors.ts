export type LoncaErrorCode =
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * A single normalized, field-level error detail extracted from a marketplace's
 * raw error body. Each SDK maps its own (inconsistent) error JSON into this
 * shape so consumers don't have to sniff marketplace-specific payloads.
 */
export interface LoncaErrorIssue {
  /** The offending field/path, when the marketplace reports one. */
  field?: string;
  /** Marketplace-specific error code, when present. */
  code?: string;
  /** Human-readable message — always present. */
  message: string;
}

export interface LoncaErrorOptions {
  code: LoncaErrorCode;
  message: string;
  cause?: unknown;
  retryable?: boolean;
  status?: number;
  retryAfterMs?: number;
  data?: Record<string, unknown>;
  /** Normalized, field-level error details. Defaults to `[]` when omitted. */
  issues?: LoncaErrorIssue[];
}

/**
 * Root of the Lonca error hierarchy.
 *
 * Carries a tagged `code` and a `retryable` boolean so retry helpers
 * can decide what to do without sniffing message strings.
 */
export class LoncaError extends Error {
  readonly code: LoncaErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly data?: Record<string, unknown>;
  /**
   * Normalized, field-level error details mapped from the marketplace's raw
   * error body by the SDK. Always an array (never `undefined`) so callers can
   * iterate without a presence check; empty when nothing was parseable.
   */
  readonly issues: LoncaErrorIssue[];

  constructor(opts: LoncaErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'LoncaError';
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.data = opts.data;
    this.issues = opts.issues ?? [];
  }
}

type SubclassOptions = Omit<LoncaErrorOptions, 'code' | 'retryable'>;

export class AuthError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'AUTH_FAILED', retryable: false });
    this.name = 'AuthError';
  }
}

export class RateLimitError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'RATE_LIMITED', retryable: true });
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'VALIDATION_FAILED', retryable: false });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'NOT_FOUND', retryable: false });
    this.name = 'NotFoundError';
  }
}

export class ServerError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'SERVER_ERROR', retryable: true });
    this.name = 'ServerError';
  }
}

export class NetworkError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'NETWORK_ERROR', retryable: true });
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends LoncaError {
  constructor(opts: SubclassOptions) {
    super({ ...opts, code: 'TIMEOUT', retryable: true });
    this.name = 'TimeoutError';
  }
}

export function isLoncaError(value: unknown): value is LoncaError {
  return value instanceof LoncaError;
}

export function isRetryableError(value: unknown): boolean {
  return isLoncaError(value) && value.retryable;
}

/**
 * Retry predicate for **non-idempotent** requests (POST/PUT/DELETE/PATCH).
 *
 * Only `RateLimitError` (HTTP 429) is replayed, because a 429 means the server
 * rejected the request *before* processing it, so a retry cannot duplicate a
 * side-effect. Ambiguous failures — 5xx, network drops, and client-side
 * timeouts — are deliberately NOT retried here: the write may already have
 * taken effect server-side, and a blind replay would duplicate it (double
 * order split, double cancel, re-pushed price/stock batch).
 *
 * Callers that have made a write idempotent (e.g. by sending an idempotency
 * key) should opt back into full retries via `isRetryableError` instead.
 */
export function isRetryableIdempotentOnly(value: unknown): boolean {
  return isLoncaError(value) && value.retryable && value.code === 'RATE_LIMITED';
}

/**
 * Parse a `Retry-After` header value (delta-seconds OR an HTTP-date) into
 * milliseconds. Returns `undefined` when the header is absent, unparseable, or
 * non-positive.
 *
 * A non-positive value is treated as "no hint" rather than `0`: a literal
 * `Retry-After: 0` must not collapse exponential backoff into a zero-delay
 * retry storm against the very endpoint that is rate-limiting the client.
 */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds > 0 ? seconds * 1000 : undefined;
  const epoch = Date.parse(header);
  if (!Number.isNaN(epoch)) {
    const delta = epoch - Date.now();
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}
