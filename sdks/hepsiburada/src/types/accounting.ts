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

/** Query parameters for `accounting.listTransactions()`. */
export interface ListTransactionsParams {
  /** ISO date `yyyy-MM-dd`. */
  beginDate?: string;
  /** ISO date `yyyy-MM-dd`. */
  endDate?: string;
  offset?: number;
  limit?: number;
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
