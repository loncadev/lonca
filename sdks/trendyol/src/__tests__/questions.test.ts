import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { QuestionsResource } from '../resources/questions.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new QuestionsResource(t, fastLimiter());

describe('QuestionsResource.get', () => {
  it('GETs /qna/sellers/{id}/questions/{questionId}', async () => {
    const transport = mockTransport({ id: 99, text: 'soru?' });
    const q = await r(transport).get(99);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/qna/sellers/42/questions/99',
      }),
    );
    expect(q.id).toBe('99');
    expect(q.text).toBe('soru?');
  });

  it('url-encodes the question id', async () => {
    const transport = mockTransport({ id: 'x' });
    await r(transport).get('weird id');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/qna/sellers/42/questions/weird%20id');
  });

  it('normalizes the full Question shape with ISO dates and nested answer', async () => {
    const transport = mockTransport({
      id: 100,
      text: 'soru',
      customerId: 5,
      userName: 'A***',
      showUserName: true,
      status: 'ANSWERED',
      public: true,
      productMainId: 'PM1',
      productName: 'Etek',
      imageUrl: 'https://x/img.jpg',
      webUrl: 'https://x/p/100',
      creationDate: 1779363893000,
      answeredDateMessage: 'Cevabınız yayınlandı',
      answer: { text: 'cevap', creationDate: 1779363993000, status: 'PUBLISHED' },
      rejectedDate: 0,
      reason: 'spam',
    });

    const q = await r(transport).get(100);
    expect(q).toMatchObject({
      id: '100',
      text: 'soru',
      customerId: '5',
      status: 'ANSWERED',
      productMainId: 'PM1',
      createdAt: new Date(1779363893000).toISOString(),
      answer: {
        text: 'cevap',
        createdAt: new Date(1779363993000).toISOString(),
        status: 'PUBLISHED',
      },
    });
    // rejectedDate=0 means "never rejected" → rejectedAt should be undefined.
    expect(q.rejectedAt).toBeUndefined();
  });
});

describe('QuestionsResource.list', () => {
  it('GETs /qna/.../questions/filter with default page+size', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/qna/sellers/42/questions/filter',
        query: { page: 0, size: 50 },
      }),
    );
  });

  it('forwards all filters and emits nextCursor while more pages remain', async () => {
    const transport = mockTransport({ content: [], totalPages: 3 });
    const start = new Date('2026-01-01T00:00:00Z');

    const page = await r(transport).list({
      cursor: '0',
      limit: 200,
      barcode: 'BC1',
      status: 'WAITING_FOR_ANSWER',
      startDate: start,
    });

    expect(page.nextCursor).toBe('1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({
      page: 0,
      size: 200,
      barcode: 'BC1',
      status: 'WAITING_FOR_ANSWER',
      startDate: start.getTime(),
    });
  });
});

describe('QuestionsResource.answer', () => {
  it('POSTs to /questions/{id}/answers with { text }', async () => {
    const transport = mockTransport();
    await r(transport).answer(99, 'Çok teşekkürler, ürünümüz pamukludur.');

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/qna/sellers/42/questions/99/answers',
        body: { text: 'Çok teşekkürler, ürünümüz pamukludur.' },
      }),
    );
  });

  it('throws ValidationError when text shorter than 10 chars', async () => {
    const transport = mockTransport();
    await expect(r(transport).answer(1, 'too short')).rejects.toThrow(/at least 10/);
  });

  it('throws ValidationError when text longer than 2000 chars', async () => {
    const transport = mockTransport();
    await expect(r(transport).answer(1, 'x'.repeat(2001))).rejects.toThrow(/at most 2000/);
  });
});
