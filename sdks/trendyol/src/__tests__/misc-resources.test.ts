import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { FinanceResource } from '../resources/finance.js';
import { InvoicesResource } from '../resources/invoices.js';
import { LabelsResource } from '../resources/labels.js';
import { LocationsResource } from '../resources/locations.js';
import { TestOrdersResource } from '../resources/test-orders.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return { request: vi.fn().mockResolvedValue(response) } as unknown as TrendyolTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// ─── Invoices ────────────────────────────────────────────────────────────

describe('InvoicesResource', () => {
  const r = (t: TrendyolTransport) => new InvoicesResource(t, 42, fastLimiter());

  it('uploadFile builds FormData with required + optional fields', async () => {
    const transport = mockTransport();
    const blob = new Blob(['hi'], { type: 'application/pdf' });
    await r(transport).uploadFile({
      shipmentPackageId: 100,
      file: blob,
      invoiceDateTime: 1678788898,
      invoiceNumber: 'ABC2024000000001',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/integration/sellers/42/seller-invoice-file');
    expect(call.body).toBeInstanceOf(FormData);
    const fd = call.body as FormData;
    expect(fd.get('shipmentPackageId')).toBe('100');
    expect(fd.get('invoiceDateTime')).toBe('1678788898');
    expect(fd.get('invoiceNumber')).toBe('ABC2024000000001');
    expect(fd.get('file')).toBeInstanceOf(Blob);
  });

  it('uploadFile throws on missing file or shipmentPackageId', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).uploadFile({
        shipmentPackageId: 0 as number,
        file: undefined as unknown as Blob,
      }),
    ).rejects.toThrow(/file is required/);
  });

  it('sendLink POSTs JSON body', async () => {
    const transport = mockTransport();
    await r(transport).sendLink({
      invoiceLink: 'https://x/i.pdf',
      shipmentPackageId: 1,
    });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/sellers/42/seller-invoice-links',
        body: { invoiceLink: 'https://x/i.pdf', shipmentPackageId: 1 },
      }),
    );
  });

  it('sendLink throws on missing invoiceLink', async () => {
    const transport = mockTransport();
    await expect(r(transport).sendLink({ invoiceLink: '', shipmentPackageId: 1 })).rejects.toThrow(
      /invoiceLink is required/,
    );
  });

  it('deleteLink POSTs to /delete with the input body', async () => {
    const transport = mockTransport();
    await r(transport).deleteLink({ serviceSourceId: 1, channelId: 2, customerId: 3 });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/sellers/42/seller-invoice-links/delete',
        body: { serviceSourceId: 1, channelId: 2, customerId: 3 },
      }),
    );
  });
});

// ─── Finance ─────────────────────────────────────────────────────────────

describe('FinanceResource', () => {
  const r = (t: TrendyolTransport) => new FinanceResource(t, 42, fastLimiter());

  it('getSettlements GETs /settlements with default paging', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).getSettlements();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/sellers/42/settlements',
        query: { page: 0, size: 50 },
      }),
    );
  });

  it('getOtherFinancials forwards date range + transactionType + cursor', async () => {
    const transport = mockTransport({ content: [], totalPages: 3 });
    const start = new Date('2026-01-01T00:00:00Z');
    const page = await r(transport).getOtherFinancials({
      cursor: '0',
      limit: 100,
      startDate: start,
      transactionType: 'DeductionInvoices',
    });
    expect(page.nextCursor).toBe('1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({
      page: 0,
      size: 100,
      startDate: start.getTime(),
      transactionType: 'DeductionInvoices',
    });
  });

  it('wraps each row as { raw }', async () => {
    const transport = mockTransport({ content: [{ id: 1, amount: 10 }] });
    const page = await r(transport).getSettlements();
    expect(page.items[0]).toEqual({ raw: { id: 1, amount: 10 } });
  });
});

// ─── Labels ──────────────────────────────────────────────────────────────

describe('LabelsResource', () => {
  const r = (t: TrendyolTransport) => new LabelsResource(t, 42, fastLimiter());

  it('createCommon POSTs to /common-label/{tracking} with input body', async () => {
    const transport = mockTransport();
    await r(transport).createCommon('TRK1', { format: 'ZPL', boxQuantity: 2 });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/sellers/42/common-label/TRK1',
        body: { format: 'ZPL', boxQuantity: 2 },
      }),
    );
  });

  it('createCommon throws on missing format', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).createCommon('TRK1', { format: undefined as unknown as 'ZPL' }),
    ).rejects.toThrow(/format is required/);
  });

  it('getCommon GETs and returns { raw }', async () => {
    const transport = mockTransport({ url: 'https://x/label.zpl' });
    const label = await r(transport).getCommon('TRK1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/sellers/42/common-label/TRK1',
      }),
    );
    expect(label.raw).toEqual({ url: 'https://x/label.zpl' });
  });
});

// ─── Test orders ─────────────────────────────────────────────────────────

describe('TestOrdersResource', () => {
  const r = (t: TrendyolTransport) => new TestOrdersResource(t, 42, fastLimiter());
  const minimal = {
    customer: { customerFirstName: 'a', customerLastName: 'b' },
    invoiceAddress: {},
    shippingAddress: {},
    seller: {},
    lines: [{}],
  };

  it('create POSTs to /test/order/orders/core', async () => {
    const transport = mockTransport();
    await r(transport).create(minimal);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/test/order/orders/core',
        body: minimal,
      }),
    );
  });

  it('create throws on missing customer', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).create({
        ...minimal,
        customer: undefined as unknown as Record<string, unknown>,
      }),
    ).rejects.toThrow(/customer is required/);
  });

  it('updateStatus PUTs to /test/order/.../status with { status }', async () => {
    const transport = mockTransport();
    await r(transport).updateStatus(99, 'Shipped');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/test/order/sellers/42/shipment-packages/99/status',
        body: { status: 'Shipped' },
      }),
    );
  });

  it('setClaimsWaitingInAction PUTs to /claims/waiting-in-action with no body', async () => {
    const transport = mockTransport();
    await r(transport).setClaimsWaitingInAction();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('PUT');
    expect(call.path).toBe('/integration/test/order/sellers/42/claims/waiting-in-action');
    expect(call.body).toBeUndefined();
  });
});

// ─── Locations ───────────────────────────────────────────────────────────

describe('LocationsResource', () => {
  const r = (t: TrendyolTransport) => new LocationsResource(t, fastLimiter());

  it('getCountries GETs /member/countries and normalizes', async () => {
    const transport = mockTransport([
      { code: 'TR', name: 'Türkiye' },
      { code: 'AZ', name: 'Azerbaijan' },
    ]);
    const countries = await r(transport).getCountries();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/integration/member/countries' }),
    );
    expect(countries).toHaveLength(2);
    expect(countries[0]).toMatchObject({ code: 'TR', name: 'Türkiye' });
    expect(countries[0]!.raw).toEqual({ code: 'TR', name: 'Türkiye' });
  });

  it('getTurkeyCities GETs the TR-specific path', async () => {
    const transport = mockTransport([]);
    await r(transport).getTurkeyCities();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/member/countries/domestic/TR/cities');
  });

  it('getTurkeyDistricts and getTurkeyNeighborhoods nest correctly', async () => {
    const transport = mockTransport([]);
    await r(transport).getTurkeyDistricts(34);
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/integration/member/countries/domestic/TR/cities/34/districts',
    );

    const transport2 = mockTransport([]);
    await r(transport2).getTurkeyNeighborhoods(34, 100);
    expect((transport2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/integration/member/countries/domestic/TR/cities/34/districts/100/neighborhoods',
    );
  });

  it('getAzerbaijanCities + getAzerbaijanDistricts hit the AZ subtree', async () => {
    const transport = mockTransport([]);
    await r(transport).getAzerbaijanCities();
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/integration/member/countries/domestic/AZ/cities',
    );
    const transport2 = mockTransport([]);
    await r(transport2).getAzerbaijanDistricts(1);
    expect((transport2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/integration/member/countries/domestic/AZ/cities/1/districts',
    );
  });

  it('getCitiesByCountry + getDistrictsByCity handle arbitrary country codes', async () => {
    const transport = mockTransport([]);
    await r(transport).getCitiesByCountry('AE');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/integration/member/countries/AE/cities',
    );

    const transport2 = mockTransport([]);
    await r(transport2).getDistrictsByCity('AE', 7);
    expect((transport2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/integration/member/countries/AE/cities/7/districts',
    );
  });

  it('returns [] when the response is not an array', async () => {
    const transport = mockTransport(undefined);
    expect(await r(transport).getCountries()).toEqual([]);
    expect(await r(transport).getTurkeyCities()).toEqual([]);
  });
});
