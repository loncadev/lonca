import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from './rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects invalid options', () => {
    expect(() => new TokenBucketRateLimiter({ capacity: 0, intervalMs: 1000 })).toThrow(RangeError);
    expect(() => new TokenBucketRateLimiter({ capacity: 5, intervalMs: -1 })).toThrow(RangeError);
  });

  it('grants tokens immediately while the bucket has capacity', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 3, intervalMs: 1000 });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.available()).toBeCloseTo(0, 5);
  });

  it('waits when the bucket is empty and resumes after refill', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, intervalMs: 1000 });
    await limiter.acquire();
    await limiter.acquire();

    let acquired = false;
    const promise = limiter.acquire().then(() => {
      acquired = true;
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(acquired).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    await promise;
    expect(acquired).toBe(true);
  });

  it('never over-grants under concurrent acquire() (check-and-decrement is atomic)', async () => {
    // The risk a multi-threaded limiter would have: many concurrent acquire()
    // calls each seeing a token after a refill and all decrementing. In a
    // single-threaded event loop the `timeUntilNextToken()`→`tokens -= 1` step
    // has no `await` between its read and write, so it runs to completion before
    // any other acquire() — only `capacity` callers can pass without a refill.
    const limiter = new TokenBucketRateLimiter({ capacity: 3, intervalMs: 10_000 });
    let granted = 0;
    const promises = Array.from({ length: 5 }, () =>
      limiter.acquire().then(() => {
        granted += 1;
      }),
    );

    // Settle microtasks without advancing time: exactly the 3 buffered tokens
    // are granted; the other 2 are parked on a refill timer. No over-grant.
    await vi.advanceTimersByTimeAsync(0);
    expect(granted).toBe(3);
    expect(limiter.available()).toBeGreaterThanOrEqual(0);

    // Drain the rest once enough time passes; still no over-grant in total.
    await vi.runAllTimersAsync();
    await Promise.all(promises);
    expect(granted).toBe(5);
  });

  it('aborts a waiting acquire when the signal fires', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 1, intervalMs: 10_000 });
    await limiter.acquire();
    const ctrl = new AbortController();
    const promise = limiter.acquire(ctrl.signal);
    const assertion = expect(promise).rejects.toThrow('cancelled');
    queueMicrotask(() => ctrl.abort(new Error('cancelled')));
    await vi.runAllTimersAsync();
    await assertion;
  });
});
