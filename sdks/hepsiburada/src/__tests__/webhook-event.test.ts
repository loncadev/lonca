import { describe, expect, it } from 'vitest';
import { ValidationError } from '@lonca/core';
import {
  CLAIM_WEBHOOK_EVENTS,
  HEPSIBURADA_WEBHOOK_EVENTS,
  ORDER_WEBHOOK_EVENTS,
  parseHepsiburadaWebhookEvent,
} from '../index.js';

describe('parseHepsiburadaWebhookEvent', () => {
  it('parses a JSON string body', () => {
    const out = parseHepsiburadaWebhookEvent(
      'createOrder',
      '{"orderNumber":"HBO-1","status":"Open"}',
    );
    expect(out.event).toBe('createOrder');
    expect(out.body).toEqual({ orderNumber: 'HBO-1', status: 'Open' });
    expect(out.raw).toBe(out.body);
  });

  it('passes through an already-parsed object', () => {
    const body = { packageNumber: 'HBP-1' };
    const out = parseHepsiburadaWebhookEvent('intransit', body);
    expect(out.event).toBe('intransit');
    expect(out.body).toBe(body);
  });

  it.each(HEPSIBURADA_WEBHOOK_EVENTS)('accepts %s as a known event', (event) => {
    const out = parseHepsiburadaWebhookEvent(event, { foo: 'bar' });
    expect(out.event).toBe(event);
  });

  it('throws ValidationError on unknown event', () => {
    expect(() => parseHepsiburadaWebhookEvent('orderCreated' as never, { foo: 'bar' })).toThrow(
      ValidationError,
    );
    expect(() => parseHepsiburadaWebhookEvent('orderCreated' as never, { foo: 'bar' })).toThrow(
      /unknown event/,
    );
  });

  it('throws ValidationError on null / undefined body', () => {
    expect(() => parseHepsiburadaWebhookEvent('createOrder', null)).toThrow(/body is required/);
    expect(() => parseHepsiburadaWebhookEvent('createOrder', undefined)).toThrow(
      /body is required/,
    );
  });

  it('throws ValidationError on invalid JSON string', () => {
    expect(() => parseHepsiburadaWebhookEvent('createOrder', '{not json')).toThrow(
      /not valid JSON/,
    );
  });

  it('throws ValidationError when body is JSON but not an object', () => {
    expect(() => parseHepsiburadaWebhookEvent('createOrder', '[1,2,3]')).toThrow(
      /must parse to an object/,
    );
    expect(() => parseHepsiburadaWebhookEvent('createOrder', '"a string"')).toThrow(
      /must parse to an object/,
    );
  });

  it('error message lists allowed events when event is unknown', () => {
    try {
      parseHepsiburadaWebhookEvent('xyz' as never, {});
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('createOrder');
      expect((e as Error).message).toContain('awaitingAction');
    }
  });
});

describe('event-name constants', () => {
  it('ORDER_WEBHOOK_EVENTS has 8 documented events', () => {
    expect(ORDER_WEBHOOK_EVENTS).toHaveLength(8);
    expect(ORDER_WEBHOOK_EVENTS).toContain('createOrder');
    expect(ORDER_WEBHOOK_EVENTS).toContain('createPackages');
    expect(ORDER_WEBHOOK_EVENTS).toContain('orderCancel');
    expect(ORDER_WEBHOOK_EVENTS).toContain('unpack');
    expect(ORDER_WEBHOOK_EVENTS).toContain('intransit');
    expect(ORDER_WEBHOOK_EVENTS).toContain('deliver');
    expect(ORDER_WEBHOOK_EVENTS).toContain('undeliver');
    expect(ORDER_WEBHOOK_EVENTS).toContain('changeShippingAddressOrder');
  });

  it('CLAIM_WEBHOOK_EVENTS has 4 documented events', () => {
    expect(CLAIM_WEBHOOK_EVENTS).toHaveLength(4);
    expect(CLAIM_WEBHOOK_EVENTS).toContain('awaitingAction');
    expect(CLAIM_WEBHOOK_EVENTS).toContain('awaitingPreApproval');
    expect(CLAIM_WEBHOOK_EVENTS).toContain('disputedClaimResult');
    expect(CLAIM_WEBHOOK_EVENTS).toContain('packageFromClaimResult');
  });

  it('HEPSIBURADA_WEBHOOK_EVENTS is the union (12 events)', () => {
    expect(HEPSIBURADA_WEBHOOK_EVENTS).toHaveLength(12);
  });
});
