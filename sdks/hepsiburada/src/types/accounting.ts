/**
 * Hepsiburada Accounting types (`muhasebe-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `muhasebe-entegrasyonu` v1.0.
 *
 * Two endpoints — order performance feed (alias of the orders list,
 * delivered under a different docs tag) and the per-record accounting
 * transaction feed. Only the transactions feed is unique; the orders
 * performance feed is the same `/orders/merchantid/{id}` endpoint already
 * exposed under `orders.list()`.
 */

/**
 * Query parameters for `accounting.listTransactions()`.
 *
 * `mpfinance-external` validates the combination server-side (verified on SIT
 * 2026-08-30): when none of `orderNumber` / `packageNumber` /
 * `referenceDocument` / `sku` is given, a date-range pair is **required**
 * (`recordDateStart`+`recordDateEnd`, `dueDateStart`+`dueDateEnd`,
 * `orderDateStart`+`orderDateEnd` or `paymentDateStart`+`paymentDateEnd`),
 * and a range may span at most 1 month.
 */
export interface ListTransactionsParams {
  /**
   * ISO date `yyyy-MM-dd`.
   *
   * @deprecated Alias of {@link orderDateStart} (sent as `OrderDateStart`).
   */
  beginDate?: string;
  /**
   * ISO date `yyyy-MM-dd`.
   *
   * @deprecated Alias of {@link orderDateEnd} (sent as `OrderDateEnd`).
   */
  endDate?: string;
  /** Row offset. Required by the API — the SDK defaults it to `0`. */
  offset?: number;
  /** Page size. Required by the API — the SDK defaults it to `100`. */
  limit?: number;
  /** Filter by order number. */
  orderNumber?: string;
  /** Filter by package number. */
  packageNumber?: string;
  /** Filter by reference document. */
  referenceDocument?: string;
  /** Comma-separated transaction types. */
  transactionTypes?: string;
  /** Transaction status filter. */
  status?: string;
  /** Filter by SKU. */
  sku?: string;
  /** ISO date `yyyy-MM-dd`; pair with `orderDateEnd`, max 1-month range. */
  orderDateStart?: string;
  orderDateEnd?: string;
  /** ISO date `yyyy-MM-dd`; pair with `dueDateEnd`, max 1-month range. */
  dueDateStart?: string;
  dueDateEnd?: string;
  /** ISO date `yyyy-MM-dd`; pair with `recordDateEnd`, max 1-month range. */
  recordDateStart?: string;
  recordDateEnd?: string;
  /** ISO date `yyyy-MM-dd`; pair with `paymentDateEnd`, max 1-month range. */
  paymentDateStart?: string;
  paymentDateEnd?: string;
}

/** One accounting transaction row. */
export interface AccountingTransaction {
  transactionId?: string;
  transactionDate?: string;
  paymentDate?: string;
  type?: string;
  amount?: number;
  currency?: string;
  orderNumber?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
