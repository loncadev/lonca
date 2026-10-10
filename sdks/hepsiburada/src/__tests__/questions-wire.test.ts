import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { QuestionsResource } from '../resources/questions.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown) {
  return {
    merchantId: 'M-wire',
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// Shaped like the documented `IssueViewModel` page (keys verified on SIT 2026-10-10); values invented.
const issue = {
  id: 'issue-0001',
  issueNumber: 1234567,
  status: 'WaitingForAnswer',
  subject: { id: 'subject-1', description: 'Ürün hakkında' },
  lastContent: 'Bu ürün su geçirmez mi?',
  conversations: [
    {
      id: 'conv-1',
      content: 'Bu ürün su geçirmez mi?',
      from: 'Customer',
      type: null,
      createdAt: '2026-10-01T10:00:00Z',
      lastModifiedAt: null,
      isMessageSeen: false,
      files: [],
    },
  ],
  product: {
    sku: 'HBV0000ABC',
    name: 'Test Ürün',
    imageUrl: 'https://img.example/x.jpg',
    stockCode: null,
  },
  merchant: { id: 'M-wire', name: 'Test Mağaza' },
  customerId: 'cust-1',
  orderNumber: null,
  lineItemId: null,
  createdAt: '2026-10-01T10:00:00Z',
  lastModifiedAt: '2026-10-01T10:00:00Z',
  expireDate: '2026-10-03T10:00:00Z',
  didCustomerSeeTheMessage: false,
  schemaVersion: 1,
};

describe('QuestionsResource — documented IssueViewModel fields', () => {
  it('maps the real fields from a paginated list', async () => {
    const r = new QuestionsResource(
      mockTransport({ currentPage: 0, data: [issue] }),
      fastLimiter(),
    );
    const [q] = await r.list({ page: 0, size: 10 });
    expect(q).toMatchObject({
      id: 'issue-0001',
      issueNumber: 1234567,
      status: 'WaitingForAnswer',
      subject: { id: 'subject-1', description: 'Ürün hakkında' },
      lastContent: 'Bu ürün su geçirmez mi?',
      product: { sku: 'HBV0000ABC', name: 'Test Ürün', imageUrl: 'https://img.example/x.jpg' },
      customerId: 'cust-1',
      createdAt: '2026-10-01T10:00:00Z',
      expireDate: '2026-10-03T10:00:00Z',
      didCustomerSeeTheMessage: false,
    });
    expect(q!.conversations).toEqual([
      {
        id: 'conv-1',
        content: 'Bu ürün su geçirmez mi?',
        from: 'Customer',
        createdAt: '2026-10-01T10:00:00Z',
        isMessageSeen: false,
      },
    ]);
    // nulls are not copied
    expect(q!.orderNumber).toBeUndefined();
    expect(q!.product!.stockCode).toBeUndefined();
  });

  it('back-fills the deprecated fields from their documented equivalents', async () => {
    const r = new QuestionsResource(mockTransport(issue), fastLimiter());
    const q = await r.get('1234567');
    expect(q.number).toBe('1234567');
    expect(q.productSku).toBe('HBV0000ABC');
    expect(q.createdDate).toBe('2026-10-01T10:00:00Z');
    expect(q.text).toBeUndefined();
    expect(q.answer).toBeUndefined();
  });

  it('still honours the legacy field names if a response carries them', async () => {
    const r = new QuestionsResource(
      mockTransport({ number: 'Q-1', text: 'q', answer: 'a', productSku: 'S', createdDate: 'd' }),
      fastLimiter(),
    );
    expect(await r.get('Q-1')).toMatchObject({
      number: 'Q-1',
      text: 'q',
      answer: 'a',
      productSku: 'S',
      createdDate: 'd',
    });
  });

  it('skips non-object conversation entries and ignores a non-object product', async () => {
    const r = new QuestionsResource(
      mockTransport({ conversations: ['x', null, { content: 'ok' }], product: 'nope' }),
      fastLimiter(),
    );
    const q = await r.get('1');
    expect(q.conversations).toEqual([{ content: 'ok' }]);
    expect(q.product).toBeUndefined();
  });
});
