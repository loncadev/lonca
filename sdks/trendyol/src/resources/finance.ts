import { TokenBucketRateLimiter, type CursorPage } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { FinancialTransaction, ListFinanceParams } from '../types/misc.js';

interface WirePage {
  content?: WireRow[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

interface WireRow {
  id?: string | number;
  transactionDate?: number;
  barcode?: string | null;
  transactionType?: string;
  receiptId?: number | null;
  description?: string | null;
  debt?: number;
  credit?: number;
  paymentPeriod?: number | null;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  commissionInvoiceSerialNumber?: string | null;
  sellerRevenue?: number | null;
  orderNumber?: string | null;
  paymentOrderId?: number | null;
  paymentDate?: number | null;
  sellerId?: number;
  storeId?: number | null;
  storeName?: string | null;
  storeAddress?: string | null;
  country?: string | null;
  [key: string]: unknown;
}

function toIso(epochMs: number | null | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs === 0) {
    return undefined;
  }
  return new Date(epochMs).toISOString();
}

function normalizeRow(row: WireRow): FinancialTransaction {
  const out: FinancialTransaction = {
    id: row.id !== undefined ? String(row.id) : '',
    raw: row as Record<string, unknown>,
  };
  const tx = toIso(row.transactionDate);
  if (tx) out.transactionDate = tx;
  if (row.barcode !== undefined) out.barcode = row.barcode;
  if (row.transactionType !== undefined) out.transactionType = row.transactionType;
  if (row.receiptId !== undefined) out.receiptId = row.receiptId;
  if (row.description !== undefined) out.description = row.description;
  if (typeof row.debt === 'number') out.debt = row.debt;
  if (typeof row.credit === 'number') out.credit = row.credit;
  if (row.paymentPeriod !== undefined) out.paymentPeriod = row.paymentPeriod;
  if (row.commissionRate !== undefined) out.commissionRate = row.commissionRate;
  if (row.commissionAmount !== undefined) out.commissionAmount = row.commissionAmount;
  if (row.commissionInvoiceSerialNumber !== undefined) {
    out.commissionInvoiceSerialNumber = row.commissionInvoiceSerialNumber;
  }
  if (row.sellerRevenue !== undefined) out.sellerRevenue = row.sellerRevenue;
  if (row.orderNumber !== undefined) out.orderNumber = row.orderNumber;
  if (row.paymentOrderId !== undefined) out.paymentOrderId = row.paymentOrderId;
  const pay = toIso(row.paymentDate);
  if (pay) out.paymentDate = pay;
  if (typeof row.sellerId === 'number') out.sellerId = row.sellerId;
  if (row.storeId !== undefined) out.storeId = row.storeId;
  if (row.storeName !== undefined) out.storeName = row.storeName;
  if (row.storeAddress !== undefined) out.storeAddress = row.storeAddress;
  if (row.country !== undefined) out.country = row.country;
  return out;
}

/**
 * Trendyol finance endpoints — current-account-statement settlements and
 * "other financials" (cargo invoices, labor cost adjustments, etc.).
 *
 * Both endpoints return the same `FinancialTransaction` shape on the wire,
 * so the SDK exposes one typed surface for them.
 */
export class FinanceResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 100, intervalMs: 60_000 });
  }

  async getSettlements(params: ListFinanceParams = {}): Promise<CursorPage<FinancialTransaction>> {
    return this.queryPage(
      `/integration/finance/che/sellers/${this.transport.sellerId}/settlements`,
      params,
    );
  }

  async getOtherFinancials(
    params: ListFinanceParams = {},
  ): Promise<CursorPage<FinancialTransaction>> {
    return this.queryPage(
      `/integration/finance/che/sellers/${this.transport.sellerId}/otherfinancials`,
      params,
    );
  }

  private async queryPage(
    path: string,
    params: ListFinanceParams,
  ): Promise<CursorPage<FinancialTransaction>> {
    const size = Math.min(params.limit ?? 50, 200);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const query: Record<string, string | number | undefined> = { page, size };
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();
    if (params.transactionType) query.transactionType = params.transactionType;

    const data = await this.transport.request<WirePage>({
      method: 'GET',
      path,
      query,
      rateLimiter: this.limiter,
    });

    const items = (data.content ?? []).map(normalizeRow);
    const result: CursorPage<FinancialTransaction> = { items };
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }
}
