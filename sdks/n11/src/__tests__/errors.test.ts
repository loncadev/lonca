import { describe, expect, it } from 'vitest';
import {
  AuthError,
  LoncaError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';
import { mapHttpError } from '../errors.js';

describe('mapHttpError', () => {
  it.each([
    [401, AuthError],
    [403, AuthError],
    [400, ValidationError],
    [422, ValidationError],
    [404, NotFoundError],
    [429, RateLimitError],
    [500, ServerError],
    [503, ServerError],
  ])('maps HTTP %i to the matching LoncaError subclass', (status, ErrorClass) => {
    const error = mapHttpError(status, undefined);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.status).toBe(status);
  });

  it('maps an unexpected status to a non-retryable UNKNOWN LoncaError', () => {
    const error = mapHttpError(418, 'teapot');
    expect(error).toBeInstanceOf(LoncaError);
    expect(error.code).toBe('UNKNOWN');
    expect(error.retryable).toBe(false);
  });

  it('carries retryAfterMs on a 429', () => {
    expect(mapHttpError(429, {}, 1500).retryAfterMs).toBe(1500);
  });

  it('keeps the raw body on data but never in the message', () => {
    const error = mapHttpError(400, { message: 'stockCode ABC-1 bulunamadı' });
    expect(error.data).toEqual({ body: { message: 'stockCode ABC-1 bulunamadı' } });
    expect(error.message).not.toContain('ABC-1');
  });

  it('extracts issues from errors[], reasons[] and a flat message', () => {
    expect(
      mapHttpError(400, { errors: [{ field: 'title', message: 'too short' }] }).issues,
    ).toEqual([{ field: 'title', message: 'too short' }]);
    expect(mapHttpError(400, { reasons: ['vatRate alanı boş olamaz.'] }).issues).toEqual([
      { message: 'vatRate alanı boş olamaz.' },
    ]);
    expect(mapHttpError(400, { message: 'bad request' }).issues).toEqual([
      { message: 'bad request' },
    ]);
    expect(mapHttpError(400, { other: true }).issues).toEqual([]);
    expect(mapHttpError(400, 'plain text').issues).toEqual([]);
  });
});
