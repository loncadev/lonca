import { TokenBucketRateLimiter, type CursorPage } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { ListFinanceParams, OtherFinancialRow, SettlementRow } from '../types/misc.js';

interface WirePage<T> {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

/**
 * Trendyol finance endpoints — current-account-statement settlements and
 * "other financials" (cargo invoices, labor cost adjustments, etc.).
 *
 * Both rows are kept as `{ raw }` because the schemas are wide and
 * evolve frequently; drill into `raw` for any field.
 */
export class FinanceResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 100, intervalMs: 60_000 });
  }

  async getSettlements(params: ListFinanceParams = {}): Promise<CursorPage<SettlementRow>> {
    return this.queryPage(`/integration/sellers/${this.sellerId}/settlements`, params);
  }

  async getOtherFinancials(params: ListFinanceParams = {}): Promise<CursorPage<OtherFinancialRow>> {
    return this.queryPage(`/integration/sellers/${this.sellerId}/otherfinancials`, params);
  }

  private async queryPage<T extends { raw: Record<string, unknown> }>(
    path: string,
    params: ListFinanceParams,
  ): Promise<CursorPage<T>> {
    const size = Math.min(params.limit ?? 50, 200);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;
    const query: Record<string, string | number | undefined> = { page, size };
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();
    if (params.transactionType) query.transactionType = params.transactionType;

    const data = await this.transport.request<WirePage<Record<string, unknown>>>({
      method: 'GET',
      path,
      query,
      rateLimiter: this.limiter,
    });

    const items = (data.content ?? []).map((row) => ({ raw: row }) as T);
    const result: CursorPage<T> = { items };
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }
}
