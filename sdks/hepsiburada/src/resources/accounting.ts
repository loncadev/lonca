import { TokenBucketRateLimiter } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type { AccountingTransaction, ListTransactionsParams } from '../types/accounting.js';

const SERVICE = 'mpfinance' as const;

/**
 * Hepsiburada Accounting (`muhasebe-entegrasyonu`).
 *
 * **Service base URL**: `mpfinance-external[-sit].hepsiburada.com` (per the
 * portal spec — routing through `oms-external` returns 404 because the route
 * doesn't exist there; verified on SIT 2026-08-30, where the rerouted call
 * answers 200).
 *
 * One unique endpoint here — the per-record transactions feed. The
 * "Performans Servisi" endpoint Hepsiburada documents under this product
 * is the same `/orders/merchantid/{id}` already covered by `orders.list()`.
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
   * The API validates the filter combination — pass an identifier
   * (`orderNumber` / `packageNumber` / `referenceDocument` / `sku`) or a
   * date-range pair spanning at most 1 month, otherwise it answers 400.
   * Query parameter names are PascalCase on the wire (`Offset`, `Limit`, …)
   * per `specs/hepsiburada/mpfinance-external.json`.
   */
  async listTransactions(params: ListTransactionsParams = {}): Promise<AccountingTransaction[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/transactions/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query: {
        // Required by the API — defaulted so a bare call stays valid.
        Offset: params.offset ?? 0,
        Limit: params.limit ?? 100,
        OrderNumber: params.orderNumber,
        PackageNumber: params.packageNumber,
        ReferenceDocument: params.referenceDocument,
        TransactionTypes: params.transactionTypes,
        Status: params.status,
        Sku: params.sku,
        OrderDateStart: params.orderDateStart ?? params.beginDate,
        OrderDateEnd: params.orderDateEnd ?? params.endDate,
        DueDateStart: params.dueDateStart,
        DueDateEnd: params.dueDateEnd,
        RecordDateStart: params.recordDateStart,
        RecordDateEnd: params.recordDateEnd,
        PaymentDateStart: params.paymentDateStart,
        PaymentDateEnd: params.paymentDateEnd,
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
