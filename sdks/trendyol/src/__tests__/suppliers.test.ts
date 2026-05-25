import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SuppliersResource } from '../resources/suppliers.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const sampleResponse = {
  supplierAddresses: [
    {
      id: 100,
      name: 'Main Warehouse',
      addressType: 'SHIPMENT',
      isShipmentAddress: true,
      isReturningAddress: true,
      isInvoiceAddress: false,
      isDefault: true,
      address: 'Some street 1',
      city: 'Istanbul',
      district: 'Kadıköy',
      postCode: '34000',
      fullName: 'Acme Co.',
    },
  ],
};

describe('SuppliersResource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hits the supplier-addresses endpoint with the configured sellerId', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42);

    await resource.getAddresses();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/sapigw/suppliers/42/addresses',
      }),
    );
  });

  it('normalizes IDs to strings and flags to booleans', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42);

    const addresses = await resource.getAddresses();

    expect(addresses).toEqual([
      {
        id: '100',
        name: 'Main Warehouse',
        addressType: 'SHIPMENT',
        isShipmentAddress: true,
        isReturningAddress: true,
        isInvoiceAddress: false,
        isDefault: true,
        address: 'Some street 1',
        city: 'Istanbul',
        district: 'Kadıköy',
        postCode: '34000',
        fullName: 'Acme Co.',
      },
    ]);
  });

  it('strips legacy `_ADDRESS` suffix from addressType', async () => {
    const transport = mockTransport({
      supplierAddresses: [{ id: 1, addressType: 'RETURNING_ADDRESS' }],
    });
    const resource = new SuppliersResource(transport, 42);

    const addresses = await resource.getAddresses();

    expect(addresses[0]!.addressType).toBe('RETURNING');
  });

  it('falls back to SHIPMENT for an unrecognized addressType', async () => {
    const transport = mockTransport({
      supplierAddresses: [{ id: 1, addressType: 'INVENTED_TYPE' }],
    });
    const resource = new SuppliersResource(transport, 42);

    const addresses = await resource.getAddresses();

    expect(addresses[0]!.addressType).toBe('SHIPMENT');
  });

  it('caches the response for the default TTL (1 hour) and skips the API on the second call', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42);

    await resource.getAddresses();
    await resource.getAddresses();
    await resource.getAddresses();

    expect(transport.request).toHaveBeenCalledOnce();
  });

  it('refetches once the cache TTL has elapsed', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42);

    await resource.getAddresses();

    // Advance just past 1 hour.
    vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    await resource.getAddresses();

    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it('refetches when forceRefresh: true is passed', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42);

    await resource.getAddresses();
    await resource.getAddresses({ forceRefresh: true });

    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it('invalidateCache() forces the next call to hit the API', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42);

    await resource.getAddresses();
    resource.invalidateCache();
    await resource.getAddresses();

    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent in-flight requests', async () => {
    let resolve: (v: typeof sampleResponse) => void;
    const transport = {
      request: vi
        .fn()
        .mockImplementation(() => new Promise<typeof sampleResponse>((res) => (resolve = res))),
    } as unknown as TrendyolTransport;
    const resource = new SuppliersResource(transport, 42);

    const p1 = resource.getAddresses();
    const p2 = resource.getAddresses();
    const p3 = resource.getAddresses();

    resolve!(sampleResponse);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(transport.request).toHaveBeenCalledOnce();
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('honors a custom cacheTtlMs override', async () => {
    const transport = mockTransport(sampleResponse);
    const resource = new SuppliersResource(transport, 42, { cacheTtlMs: 1000 });

    await resource.getAddresses();
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z')); // 2 seconds later, past 1s TTL
    await resource.getAddresses();

    expect(transport.request).toHaveBeenCalledTimes(2);
  });
});
