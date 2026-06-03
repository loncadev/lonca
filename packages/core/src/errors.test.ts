import { describe, expect, it } from 'vitest';
import {
  AuthError,
  isLoncaError,
  isRetryableError,
  LoncaError,
  NetworkError,
  NotFoundError,
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
});
