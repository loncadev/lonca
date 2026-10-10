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

  // Envelopes below mirror what prod answered on 2026-10-10 (values invented).
  describe('observed n11 envelopes', () => {
    const springError = (message: string, reason: string) => ({
      '@type': 'InternalServerException',
      name: 'InternalServerException',
      message,
      description: message,
      urlStack: ['/ms/product-query'],
      errors: [{ reason }],
    });

    it('treats a /ms 500 MissingRequestHeaderException as a non-retryable AuthError', () => {
      const error = mapHttpError(
        500,
        springError('MissingRequestHeaderException', "Required request header 'appsecret'"),
      );
      expect(error).toBeInstanceOf(AuthError);
      expect(error.retryable).toBe(false);
      expect(error.status).toBe(500);
      expect(error.issues).toEqual([{ message: "Required request header 'appsecret'" }]);
    });

    it.each(['ConstraintViolationException', 'IllegalArgumentException'])(
      'treats a /ms 500 %s as a ValidationError',
      (exception) => {
        const error = mapHttpError(500, springError(exception, 'size: must be <= 250'));
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.retryable).toBe(false);
      },
    );

    it('keeps an unrecognised /ms 500 a retryable ServerError', () => {
      const error = mapHttpError(500, springError('NullPointerException', 'boom'));
      expect(error).toBeInstanceOf(ServerError);
      expect(error.retryable).toBe(true);
    });

    it('maps the /ms 401 envelope with an empty errors[] to its message', () => {
      const error = mapHttpError(401, {
        '@type': 'SellerApiUserUnauthorizedException',
        message: 'Apide doğrulama işlemi başarısız oldu.',
        errors: [],
      });
      expect(error).toBeInstanceOf(AuthError);
      expect(error.issues).toEqual([{ message: 'Apide doğrulama işlemi başarısız oldu.' }]);
    });

    it('treats the /rest 400 authenticationFailed body as an AuthError', () => {
      const error = mapHttpError(400, {
        code: 400,
        status: 'failure',
        errorCode: 'SELLER_API.authenticationFailed',
        errorMessage: 'Apide doğrulama işlemi başarısız oldu.',
        errorCategory: 'SELLER_API',
      });
      expect(error).toBeInstanceOf(AuthError);
      expect(error.issues).toEqual([
        {
          code: 'SELLER_API.authenticationFailed',
          message: 'Apide doğrulama işlemi başarısız oldu.',
        },
      ]);
    });

    it('maps the /cdn 400 invalidInput body to a ValidationError with its code', () => {
      const error = mapHttpError(400, {
        errorCode: 'invalidInput',
        errorMessage: 'category not found',
      });
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues).toEqual([{ code: 'invalidInput', message: 'category not found' }]);
    });

    it('ignores errors[] entries without text', () => {
      expect(mapHttpError(400, { errors: [{ other: 1 }, 'plain'] }).issues).toEqual([
        { message: 'plain' },
      ]);
    });
  });
});
