import { describe, expect, it } from 'vitest';
import { createStatusNormalizer, type NormalizedOrderStatus } from './order-status.js';

describe('order-status', () => {
  const map = {
    Created: 'created',
    Shipped: 'shipped',
    Delivered: 'delivered',
  } as const satisfies Record<string, NormalizedOrderStatus>;
  const normalizeStatus = createStatusNormalizer(map);

  it('maps a known raw status and flags mapped: true', () => {
    expect(normalizeStatus('Shipped')).toEqual({
      normalized: 'shipped',
      raw: 'Shipped',
      mapped: true,
    });
  });

  it('falls back to unknown (never a silent default) and flags mapped: false', () => {
    expect(normalizeStatus('Martian')).toEqual({
      normalized: 'unknown',
      raw: 'Martian',
      mapped: false,
    });
  });

  it('preserves the raw string verbatim, including the empty string', () => {
    expect(normalizeStatus('')).toEqual({ normalized: 'unknown', raw: '', mapped: false });
  });
});
