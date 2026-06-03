import { describe, expect, it } from 'vitest';
import { AuthError, ValidationError } from '@lonca/core';
import { mapHttpError } from '../errors.js';

describe('hepsiburada mapHttpError', () => {
  it('maps 401 to AuthError and surfaces the raw body on data', () => {
    const err = mapHttpError(401, { message: 'bad creds' });
    expect(err).toBeInstanceOf(AuthError);
    expect(err.data).toEqual({ body: { message: 'bad creds' } });
  });

  it('normalizes { errors: [{ message, code }] } into issues', () => {
    const err = mapHttpError(400, { errors: [{ code: 'E1', message: 'sku invalid' }] });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.issues).toEqual([{ code: 'E1', message: 'sku invalid' }]);
  });

  it('normalizes a flat { message } into a single issue', () => {
    expect(mapHttpError(422, { message: 'oops' }).issues).toEqual([{ message: 'oops' }]);
  });

  it('falls back to { title } when present', () => {
    expect(mapHttpError(400, { title: 'Bad Request' }).issues).toEqual([
      { message: 'Bad Request' },
    ]);
  });

  it('issues is [] when nothing is parseable', () => {
    expect(mapHttpError(500, null).issues).toEqual([]);
  });

  it('copies only field/code/message into issues, never extra (PII) fields', () => {
    const err = mapHttpError(400, {
      errors: [{ code: 'E', message: 'm', phone: '5551234567' }],
    });
    expect(err.issues).toEqual([{ code: 'E', message: 'm' }]);
    expect(JSON.stringify(err.issues)).not.toContain('5551234567');
  });
});
