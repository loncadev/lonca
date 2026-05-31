import { TokenBucketRateLimiter } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type { AccountingTransaction, ListTransactionsParams } from '../types/accounting.js';

const SERVICE = 'oms' as const;

/**
 * Hepsiburada Accounting (`muhasebe-entegrasyonu`).
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`.
 *
 * One unique endpoint here — the per-record transactions feed. The
 * "Performans Servisi" endpoint Hepsiburada documents under this product
 * is the same `/orders/merchantid/{id}` already covered by `orders.list()`.
 *
 * NOTE: Sandbox `beekod_dev` merchant doesn't have permission for this
 * surface; SIT calls return `404` (no transactions). Endpoint typed from
 * the developer-portal spec; live-tested in production by integrators with
 * the right scope.
 */
export class AccountingResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /**
   * List accounting transactions (record-level).
   *
   * Hepsiburada's portal documents this under "Kayıt Bazlı Muhasebe Servisi".
   */
  async listTransactions(params: ListTransactionsParams = {}): Promise<AccountingTransaction[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/transactions/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query: {
        beginDate: params.beginDate,
        endDate: params.endDate,
        offset: params.offset,
        limit: params.limit,
      },
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const out: AccountingTransaction = { raw: r };
      if (typeof r.transactionId === 'string') out.transactionId = r.transactionId;
      if (typeof r.transactionDate === 'string') out.transactionDate = r.transactionDate;
      if (typeof r.paymentDate === 'string') out.paymentDate = r.paymentDate;
      if (typeof r.type === 'string') out.type = r.type;
      if (typeof r.amount === 'number') out.amount = r.amount;
      if (typeof r.currency === 'string') out.currency = r.currency;
      if (typeof r.orderNumber === 'string') out.orderNumber = r.orderNumber;
      return out;
    });
  }
}
