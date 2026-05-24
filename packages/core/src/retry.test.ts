import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, NetworkError, RateLimitError } from './errors.js';
import { retry } from './retry.js';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result of a successful call on the first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable LoncaError and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new NetworkError({ message: 'transient' }))
      .mockRejectedValueOnce(new NetworkError({ message: 'transient' }))
      .mockResolvedValue('ok');
    const p = retry(fn, { baseDelayMs: 10, jitter: false });
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable LoncaError', async () => {
    const fn = vi.fn().mockRejectedValue(new AuthError({ message: 'nope' }));
    await expect(retry(fn, { baseDelayMs: 10, jitter: false })).rejects.toBeInstanceOf(AuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors retryAfterMs from RateLimitError', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError({ message: 'slow down', retryAfterMs: 5000 }))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();
    const p = retry(fn, { baseDelayMs: 10, jitter: false, onRetry });
    await vi.runAllTimersAsync();
    await p;
    expect(onRetry).toHaveBeenCalledWith(expect.any(RateLimitError), 1, 5000);
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    const err = new NetworkError({ message: 'down' });
    const fn = vi.fn().mockRejectedValue(err);
    const p = retry(fn, { maxAttempts: 2, baseDelayMs: 5, jitter: false });
    const assertion = expect(p).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aborts on AbortSignal during backoff', async () => {
    const fn = vi.fn().mockRejectedValue(new NetworkError({ message: 'transient' }));
    const ctrl = new AbortController();
    const p = retry(fn, { baseDelayMs: 10_000, jitter: false, signal: ctrl.signal });
    const assertion = expect(p).rejects.toThrow('cancelled');
    queueMicrotask(() => ctrl.abort(new Error('cancelled')));
    await vi.runAllTimersAsync();
    await assertion;
  });
});
