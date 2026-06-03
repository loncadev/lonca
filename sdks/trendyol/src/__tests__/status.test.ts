import { describe, expect, it } from 'vitest';
import { normalizeStatus, statusMap } from '../status.js';

describe('trendyol status normalization', () => {
  it('maps representative known statuses into the normalized vocab', () => {
    expect(normalizeStatus('Shipped')).toEqual({
      normalized: 'shipped',
      raw: 'Shipped',
      mapped: true,
    });
    expect(normalizeStatus('Delivered').normalized).toBe('delivered');
    expect(normalizeStatus('UnSupplied').normalized).toBe('cancelled');
    expect(normalizeStatus('Awaiting').normalized).toBe('created');
  });

  it('flags an unknown raw status instead of silently defaulting', () => {
    expect(normalizeStatus('SomeFutureStatus')).toEqual({
      normalized: 'unknown',
      raw: 'SomeFutureStatus',
      mapped: false,
    });
  });

  it('round-trips every entry in statusMap as mapped: true', () => {
    for (const [raw, normalized] of Object.entries(statusMap)) {
      expect(normalizeStatus(raw)).toEqual({ normalized, raw, mapped: true });
    }
  });
});
