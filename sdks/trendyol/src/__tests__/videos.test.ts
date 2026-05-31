import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { VideosResource } from '../resources/videos.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, sellerId = 42) {
  return {
    sellerId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) =>
  new VideosResource(t, { createLimiter: fastLimiter(), listLimiter: fastLimiter() });

describe('VideosResource.create', () => {
  it('POSTs to /integration/video/sellers/{id}/videos with body', async () => {
    const transport = mockTransport({ id: 'V-1' });
    await r(transport).create({ contentId: 'C1', url: 'https://cdn.example/v.mp4' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/video/sellers/42/videos',
        body: { contentId: 'C1', url: 'https://cdn.example/v.mp4' },
      }),
    );
  });

  it('throws ValidationError on falsy input', async () => {
    const resource = r(mockTransport());
    await expect(
      resource.create(null as unknown as Record<string, unknown>),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(resource.create(null as unknown as Record<string, unknown>)).rejects.toThrow(
      /input is required/,
    );
  });
});

describe('VideosResource.list', () => {
  it('GETs /integration/video/sellers/{id}/videos with no query by default', async () => {
    const transport = mockTransport([]);
    await r(transport).list();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/video/sellers/42/videos',
      }),
    );
  });

  it('forwards id / sellerIntegrationStatus / page / size', async () => {
    const transport = mockTransport([]);
    await r(transport).list({
      id: 'V-1',
      sellerIntegrationStatus: 'IN_PROGRESS',
      offset: 2,
      limit: 50,
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({
      id: 'V-1',
      sellerIntegrationStatus: 'IN_PROGRESS',
      page: 2,
      size: 50,
    });
  });

  it('unwraps content / items / raw array envelopes', async () => {
    const rowsContent = await r(
      mockTransport({ content: [{ id: 'V-A', status: 'COMPLETED' }] }),
    ).list();
    expect(rowsContent[0]).toMatchObject({ id: 'V-A', status: 'COMPLETED' });
    const rowsItems = await r(mockTransport({ items: [{ id: 'V-B' }] })).list();
    expect(rowsItems[0]).toMatchObject({ id: 'V-B' });
    const rowsArray = await r(mockTransport([{ id: 'V-C' }])).list();
    expect(rowsArray[0]).toMatchObject({ id: 'V-C' });
  });
});
