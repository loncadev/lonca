export type LoncaErrorCode =
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface LoncaErrorOptions {
  code: LoncaErrorCode;
  message: string;
  cause?: unknown;
  retryable?: boolean;
  status?: number;
  retryAfterMs?: number;
  data?: Record<string, unknown>;
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

  constructor(opts: LoncaErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'LoncaError';
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.data = opts.data;
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
