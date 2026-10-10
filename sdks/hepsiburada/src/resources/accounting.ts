import { TokenBucketRateLimiter } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  AccountingAmount,
  AccountingTransaction,
  ListTransactionsParams,
} from '../types/accounting.js';

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
    return rows.map(normalizeTransaction);
  }
}

const STRING_FIELDS = [
  'id',
  'transactionType',
  'transactionTypeCategory',
  'status',
  'sku',
  'productName',
  'merchantId',
  'orderNumber',
  'orderItemNumber',
  'packageNumber',
  'invoiceNumber',
  'invoiceExplanation',
  'orderDate',
  'invoiceDate',
  'dueDate',
  'paymentDate',
] as const satisfies ReadonlyArray<keyof AccountingTransaction>;

const BOOLEAN_FIELDS = ['isInvoice', 'isIncome'] as const satisfies ReadonlyArray<
  keyof AccountingTransaction
>;

/**
 * Map one `items[]` row onto {@link AccountingTransaction}. Wire fields
 * (spec `mpfinance-external.json`, confirmed on the prod wire 2026-10) are
 * copied when they carry the documented JSON type; the deprecated legacy
 * fields are back-filled from their exact equivalents (`transactionId` ← `id`,
 * `type` ← `transactionType`, `amount` / `currency` ← `amount.value` /
 * `amount.currencyCode`) unless a row carries the legacy name itself.
 */
function normalizeTransaction(row: unknown): AccountingTransaction {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: AccountingTransaction = { raw: r };
  for (const key of STRING_FIELDS) {
    const value = r[key];
    if (typeof value === 'string') out[key] = value;
  }
  for (const key of BOOLEAN_FIELDS) {
    const value = r[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  if (typeof r.quantity === 'number') out.quantity = r.quantity;
  const amount = toAmount(r.amount);
  if (amount) out.transactionAmount = amount;
  const taxAmount = toAmount(r.taxAmount);
  if (taxAmount) out.taxAmount = taxAmount;
  const netAmount = toAmount(r.netAmount);
  if (netAmount) out.netAmount = netAmount;

  // Deprecated legacy fields: the legacy wire name wins, else the real field.
  const transactionId = typeof r.transactionId === 'string' ? r.transactionId : out.id;
  if (transactionId !== undefined) out.transactionId = transactionId;
  const type = typeof r.type === 'string' ? r.type : out.transactionType;
  if (type !== undefined) out.type = type;
  if (typeof r.transactionDate === 'string') out.transactionDate = r.transactionDate;
  const legacyAmount = typeof r.amount === 'number' ? r.amount : amount?.value;
  if (legacyAmount !== undefined) out.amount = legacyAmount;
  const currency = typeof r.currency === 'string' ? r.currency : amount?.currencyCode;
  if (currency !== undefined) out.currency = currency;
  return out;
}

/** `{ value, currencyCode }` with each part kept only when correctly typed; `undefined` for a non-object. */
function toAmount(value: unknown): AccountingAmount | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const out: AccountingAmount = {};
  if (typeof v.value === 'number' && Number.isFinite(v.value)) out.value = v.value;
  if (typeof v.currencyCode === 'string') out.currencyCode = v.currencyCode;
  return out;
}
