/**
 * Returns + compensation types for Trendyol orders.
 *
 * Trendyol distinguishes two separate concepts:
 * - **Manual return** — seller-side notification that a package was
 *   received back (no body, just a state flip on the package).
 * - **Compensation ticket** — Trendyol Express-specific dispute filed
 *   when a shipment is lost or damaged. Multi-state lifecycle with up to
 *   ~18 documented states.
 */

import type { CursorPaginationParams } from '@lonca/core';

/**
 * Lifecycle state of a Trendyol Express compensation ticket. Trendyol
 * documents 18 distinct states (`Empty`, `MarkInCompensation`,
 * `CompensationApproved`, etc.) — kept as an open enum so unknown future
 * values still type-check.
 *
 * Verified against the official spec on 2026-05-25.
 */
export type CompensationTicketState =
  | 'Empty'
  | 'MarkInCompensation'
  | 'OpenedForRefund'
  | 'StartCompensationFinanceProgress'
  | 'StartCompensationInApprovalProgress'
  | 'CompensationApproved'
  | 'CompensationRejected'
  | 'FoundAfterCompensationComplete'
  | 'NotCompensationCase'
  | 'FoundInCompensation'
  | 'FoundInvestigationProgress'
  | 'MarkCompensationCancel'
  | 'CreateCompensationTicket'
  | 'FinalizeCompensation'
  | 'CloseCompensationTicket'
  | 'FoundInvestigationProgressDeliveredToCustomer'
  | 'FoundInCompensationDeliveredToCustomer'
  | 'FoundAfterCompensationCompleteDeliveredToCustomer'
  | (string & {});

/** One line item under a compensation ticket. */
export interface CompensationItemDetail {
  /** Amount (e.g. unit price). */
  itemAmount?: number;
  itemCode?: string;
  /** Item count (number of units claimed). */
  itemCount?: number;
  itemName?: string;
}

/**
 * A Trendyol Express compensation ticket — filed when a shipment is lost
 * or damaged in transit. Returned by `orders.getCompensationTickets()`.
 */
export interface CompensationTicket {
  cargoProvider?: string;
  compensateReason?: string;
  /** ISO 8601 UTC string (converted from `createDate` ms-epoch). */
  createdAt?: string;
  currentState?: CompensationTicketState;
  deliveryNumber?: string;
  itemDetails: CompensationItemDetail[];
  orderNumber?: string;
  requestedBy?: string;
  stateMessage?: string;
  /** Total amount across items — Trendyol returns this as a string. */
  totalItemsAmount?: string;
  /** Untouched raw ticket response. */
  raw: Record<string, unknown>;
}

/** Filter / pagination params for `orders.getCompensationTickets()`. */
export interface ListCompensationTicketsParams extends CursorPaginationParams {
  /** Lower bound on `createDate` (Trendyol expects ms-epoch). */
  startDate?: Date;
  /** Upper bound on `createDate`. */
  endDate?: Date;
}
