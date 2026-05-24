import { isLoncaError, isRetryableError } from './errors.js';

export interface RetryOptions {
  /** Total number of attempts including the initial call. Defaults to 3. */
  maxAttempts?: number;
  /** Initial delay before the second attempt, in ms. Defaults to 200. */
  baseDelayMs?: number;
  /** Upper bound on delay between any two attempts, in ms. Defaults to 10_000. */
  maxDelayMs?: number;
  /** Add up to 50% random jitter on each delay. Defaults to true. */
  jitter?: boolean;
  /** Override the default predicate. Default treats `retryable` LoncaErrors as retryable. */
  isRetryable?: (err: unknown) => boolean;
  /** Called before each retry sleep. Useful for structured logging. */
  onRetry?: (err: unknown, attempt: number, nextDelayMs: number) => void;
  /** Abort all pending sleeps and bubble the signal's reason. */
  signal?: AbortSignal;
}

const DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 10_000,
  jitter: true,
} as const;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const jitter = options.jitter ?? DEFAULTS.jitter;
  const isRetryable = options.isRetryable ?? isRetryableError;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }

      const retryAfterMs = isLoncaError(err) ? err.retryAfterMs : undefined;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const base = retryAfterMs ?? exponential;
      const jitterMs = jitter ? Math.random() * base * 0.5 : 0;
      const delay = Math.min(maxDelayMs, base + jitterMs);

      options.onRetry?.(err, attempt, delay);
      await sleep(delay, options.signal);
    }
  }
  throw lastErr;
}
