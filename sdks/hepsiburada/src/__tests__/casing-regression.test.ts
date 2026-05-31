/**
 * Per-host path-casing regression tests.
 *
 * Live verification (2026-05) revealed that Hepsiburada's hosts disagree
 * on `merchantId` segment casing:
 *
 *   - listing-external[-sit]  → ONLY accepts /merchantid/  (camelCase → 400)
 *   - oms-external[-sit]      → accepts both casings; SDK uses camelCase
 *   - mpop[-sit]              → merchantId is a query param (n/a)
 *   - shipping-external[-sit] → SDK uses camelCase per spec
 *   - claim-stub-external[-sit] → SDK uses camelCase per spec
 *
 * These tests pin the SDK's emitted casing per host so a careless future
 * refactor can't unintentionally flip a path back and silently break a
 * production integration. The dynamic SIT-host-tolerance discovery is
 * documented in the README; these tests guard the **client-emitted**
 * path strings.
 */

import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { AccountingResource } from '../resources/accounting.js';
import { ClaimsResource } from '../resources/claims.js';
import { ListingsResource } from '../resources/listings.js';
import { OrdersResource } from '../resources/orders.js';
import { ShippingResource } from '../resources/shipping.js';
import { TestOrdersResource } from '../resources/test-orders.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-CASE') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

describe('Casing — listings host (listing-external) uses LOWERCASE /merchantid/', () => {
  it('list -> /listings/merchantid/{id}', async () => {
    const transport = mockTransport({ listings: [], totalCount: 0, limit: 1, offset: 0 });
    await new ListingsResource(transport, fastLimiter()).list({ offset: 0, limit: 1 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/listings\/merchantid\//);
    expect(call.path).not.toMatch(/merchantId/);
  });

  it('getBuyboxOrder -> /buybox-orders/merchantid/{id}', async () => {
    const transport = mockTransport([]);
    await new ListingsResource(transport, fastLimiter()).getBuyboxOrder('HB-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/buybox-orders\/merchantid\//);
    expect(call.path).not.toMatch(/merchantId/);
  });

  it('getCommissions -> /commissions/merchantid/{id}', async () => {
    const transport = mockTransport([]);
    await new ListingsResource(transport, fastLimiter()).getCommissions('HB-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/commissions\/merchantid\//);
    expect(call.path).not.toMatch(/merchantId/);
  });

  it('inventory-uploads / stock-uploads / price-uploads stay lowercase', async () => {
    const transport = mockTransport({ id: 'u-1' });
    await new ListingsResource(transport, fastLimiter()).uploadInventory([
      { hepsiburadaSku: 'HB-1', availableStock: 1 },
    ]);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/listings\/merchantid\//);
    expect(call.path).not.toMatch(/merchantId/);
  });
});

describe('Casing — OMS host (oms-external) uses CAMELCASE /merchantId/', () => {
  it('orders.list -> /orders/merchantId/{id}', async () => {
    const transport = mockTransport({ totalCount: 0, items: [] });
    await new OrdersResource(transport, fastLimiter()).list({ offset: 0, limit: 1 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/orders\/merchantId\//);
    expect(call.path).not.toMatch(/merchantid\//);
  });

  it('orders.listMissingInvoicePackages -> /packages/merchantId/{id}/missing-invoice', async () => {
    const transport = mockTransport({ totalCount: 0, items: [] });
    await new OrdersResource(transport, fastLimiter()).listMissingInvoicePackages();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/packages/merchantId/M-CASE/missing-invoice');
  });

  it('orders.getByOrderNumber -> /orders/merchantId/{id}/ordernumber/{n}', async () => {
    const transport = mockTransport({ orderNumber: 'HBO-1' });
    await new OrdersResource(transport, fastLimiter()).getByOrderNumber('HBO-1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/orders/merchantId/M-CASE/ordernumber/HBO-1');
  });

  it('claims.list -> /claims/merchantId/{id}', async () => {
    const transport = mockTransport([]);
    await new ClaimsResource(transport, fastLimiter()).list({ offset: 0, limit: 1 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/claims\/merchantId\//);
  });

  it('claims.listByStatus -> /claims/merchantId/{id}/status/{status}', async () => {
    const transport = mockTransport([]);
    await new ClaimsResource(transport, fastLimiter()).listByStatus('AwaitingAction', {
      limit: 1,
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/claims/merchantId/M-CASE/status/AwaitingAction');
  });

  it('accounting.listTransactions -> /transactions/merchantId/{id}', async () => {
    const transport = mockTransport([]);
    await new AccountingResource(transport, fastLimiter()).listTransactions();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toMatch(/^\/transactions\/merchantId\//);
  });
});

describe('Casing — shipping host (shipping-external) uses CAMELCASE per spec', () => {
  it('getCargoFirms -> /cargoFirms/{merchantId}', async () => {
    const transport = mockTransport([]);
    await new ShippingResource(transport, fastLimiter()).getCargoFirms();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // spec spelling is /cargoFirms/{merchantId} — both casings are camel
    expect(call.path).toBe('/cargoFirms/M-CASE');
  });

  it('listProfiles -> /profiles/{merchantId}', async () => {
    const transport = mockTransport([]);
    await new ShippingResource(transport, fastLimiter()).listProfiles();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/profiles/M-CASE');
  });
});

describe('Casing — stub hosts also use CAMELCASE per their spec', () => {
  it('testOrders.create -> /orders/merchantId/{id}', async () => {
    const transport = mockTransport({});
    await new TestOrdersResource(transport, fastLimiter()).create({ foo: 'bar' });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/orders/merchantId/M-CASE');
  });

  it('claims.create -> /claims/merchant/{id}/create (different segment name)', async () => {
    const transport = mockTransport({});
    await new ClaimsResource(transport, fastLimiter()).create({ foo: 'bar' });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // claim-stub uses /merchant/ (singular) not /merchantid/ or /merchantId/
    expect(call.path).toBe('/claims/merchant/M-CASE/create');
  });
});
