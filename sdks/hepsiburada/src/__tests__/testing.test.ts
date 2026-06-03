import { describe, expect, it } from 'vitest';
import { createFakeHepsiburadaClient } from '../testing.js';

describe('createFakeHepsiburadaClient', () => {
  it('exposes capabilities like a real client', () => {
    const client = createFakeHepsiburadaClient();
    expect(client.capabilities.scheduledPricing).toBe(true);
    expect(client.capabilities.listingUpdatedAt).toBe(false);
  });

  it('listings.list returns an empty OffsetPage by default', async () => {
    const client = createFakeHepsiburadaClient();
    const page = await client.listings.list({ offset: 0, limit: 50 });
    expect(page.items).toEqual([]);
    expect(page.pageCount).toBe(0);
  });

  it('seeds listing rows through a handler', async () => {
    const client = createFakeHepsiburadaClient({
      handler: (req) =>
        req.path.includes('/listings/merchantid/')
          ? { listings: [{ listingId: 'L1' }], totalCount: 1, limit: 50, offset: 0 }
          : undefined,
    });
    const page = await client.listings.list({ offset: 0, limit: 50 });
    expect(page.items.map((l) => l.listingId)).toEqual(['L1']);
  });

  it('surfaces customerName from a nested customer object via orders.list', async () => {
    const client = createFakeHepsiburadaClient({
      handler: (req) =>
        req.method === 'GET' && req.path.includes('/orders')
          ? {
              totalCount: 1,
              limit: 50,
              offset: 0,
              pageCount: 1,
              items: [
                { orderNumber: 'HBO-9', customer: { firstName: 'Ada', lastName: 'Lovelace' } },
              ],
            }
          : undefined,
    });
    const page = await client.orders.list({ offset: 0, limit: 50 });
    expect(page.items[0]!.customerName).toBe('Ada Lovelace');
  });
});
