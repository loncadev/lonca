export interface RateLimiterOptions {
  /** Maximum number of tokens the bucket holds. Each `acquire()` consumes 1. */
  capacity: number;
  /** Time window in milliseconds over which `capacity` tokens are refilled. */
  intervalMs: number;
}

/**
 * Token-bucket rate limiter. `acquire()` returns immediately when a token
 * is available, otherwise it sleeps until enough tokens have been refilled.
 *
 * @example
 * const limiter = new TokenBucketRateLimiter({ capacity: 50, intervalMs: 60_000 });
 * for (const item of items) {
 *   await limiter.acquire();
 *   await fetchSomething(item);
 * }
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillAt: number;
  private readonly capacity: number;
  private readonly intervalMs: number;

  constructor(options: RateLimiterOptions) {
    if (options.capacity <= 0 || options.intervalMs <= 0) {
      throw new RangeError('capacity and intervalMs must be > 0');
    }
    this.capacity = options.capacity;
    this.intervalMs = options.intervalMs;
    this.tokens = options.capacity;
    this.lastRefillAt = Date.now();
  }

  /**
   * Refill tokens based on elapsed time, then return ms to wait until the next
   * token is available (0 if one is available right now).
   */
  private timeUntilNextToken(): number {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed > 0) {
      const refill = (elapsed / this.intervalMs) * this.capacity;
      this.tokens = Math.min(this.capacity, this.tokens + refill);
      this.lastRefillAt = now;
    }
    if (this.tokens >= 1) return 0;
    const needed = 1 - this.tokens;
    return Math.ceil((needed / this.capacity) * this.intervalMs);
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw signal.reason as Error;
      const wait = this.timeUntilNextToken();
      if (wait === 0) {
        this.tokens -= 1;
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
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
  }

  /** Snapshot of available tokens (refills the bucket as a side effect). */
  available(): number {
    this.timeUntilNextToken();
    return this.tokens;
  }
}
