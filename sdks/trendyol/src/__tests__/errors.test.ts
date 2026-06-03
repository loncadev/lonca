import { describe, expect, it } from 'vitest';
import {
  AuthError,
  LoncaError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';
import { mapHttpError, parseRetryAfter } from '../errors.js';

describe('mapHttpError', () => {
  it('maps 401 to AuthError', () => {
    const err = mapHttpError(401, { exception: 'ClientApiAuthenticationException' });
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it('maps 403 to ValidationError (likely missing User-Agent)', () => {
    const err = mapHttpError(403, null);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.retryable).toBe(false);
  });

  it('maps 404 to NotFoundError', () => {
    const err = mapHttpError(404, null);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.retryable).toBe(false);
  });

  it('maps 429 to RateLimitError, preserving retryAfterMs', () => {
    const err = mapHttpError(429, null, 5000);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
  });

  it.each([500, 502, 503, 504])('maps %i to ServerError (retryable)', (status) => {
    const err = mapHttpError(status, null);
    expect(err).toBeInstanceOf(ServerError);
    expect(err.retryable).toBe(true);
  });

  it('maps unknown statuses to a non-retryable LoncaError', () => {
    const err = mapHttpError(418, { foo: 'bar' });
    expect(err).toBeInstanceOf(LoncaError);
    expect(err.code).toBe('UNKNOWN');
    expect(err.retryable).toBe(false);
    expect(err.data).toEqual({ body: { foo: 'bar' } });
  });

  it('issues defaults to [] when the body has no errors array', () => {
    expect(mapHttpError(400, { foo: 'bar' }).issues).toEqual([]);
    expect(mapHttpError(400, null).issues).toEqual([]);
  });

  it('normalizes { errors: [{ field, message }] } into issues', () => {
    const err = mapHttpError(400, {
      errors: [{ field: 'barcode', message: 'barcode is required' }],
    });
    expect(err.issues).toEqual([{ field: 'barcode', message: 'barcode is required' }]);
  });

  it('normalizes { errors: [string] } into issues', () => {
    const err = mapHttpError(400, { errors: ['something went wrong'] });
    expect(err.issues).toEqual([{ message: 'something went wrong' }]);
  });

  it('reads errors nested under { body: { errors } }', () => {
    const err = mapHttpError(400, { body: { errors: [{ message: 'nested' }] } });
    expect(err.issues).toEqual([{ message: 'nested' }]);
  });

  it('copies only field/code/message into issues, never extra (PII) fields', () => {
    const err = mapHttpError(400, {
      errors: [{ field: 'x', code: 'E1', message: 'bad', identityNumber: '12345678901' }],
    });
    expect(err.issues).toEqual([{ field: 'x', code: 'E1', message: 'bad' }]);
    expect(JSON.stringify(err.issues)).not.toContain('12345678901');
  });
});

describe('parseRetryAfter', () => {
  it('returns undefined when header is null', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('parses an integer number of seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('parses an HTTP-date into a positive delay', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(8_000);
    expect(ms).toBeLessThan(12_000);
  });

  it('clamps past HTTP-dates to 0', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it('returns undefined for garbage', () => {
    expect(parseRetryAfter('not a date')).toBeUndefined();
  });
});
