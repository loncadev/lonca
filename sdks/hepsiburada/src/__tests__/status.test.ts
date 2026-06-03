import { describe, expect, it } from 'vitest';
import { normalizeStatus, statusMap } from '../status.js';

describe('hepsiburada status normalization', () => {
  it('maps known statuses into the normalized vocab', () => {
    expect(normalizeStatus('Open')).toEqual({ normalized: 'created', raw: 'Open', mapped: true });
    expect(normalizeStatus('Delivered').normalized).toBe('delivered');
    expect(normalizeStatus('Cancelled').normalized).toBe('cancelled');
  });

  it('flags an unmapped status instead of silently defaulting', () => {
    expect(normalizeStatus('Packaged')).toEqual({
      normalized: 'unknown',
      raw: 'Packaged',
      mapped: false,
    });
  });

  it('round-trips every entry in statusMap as mapped: true', () => {
    for (const [raw, normalized] of Object.entries(statusMap)) {
      expect(normalizeStatus(raw)).toEqual({ normalized, raw, mapped: true });
    }
  });
});
