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

/**
 * A monetary amount on an accounting row, exactly as `mpfinance-external`
 * sends it: a major-unit decimal (`value`, e.g. `149.9` lira) plus an ISO 4217
 * code (`currencyCode`, e.g. `'TRY'`). Not converted to `@lonca/core` `Money`
 * (integer minor units) — use `moneyFromMajor(value, currencyCode)` for that.
 */
export interface AccountingAmount {
  /** Major-unit decimal amount. */
  value?: number;
  /** ISO 4217 currency code (e.g. `'TRY'`). */
  currencyCode?: string;
}

/**
 * One accounting transaction row (`items[]` of
 * `GET /transactions/merchantid/{merchantId}`).
 *
 * Fields mirror the spec (`specs/hepsiburada/mpfinance-external.json`) and the
 * prod wire. Every field is optional and only set when the wire value has the
 * documented JSON type — a `null` date (e.g. `paymentDate` before payment) is
 * left unset. The untouched row is on `raw`.
 */
export interface AccountingTransaction {
  /** Transaction id (wire `id`). */
  id?: string;
  /** Transaction type (wire `transactionType`). */
  transactionType?: string;
  /** Category of the transaction type (wire `transactionTypeCategory`). */
  transactionTypeCategory?: string;
  /** Transaction status. */
  status?: string;
  /** Hepsiburada SKU of the line. */
  sku?: string;
  /** Product name of the line. */
  productName?: string;
  /** Quantity on the line. */
  quantity?: number;
  /** Merchant id the row belongs to. */
  merchantId?: string;
  orderNumber?: string;
  /** Order line (item) number. */
  orderItemNumber?: string;
  packageNumber?: string;
  invoiceNumber?: string;
  /** Free-text invoice explanation (`null` on the wire for most rows → unset). */
  invoiceExplanation?: string;
  /** `true` when the row is an invoice. */
  isInvoice?: boolean;
  /** `true` for income (credit to the merchant), `false` for an expense. */
  isIncome?: boolean;
  /**
   * The row's `amount` object (`{ value, currencyCode }`). Named
   * `transactionAmount` because the legacy numeric {@link amount} field
   * already occupies `amount`.
   */
  transactionAmount?: AccountingAmount;
  /** Tax part of the amount (wire `taxAmount`). */
  taxAmount?: AccountingAmount;
  /** Net amount (wire `netAmount`). */
  netAmount?: AccountingAmount;
  /** ISO 8601 order date-time. */
  orderDate?: string;
  /** ISO 8601 invoice date-time. */
  invoiceDate?: string;
  /** ISO 8601 due date-time. */
  dueDate?: string;
  /** ISO 8601 payment date-time; unset while the wire carries `null`. */
  paymentDate?: string;
  /**
   * @deprecated Hepsiburada sends no `transactionId`. Now back-filled from the
   *   wire `id` — use {@link id}. Will be removed in the next major.
   */
  transactionId?: string;
  /**
   * @deprecated Hepsiburada sends no `transactionDate` and none of the real
   *   dates is an exact equivalent, so this is never populated. Use
   *   {@link orderDate}, {@link invoiceDate}, {@link dueDate} or
   *   {@link paymentDate}. Will be removed in the next major.
   */
  transactionDate?: string;
  /**
   * @deprecated Hepsiburada sends no `type`. Now back-filled from the wire
   *   `transactionType` — use {@link transactionType}. Will be removed in the
   *   next major.
   */
  type?: string;
  /**
   * @deprecated The wire `amount` is an object, so earlier versions never
   *   populated this. Now back-filled from `amount.value` (major units) — use
   *   {@link transactionAmount}, which keeps the currency. Will be removed in
   *   the next major.
   */
  amount?: number;
  /**
   * @deprecated Hepsiburada sends no top-level `currency`. Now back-filled from
   *   `amount.currencyCode` — use `transactionAmount.currencyCode`. Will be
   *   removed in the next major.
   */
  currency?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
