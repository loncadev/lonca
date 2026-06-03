import { describe, expect, it } from 'vitest';
import {
  AuthError,
  isLoncaError,
  isRetryableError,
  isRetryableIdempotentOnly,
  LoncaError,
  NetworkError,
  NotFoundError,
  parseRetryAfter,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from './errors.js';

describe('errors', () => {
  it('LoncaError carries code, message, retryable and optional metadata', () => {
    const err = new LoncaError({
      code: 'UNKNOWN',
      message: 'boom',
      status: 500,
      retryAfterMs: 1000,
      data: { foo: 'bar' },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LoncaError);
    expect(err.name).toBe('LoncaError');
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('boom');
    expect(err.status).toBe(500);
    expect(err.retryAfterMs).toBe(1000);
    expect(err.data).toEqual({ foo: 'bar' });
    expect(err.retryable).toBe(false);
  });

  it('preserves cause', () => {
    const cause = new Error('underlying');
    const err = new LoncaError({ code: 'UNKNOWN', message: 'wrap', cause });
    expect(err.cause).toBe(cause);
  });

  it('issues defaults to an empty array so callers never branch on presence', () => {
    const err = new LoncaError({ code: 'UNKNOWN', message: 'boom' });
    expect(err.issues).toEqual([]);
    expect(err.issues.map((i) => i.message)).toEqual([]);
  });

  it('carries normalized issues when provided', () => {
    const err = new ValidationError({
      message: 'invalid',
      issues: [
        { field: 'barcode', code: 'REQUIRED', message: 'barcode is required' },
        { message: 'price too low' },
      ],
    });
    expect(err.issues).toHaveLength(2);
    expect(err.issues[0]).toEqual({
      field: 'barcode',
      code: 'REQUIRED',
      message: 'barcode is required',
    });
    expect(err.issues[1]).toEqual({ message: 'price too low' });
  });

  it.each([
    ['AuthError', new AuthError({ message: 'x' }), 'AUTH_FAILED', false],
    ['RateLimitError', new RateLimitError({ message: 'x' }), 'RATE_LIMITED', true],
    ['ValidationError', new ValidationError({ message: 'x' }), 'VALIDATION_FAILED', false],
    ['NotFoundError', new NotFoundError({ message: 'x' }), 'NOT_FOUND', false],
    ['ServerError', new ServerError({ message: 'x' }), 'SERVER_ERROR', true],
    ['NetworkError', new NetworkError({ message: 'x' }), 'NETWORK_ERROR', true],
    ['TimeoutError', new TimeoutError({ message: 'x' }), 'TIMEOUT', true],
  ])('%s tags code and retryable correctly', (name, err, code, retryable) => {
    expect(err.name).toBe(name);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
    expect(err).toBeInstanceOf(LoncaError);
  });

  it('isLoncaError narrows correctly', () => {
    expect(isLoncaError(new LoncaError({ code: 'UNKNOWN', message: '' }))).toBe(true);
    expect(isLoncaError(new Error('plain'))).toBe(false);
    expect(isLoncaError('string')).toBe(false);
    expect(isLoncaError(null)).toBe(false);
  });

  it('isRetryableError matches only retryable LoncaErrors', () => {
    expect(isRetryableError(new RateLimitError({ message: '' }))).toBe(true);
    expect(isRetryableError(new AuthError({ message: '' }))).toBe(false);
    expect(isRetryableError(new Error('plain'))).toBe(false);
  });

  it('isRetryableIdempotentOnly only matches RateLimitError (429), not ambiguous failures', () => {
    // 429 is provably rejected before processing — safe to replay even on a write.
    expect(isRetryableIdempotentOnly(new RateLimitError({ message: '' }))).toBe(true);
    // These could have committed server-side; replaying a write would duplicate it.
    expect(isRetryableIdempotentOnly(new ServerError({ message: '' }))).toBe(false);
    expect(isRetryableIdempotentOnly(new NetworkError({ message: '' }))).toBe(false);
    expect(isRetryableIdempotentOnly(new TimeoutError({ message: '' }))).toBe(false);
    expect(isRetryableIdempotentOnly(new AuthError({ message: '' }))).toBe(false);
    expect(isRetryableIdempotentOnly(new Error('plain'))).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('returns undefined for an absent or unparseable header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('not a date')).toBeUndefined();
  });

  it('parses a positive delta-seconds value into milliseconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
  });

  it('ignores a non-positive value so backoff is not collapsed to zero', () => {
    expect(parseRetryAfter('0')).toBeUndefined();
    expect(parseRetryAfter('-1')).toBeUndefined();
  });

  it('parses a future HTTP-date into a positive delay and ignores past dates', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(8_000);
    expect(ms).toBeLessThan(12_000);
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBeUndefined();
  });
});
