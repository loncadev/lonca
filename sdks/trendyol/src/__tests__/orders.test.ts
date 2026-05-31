import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { OrdersResource } from '../resources/orders.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

function newResource(transport: TrendyolTransport) {
  return new OrdersResource(transport, fastLimiter());
}

/**
 * Real shipment package captured from STAGE on 2026-05-25 (trimmed to the
 * fields we surface). Pins the wire shape so future SDK changes can't
 * silently regress against Trendyol's actual response.
 */
const livePackage = {
  shipmentPackageId: 92051595,
  orderNumber: '625788652',
  shipmentNumber: 606575251,
  status: 'Invoiced',
  shipmentPackageStatus: 'Invoiced',
  customerFirstName: 'Test',
  customerLastName: 'Musteri',
  customerEmail: 'pf+g8b4kyy5@trendyolmail.com',
  customerId: 21823399,
  taxNumber: null,
  identityNumber: '11111111111',
  orderDate: 1779551403247,
  lastModifiedDate: 1779704857541,
  agreedDeliveryDate: 1779799832488,
  originShipmentDate: 1779540605218,
  currencyCode: 'TRY',
  packageTotalPrice: 85,
  packageGrossAmount: 85,
  packageSellerDiscount: 0,
  packageTyDiscount: 0,
  packageTotalDiscount: 0,
  cargoTrackingNumber: 7260000167168666,
  cargoProviderName: 'Aras Kargo Marketplace',
  deliveryType: 'normal',
  deliveryAddressType: 'Shipment',
  whoPays: 1,
  fastDelivery: false,
  commercial: false,
  micro: false,
  giftBoxRequested: false,
  containsDangerousProduct: false,
  isCod: false,
  is4P: false,
  '3pByTrendyol': false,
  warehouseId: 1071976,
  invoiceLink: 'https://storage.yengec.co/.../invoice.pdf',
  createdBy: 'order-creation',
  invoiceAddress: {
    id: 18031112,
    firstName: 'Test',
    lastName: 'Musteri',
    city: 'İzmir',
    cityCode: 6,
    countryCode: 'TR',
    phone: '5000000000',
    fullAddress: 'Test fatura adresi',
    addressLines: { addressLine1: '', addressLine2: '' },
  },
  shipmentAddress: {
    id: 18031113,
    firstName: 'Test',
    lastName: 'Musteri',
    city: 'İzmir',
    countryCode: 'TR',
  },
  lines: [
    {
      lineId: 10300819,
      quantity: 1,
      productName: 'V10Test',
      barcode: '96968574858745',
      productSize: 'M',
      productColor: 'Beyaz',
      stockCode: 'V10Test',
      contentId: 123123,
      sellerId: 2738,
      lineUnitPrice: 85,
      lineGrossAmount: 85,
      lineSellerDiscount: 0,
      lineTyDiscount: 0,
      lineTotalDiscount: 0,
      vatRate: 20,
      commission: 20,
      currencyCode: 'TRY',
      orderLineItemStatusName: 'Invoiced',
      businessUnit: 'Temizlik',
      productCategoryId: 626,
      salesCampaignId: 1286842909,
      discountDetails: [{ lineItemPrice: 85, lineItemSellerDiscount: 0, lineItemTyDiscount: 0 }],
      fastDeliveryOptions: [],
    },
  ],
  packageHistories: [{ status: 'Created', createdDate: 1779540605218 }],
};

describe('OrdersResource.list', () => {
  it('hits /order/sellers/{sellerId}/orders with default page=0 size=50', async () => {
    const transport = mockTransport({ content: [] });
    await newResource(transport).list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/order/sellers/42/orders',
        query: { page: 0, size: 50 },
      }),
    );
  });

  it('caps size at 200', async () => {
    const transport = mockTransport({ content: [] });
    await newResource(transport).list({ limit: 1000 });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ size: 200 }) }),
    );
  });

  it('forwards status, orderNumber, startDate, endDate', async () => {
    const transport = mockTransport({ content: [] });
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-02-01T00:00:00Z');

    await newResource(transport).list({
      status: 'Created',
      orderNumber: 'ABC123',
      startDate: start,
      endDate: end,
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          status: 'Created',
          orderNumber: 'ABC123',
          startDate: start.getTime(),
          endDate: end.getTime(),
        }),
      }),
    );
  });

  it('decodes cursor to numeric page', async () => {
    const transport = mockTransport({ content: [], totalPages: 5 });
    await newResource(transport).list({ cursor: '3' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ page: 3 }) }),
    );
  });

  it('exposes nextCursor when more pages exist', async () => {
    const transport = mockTransport({ content: [], totalPages: 5 });
    const page = await newResource(transport).list({ cursor: '2' });
    expect(page.nextCursor).toBe('3');

    const transport2 = mockTransport({ content: [], totalPages: 3 });
    const page2 = await newResource(transport2).list({ cursor: '2' });
    expect(page2.nextCursor).toBeUndefined();
  });

  it('normalizes a live Trendyol shipment-package shape', async () => {
    const transport = mockTransport({ content: [livePackage], totalPages: 1 });
    const page = await newResource(transport).list();

    expect(page.items).toHaveLength(1);
    const pkg = page.items[0]!;
    expect(pkg).toMatchObject({
      id: '92051595',
      orderNumber: '625788652',
      shipmentNumber: '606575251',
      status: 'Invoiced',
      shipmentPackageStatus: 'Invoiced',
      currencyCode: 'TRY',
      packageTotalPrice: 85,
      cargoTrackingNumber: '7260000167168666',
      cargoProviderName: 'Aras Kargo Marketplace',
      threePByTrendyol: false,
      is4P: false,
      orderDate: new Date(1779551403247).toISOString(),
      lastModifiedDate: new Date(1779704857541).toISOString(),
    });
    expect(pkg.customer).toMatchObject({
      id: '21823399',
      firstName: 'Test',
      lastName: 'Musteri',
      email: 'pf+g8b4kyy5@trendyolmail.com',
      identityNumber: '11111111111',
    });
    expect(pkg.customer.taxNumber).toBeUndefined();
    expect(pkg.invoiceAddress?.id).toBe('18031112');
    expect(pkg.shipmentAddress?.id).toBe('18031113');
    expect(pkg.lines).toHaveLength(1);
    expect(pkg.lines[0]).toMatchObject({
      id: '10300819',
      quantity: 1,
      productName: 'V10Test',
      barcode: '96968574858745',
      productSize: 'M',
      productColor: 'Beyaz',
      lineUnitPrice: 85,
    });
    expect(pkg.packageHistories[0]).toMatchObject({
      status: 'Created',
      createdAt: new Date(1779540605218).toISOString(),
    });
    expect(pkg.raw.shipmentPackageId).toBe(92051595);
  });

  it('handles a minimal package safely (no addresses, no lines, missing scalars)', async () => {
    const transport = mockTransport({
      content: [{ shipmentPackageId: 1, orderNumber: 'O1', status: 'Created' }],
      totalPages: 1,
    });
    const page = await newResource(transport).list();
    expect(page.items[0]).toMatchObject({
      id: '1',
      orderNumber: 'O1',
      status: 'Created',
      lines: [],
      packageHistories: [],
      customer: { firstName: '', lastName: '' },
    });
  });
});
