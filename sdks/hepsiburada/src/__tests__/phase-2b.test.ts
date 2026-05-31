import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { AccountingResource } from '../resources/accounting.js';
import { CatalogResource } from '../resources/catalog.js';
import { CategoriesResource } from '../resources/categories.js';
import { OrdersResource } from '../resources/orders.js';
import { ProductUpdatesResource } from '../resources/product-updates.js';
import { PromotionsResource } from '../resources/promotions.js';
import { QuestionsResource } from '../resources/questions.js';
import { SuppliersResource } from '../resources/suppliers.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-2b') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// ─── Orders extension ─────────────────────────────────────────────────────

describe('OrdersResource — Phase 2b status-bucketed + actions', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it.each([
    ['listCancelled', '/orders/merchantid/M-2b/cancelled'],
    ['listPaymentAwaiting', '/orders/merchantid/M-2b/paymentawaiting'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport({
      totalCount: 0,
      limit: 0,
      offset: 0,
      pageCount: 0,
      items: [],
    });
    await (r(transport) as unknown as Record<string, (p?: unknown) => Promise<unknown>>)[method]!(
      {},
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', service: 'oms', path }),
    );
  });

  it.each([
    ['listShippedPackages', '/packages/merchantid/M-2b/shipped'],
    ['listDeliveredPackages', '/packages/merchantid/M-2b/delivered'],
    ['listUndeliveredPackages', '/packages/merchantid/M-2b/undelivered'],
    ['listUnpackedPackages', '/packages/merchantid/M-2b/status/unpacked'],
    ['listMissingInvoicePackages', '/packages/merchantid/M-2b/missing-invoice'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport({
      totalCount: 0,
      limit: 0,
      offset: 0,
      pageCount: 0,
      items: [],
    });
    await (r(transport) as unknown as Record<string, (p?: unknown) => Promise<unknown>>)[method]!(
      {},
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', service: 'oms', path }),
    );
  });

  it('getByOrderNumber GETs /orders/merchantid/{id}/ordernumber/{n}', async () => {
    const transport = mockTransport({ orderNumber: 'HBO-1', status: 'Open' });
    const order = await r(transport).getByOrderNumber('HBO-1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'oms',
        path: '/orders/merchantid/M-2b/ordernumber/HBO-1',
      }),
    );
    expect(order.orderNumber).toBe('HBO-1');
  });

  it('getPackage / getPackageLabel build correct paths', async () => {
    const t1 = mockTransport({ packageNumber: 'HBP-1', status: 'Open' });
    await r(t1).getPackage('HBP-1');
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/packages/merchantid/M-2b/packagenumber/HBP-1',
    );

    const t2 = mockTransport({ url: 'https://hb.example/label.pdf', format: 'PDF' });
    const label = await r(t2).getPackageLabel('HBP-1');
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/packages/merchantid/M-2b/packagenumber/HBP-1/labels',
    );
    expect(label.url).toBe('https://hb.example/label.pdf');
    expect(label.format).toBe('PDF');
  });

  it.each([
    ['markPackageInTransit', 'intransit'],
    ['markPackageDelivered', 'deliver'],
    ['markPackageUndelivered', 'undeliver'],
  ] as const)('%s POSTs /packages/.../packagenumber/{n}/%s', async (method, action) => {
    const transport = mockTransport();
    await (r(transport) as unknown as Record<string, (a: string, b?: unknown) => Promise<unknown>>)[
      method
    ]!('HBP-1', { reason: 'demo' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'oms',
        path: `/packages/merchantid/M-2b/packagenumber/HBP-1/${action}`,
        body: { reason: 'demo' },
      }),
    );
  });

  it.each([
    'markPackageInTransit',
    'markPackageDelivered',
    'markPackageUndelivered',
    'getPackage',
    'getPackageLabel',
  ] as const)('%s throws ValidationError on empty packageNumber', async (method) => {
    await expect(
      (r(mockTransport()) as unknown as Record<string, (a: string) => Promise<unknown>>)[method]!(
        '',
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('createPackages POSTs body to /packages/merchantid/{id}', async () => {
    const transport = mockTransport({ packageNumber: 'HBP-2' });
    await r(transport).createPackages({ lineItems: ['L1', 'L2'] });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'oms',
        path: '/packages/merchantid/M-2b',
        body: { lineItems: ['L1', 'L2'] },
      }),
    );
  });

  it.each([
    ['splitPackage', 'POST', '/packages/merchantid/M-2b/packagenumber/HBP-1/split'],
    ['unpackPackage', 'POST', '/packages/merchantid/M-2b/packagenumber/HBP-1/unpack'],
    [
      'updatePackageCargoCompany',
      'PUT',
      '/packages/merchantid/M-2b/packagenumber/HBP-1/changecargocompany',
    ],
    ['sendInvoiceLink', 'PUT', '/packages/merchantid/M-2b/packagenumber/HBP-1/invoice'],
    ['updateParcelInfo', 'PUT', '/packages/merchantid/M-2b/packagenumber/HBP-1/parcel-info'],
    ['updatePackageWarehouse', 'PUT', '/packages/merchantid/M-2b/packagenumber/HBP-1/warehouse'],
  ] as const)('%s sends %s to %s', async (method, verb, path) => {
    const transport = mockTransport();
    await (
      r(transport) as unknown as Record<string, (n: string, body: unknown) => Promise<unknown>>
    )[method]!('HBP-1', { foo: 'bar' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path, body: { foo: 'bar' } }),
    );
  });

  it.each([
    ['cancelLineItem', 'POST', '/lineitems/merchantid/M-2b/id/L1/cancelbymerchant'],
    ['updateLineItemCargoCompany', 'PUT', '/lineitems/merchantid/M-2b/orderlineid/L1/cargocompany'],
    ['updateLineItemLaborCost', 'PUT', '/lineitems/merchantid/M-2b/orderlineid/L1/laborcost'],
  ] as const)('%s sends %s to %s', async (method, verb, path) => {
    const transport = mockTransport();
    await (
      r(transport) as unknown as Record<string, (id: string, body: unknown) => Promise<unknown>>
    )[method]!('L1', { foo: 'bar' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path, body: { foo: 'bar' } }),
    );
  });

  it('getChangeableCargoCompaniesForLineItem builds correct path', async () => {
    const transport = mockTransport([{ code: 'ARAS', name: 'Aras' }]);
    const out = await r(transport).getChangeableCargoCompaniesForLineItem('L1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/delivery/changeablecargocompanies/merchantid/M-2b/orderlineid/L1',
    );
    expect(out[0]).toMatchObject({ code: 'ARAS', name: 'Aras' });
  });

  it('getChangeableCargoCompaniesForPackage + getPackageableLineItems build correct paths', async () => {
    const t1 = mockTransport([]);
    await r(t1).getChangeableCargoCompaniesForPackage('HBP-1');
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/packages/merchantid/M-2b/packagenumber/HBP-1/changablecargocompanies',
    );
    const t2 = mockTransport([]);
    await r(t2).getPackageableLineItems('L1');
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/lineitems/merchantid/M-2b/packageablewith/lineitemid/L1',
    );
  });
});

// ─── Catalog extension ───────────────────────────────────────────────────

describe('CatalogResource — Phase 2b mutations + tracking', () => {
  const r = (t: HepsiburadaTransport) => new CatalogResource(t, fastLimiter());

  it('listProductsByStatus query passes through', async () => {
    const transport = mockTransport([]);
    await r(transport).listProductsByStatus({ status: 'Active', page: 0, size: 50 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/product/api/products/products-by-merchant-and-status');
    expect(call.query).toMatchObject({ merchantId: 'M-2b', status: 'Active', page: 0, size: 50 });
  });

  it('getProductStatus / getDeleteProcess require tracking id', async () => {
    await expect(r(mockTransport()).getProductStatus('')).rejects.toThrow(/trackingId/);
    await expect(r(mockTransport()).getDeleteProcess('')).rejects.toThrow(/trackingId/);
  });

  it('uploadProductViaFile rejects empty array', async () => {
    await expect(r(mockTransport()).uploadProductViaFile([])).rejects.toThrow(/non-empty/);
  });

  it('uploadProductViaFile POSTs raw array body to /import + returns trackingId', async () => {
    const transport = mockTransport({ trackingId: 'TRK-1' });
    const receipt = await r(transport).uploadProductViaFile([{ categoryId: 1 }]);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/product/api/products/import');
    expect(call.body).toEqual([{ categoryId: 1 }]);
    expect(receipt.trackingId).toBe('TRK-1');
  });

  it.each([
    ['uploadFastListing', '/product/api/products/fastlisting'],
    ['approvePreMatch', '/product/api/products/approve-prematch'],
    ['rejectPreMatch', '/product/api/products/reject-prematch'],
    ['checkProductStatus', '/product/api/products/check-product-status'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, (body: unknown) => Promise<unknown>>)[method]!({
      foo: 'bar',
    });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', service: 'mpop', path, body: { foo: 'bar' } }),
    );
  });

  it('deleteByMerchantSkuList requires non-empty list', async () => {
    await expect(r(mockTransport()).deleteByMerchantSkuList({} as never)).rejects.toThrow(
      /non-empty/,
    );
    await expect(
      r(mockTransport()).deleteByMerchantSkuList({ merchantSkuList: [] }),
    ).rejects.toThrow(/non-empty/);
  });

  it('deleteByMerchantSkuList POSTs to /delete-process + returns trackingId', async () => {
    const transport = mockTransport({ trackingId: 'TRK-D1' });
    const receipt = await r(transport).deleteByMerchantSkuList({ merchantSkuList: ['M-001'] });
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/product/api/products/delete-process',
    );
    expect(receipt.trackingId).toBe('TRK-D1');
  });
});

// ─── Categories extension ────────────────────────────────────────────────

describe('CategoriesResource — Phase 2b getAttributeValues', () => {
  const r = (t: HepsiburadaTransport) => new CategoriesResource(t, fastLimiter());

  it('GETs /product/api/categories/{cat}/attribute/{attr}/values on mpop', async () => {
    const transport = mockTransport({
      success: true,
      code: 0,
      message: null,
      data: [{ id: 1, name: 'Kırmızı' }],
    });
    const out = await r(transport).getAttributeValues(60123456, 100);
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/product/api/categories/60123456/attribute/100/values',
    );
    expect(out[0]).toMatchObject({ id: 1, name: 'Kırmızı' });
    expect(out[0]!.raw).toBeDefined();
  });

  it('throws on missing categoryId or attributeId', async () => {
    await expect(r(mockTransport()).getAttributeValues('', 100)).rejects.toThrow(/categoryId/);
    await expect(r(mockTransport()).getAttributeValues(1, '')).rejects.toThrow(/attributeId/);
  });

  it('surfaces API success:false as ValidationError', async () => {
    const transport = mockTransport({
      success: false,
      code: 1003,
      message: 'Category is not a leaf',
      data: null,
    });
    await expect(r(transport).getAttributeValues(1, 1)).rejects.toThrow(/code=1003/);
  });
});

// ─── Product Updates ─────────────────────────────────────────────────────

describe('ProductUpdatesResource', () => {
  const r = (t: HepsiburadaTransport) => new ProductUpdatesResource(t, fastLimiter());

  it('importUpdates POSTs raw array body to /api/integrator/import', async () => {
    const transport = mockTransport({ trackingId: 'TRK-U1' });
    const receipt = await r(transport).importUpdates([{ hbSku: 'HB-1', fields: {} }]);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.service).toBe('oms');
    expect(call.path).toBe('/api/integrator/import');
    expect(call.body).toEqual([{ hbSku: 'HB-1', fields: {} }]);
    expect(receipt.trackingId).toBe('TRK-U1');
  });

  it('importUpdates rejects empty array', async () => {
    await expect(r(mockTransport()).importUpdates([])).rejects.toThrow(/non-empty/);
  });

  it('getUpdateStatus / getUpdateHistory build correct paths', async () => {
    const t1 = mockTransport({ trackingId: 'TRK-1', status: 'Done' });
    await r(t1).getUpdateStatus('TRK-1');
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/api/integrator/status/TRK-1',
    );

    const t2 = mockTransport([{ trackingId: 'TRK-1', status: 'Done' }]);
    await r(t2).getUpdateHistory('HBC-1');
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/api/integrator/merchant/M-2b/hbSku/HBC-1',
    );
  });
});

// ─── Suppliers ───────────────────────────────────────────────────────────

describe('SuppliersResource', () => {
  const r = (t: HepsiburadaTransport) => new SuppliersResource(t, fastLimiter());

  it.each([
    ['searchOpenPurchaseOrders', 'POST', '/suppliers/M-2b/openPurchaseOrders/search'],
    ['searchSupplierListings', 'POST', '/suppliers/M-2b/supplierlistings/search'],
    ['searchListingUpdateRequests', 'POST', '/suppliers/M-2b/listingUpdateRequests/search'],
    ['createListingUpdateRequest', 'POST', '/suppliers/M-2b/listingUpdateRequests'],
  ] as const)('%s sends %s to %s', async (method, verb, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, (body: unknown) => Promise<unknown>>)[method]!({
      pageNumber: 0,
    });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path, body: { pageNumber: 0 } }),
    );
  });

  it('getListingUpdateRequest GETs /suppliers/{id}/listingUpdateRequests/{rid}', async () => {
    const transport = mockTransport({ requestId: 'REQ-1' });
    await r(transport).getListingUpdateRequest('REQ-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/suppliers/M-2b/listingUpdateRequests/REQ-1',
    );
  });

  it('throws on empty requestId / falsy input', async () => {
    await expect(r(mockTransport()).getListingUpdateRequest('')).rejects.toThrow(/requestId/);
    await expect(
      r(mockTransport()).createListingUpdateRequest(
        undefined as unknown as Record<string, unknown>,
      ),
    ).rejects.toThrow(/input is required/);
  });
});

// ─── Accounting ──────────────────────────────────────────────────────────

describe('AccountingResource', () => {
  const r = (t: HepsiburadaTransport) => new AccountingResource(t, fastLimiter());

  it('listTransactions GETs /transactions/merchantid/{id} on oms', async () => {
    const transport = mockTransport([{ transactionId: 'T-1', amount: 99.9, currency: 'TRY' }]);
    const rows = await r(transport).listTransactions({
      beginDate: '2026-01-01',
      endDate: '2026-02-01',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.service).toBe('oms');
    expect(call.path).toBe('/transactions/merchantid/M-2b');
    expect(call.query).toMatchObject({ beginDate: '2026-01-01', endDate: '2026-02-01' });
    expect(rows[0]).toMatchObject({ transactionId: 'T-1', amount: 99.9, currency: 'TRY' });
  });

  it('listTransactions unwraps various envelopes', async () => {
    const fromItems = await r(
      mockTransport({ items: [{ transactionId: 'T-X' }] }),
    ).listTransactions();
    expect(fromItems[0]!.transactionId).toBe('T-X');
    const fromData = await r(
      mockTransport({ data: [{ transactionId: 'T-Y' }] }),
    ).listTransactions();
    expect(fromData[0]!.transactionId).toBe('T-Y');
  });
});

// ─── Questions ───────────────────────────────────────────────────────────

describe('QuestionsResource', () => {
  const r = (t: HepsiburadaTransport) => new QuestionsResource(t, fastLimiter());

  it.each([
    ['list', 'GET', '/api/v1.0/issues'],
    ['getCountByStatus', 'GET', '/api/v1.0/issues/count'],
  ] as const)('%s sends %s to %s on oms', async (method, verb, path) => {
    const transport = mockTransport({ items: [] });
    await (r(transport) as unknown as Record<string, () => Promise<unknown>>)[method]!();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path }),
    );
  });

  it('get GETs /api/v1.0/issues/{n}', async () => {
    const transport = mockTransport({ number: 'Q-1', text: 'Bu nedir?' });
    const q = await r(transport).get('Q-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/api/v1.0/issues/Q-1',
    );
    expect(q.text).toBe('Bu nedir?');
  });

  it.each([
    ['answer', '/api/v1.0/issues/Q-1/answer'],
    ['reject', '/api/v1.0/issues/Q-1/reject'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    const transport = mockTransport({});
    await (
      r(transport) as unknown as Record<string, (id: string, body: unknown) => Promise<unknown>>
    )[method]!('Q-1', { reason: 'spam' });
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(path);
  });

  it('throws on missing question number / falsy input', async () => {
    await expect(r(mockTransport()).get('')).rejects.toThrow(/number/);
    await expect(r(mockTransport()).answer('', { a: 1 })).rejects.toThrow(/number/);
    await expect(
      r(mockTransport()).answer('Q-1', null as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input/);
  });
});

// ─── Promotions ──────────────────────────────────────────────────────────

describe('PromotionsResource', () => {
  const r = (t: HepsiburadaTransport) => new PromotionsResource(t, fastLimiter());

  it.each([
    ['listCategories', 'GET', '/categories/M-2b'],
    ['getBudgets', 'GET', '/self-campaign/M-2b/budgets'],
    ['getLimits', 'GET', '/self-campaign/M-2b/limits'],
    ['listDiscounts', 'GET', '/self-campaign/M-2b/discounts'],
  ] as const)('%s sends %s to %s on oms', async (method, verb, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, () => Promise<unknown>>)[method]!();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path }),
    );
  });

  it('getDiscount GETs /self-campaign/{id}/discount/{cid}', async () => {
    const transport = mockTransport({ campaignId: 'C-1', type: 'PERCENT' });
    const d = await r(transport).getDiscount('C-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/self-campaign/M-2b/discount/C-1',
    );
    expect(d.campaignId).toBe('C-1');
  });

  it.each([
    ['createTlDiscount', '/self-campaign/M-2b/tl-discount'],
    ['createPercentDiscount', '/self-campaign/M-2b/percent-discount'],
    ['createXyDiscount', '/self-campaign/M-2b/xy-discount'],
    ['cancelDiscount', '/self-campaign/M-2b/cancel-discount'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, (body: unknown) => Promise<unknown>>)[method]!({
      foo: 'bar',
    });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', service: 'oms', path, body: { foo: 'bar' } }),
    );
  });

  it('throws on missing campaignId / falsy input', async () => {
    await expect(r(mockTransport()).getDiscount('')).rejects.toThrow(/campaignId/);
    await expect(
      r(mockTransport()).createTlDiscount(undefined as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input/);
  });
});
