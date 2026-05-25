import { describe, expect, it } from 'vitest';
import { parseWebhookEvent } from '../parse-webhook-event.js';

/**
 * Sample sourced from Trendyol's "Webhook Model" doc (developers.trendyol.com).
 * Trimmed to the minimum fields needed to exercise the parser; full real
 * payloads carry ~50 fields per package which are all forwarded via `raw`.
 */
const docSample = {
  totalElements: 1,
  totalPages: 1,
  page: 0,
  size: 1,
  content: [
    {
      shipmentPackageId: 3330111111,
      orderNumber: '10654411111',
      status: 'Delivered',
      customerFirstName: 'Trendyol',
      customerLastName: 'Customer',
      customerEmail: 'pf+x@trendyolmail.com',
      customerId: 1451111111,
      supplierId: 2738,
      orderDate: 1762253333685,
      lastModifiedDate: 1762253333685,
      currencyCode: 'TRY',
      packageGrossAmount: 498.9,
      packageTotalPrice: 498.9,
      packageSellerDiscount: 0,
      packageTyDiscount: 0,
      packageTotalDiscount: 0,
      createdBy: 'order-creation',
      cargoTrackingNumber: 7280027504111111,
      cargoProviderName: 'Trendyol Express',
      lines: [
        {
          lineId: 4765111111,
          quantity: 1,
          productName: 'Kuş ve Çiçek Desenli Tepsi',
          barcode: '8683772071724',
          lineUnitPrice: 498.9,
          lineGrossAmount: 498.9,
        },
      ],
      packageHistories: [{ createdDate: 1762242537624, status: 'Created' }],
    },
  ],
};

describe('parseWebhookEvent', () => {
  it('parses an object body into typed ShipmentPackage[]', () => {
    const event = parseWebhookEvent(docSample);

    expect(event.packages).toHaveLength(1);
    const pkg = event.packages[0]!;
    expect(pkg.id).toBe('3330111111');
    expect(pkg.orderNumber).toBe('10654411111');
    expect(pkg.status).toBe('Delivered');
    expect(pkg.customer.firstName).toBe('Trendyol');
    expect(pkg.orderDate).toBe(new Date(1762253333685).toISOString());
    expect(pkg.lines[0]!.barcode).toBe('8683772071724');
    expect(pkg.packageHistories).toHaveLength(1);
    expect(pkg.raw.createdBy).toBe('order-creation');
  });

  it('surfaces pageInfo verbatim', () => {
    const event = parseWebhookEvent(docSample);
    expect(event.pageInfo).toEqual({
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 1,
    });
  });

  it('accepts a JSON string body', () => {
    const event = parseWebhookEvent(JSON.stringify(docSample));
    expect(event.packages).toHaveLength(1);
    expect(event.packages[0]!.id).toBe('3330111111');
  });

  it('exposes the full raw body for fallthrough fields', () => {
    const event = parseWebhookEvent(docSample);
    expect(event.raw).toBe(docSample as unknown);
  });

  it('throws ValidationError on non-JSON string', () => {
    expect(() => parseWebhookEvent('not json')).toThrow(/not valid JSON/);
  });

  it('throws ValidationError on null / primitive bodies', () => {
    expect(() => parseWebhookEvent(null)).toThrow(/must be an object/);
    expect(() => parseWebhookEvent(123)).toThrow(/must be an object/);
  });

  it('throws ValidationError when content is missing or not an array', () => {
    expect(() => parseWebhookEvent({ size: 1 })).toThrow(/content must be an array/);
    expect(() => parseWebhookEvent({ content: 'oops' })).toThrow(/content must be an array/);
  });

  it('handles multiple packages in one event', () => {
    const event = parseWebhookEvent({
      totalElements: 2,
      content: [
        { shipmentPackageId: 1, orderNumber: 'A', status: 'Created' },
        { shipmentPackageId: 2, orderNumber: 'B', status: 'Picking' },
      ],
    });
    expect(event.packages).toHaveLength(2);
    expect(event.packages.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('handles the stream-shape `id` field (vs `shipmentPackageId`)', () => {
    const event = parseWebhookEvent({
      content: [{ id: 99, orderNumber: 'X', status: 'Created' }],
    });
    expect(event.packages[0]!.id).toBe('99');
  });

  it('omits pageInfo fields when absent rather than coercing to 0', () => {
    const event = parseWebhookEvent({ content: [] });
    expect(event.pageInfo).toEqual({
      totalElements: undefined,
      totalPages: undefined,
      page: undefined,
      size: undefined,
    });
  });
});
