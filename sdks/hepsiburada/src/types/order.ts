/**
 * Hepsiburada OMS (Order Management) types.
 *
 * Source: discovery-first against `oms-external-sit.hepsiburada.com` (2026-05).
 * Hepsiburada doesn't publish an OpenAPI for this surface — these shapes are
 * derived from live SIT responses and the merchant-portal documentation.
 *
 * - `orders` list is wrapped in `{ totalCount, limit, offset, pageCount, items }`.
 * - `packages` list returns a **raw array** (no envelope) — same pattern as
 *   the existing claims-list endpoint.
 */

/** Wrapper for the orders list endpoint. */
export interface OrdersPage<T = Order> {
  /** Total number of orders matching the query. */
  totalCount: number;
  /** Echo of the request `limit`. */
  limit: number;
  /** Echo of the request `offset`. */
  offset: number;
  /** Total number of pages at the requested `limit`. */
  pageCount: number;
  /** One page of order rows. */
  items: T[];
}

/**
 * Query parameters accepted by `orders.list()`. All are optional — omitted
 * params hit Hepsiburada's defaults (typically last-30-days, status ALL).
 */
export interface ListOrdersParams {
  /** Zero-based offset. Default: 0. */
  offset?: number;
  /** Page size. Default: 100 in SDK, up to 1000 server-side. */
  limit?: number;
  /**
   * Filter by order status string. Hepsiburada uses an open enum
   * (`Open`, `Shipped`, `Delivered`, `Cancelled`, etc.) — the SDK passes
   * the value through unchanged.
   */
  status?: string;
  /** ISO date string `yyyy-MM-dd` — orders with `createdDate >= beginDate`. */
  beginDate?: string;
  /** ISO date string `yyyy-MM-dd` — orders with `createdDate <= endDate`. */
  endDate?: string;
}

/**
 * One order row. Hepsiburada returns a deeply nested object; the SDK keeps
 * the documented top-level fields strictly typed and exposes everything
 * else via `raw` so undocumented additions never require a release.
 */
export interface Order {
  /** Hepsiburada order number (e.g. `HBO-…`). */
  orderNumber?: string;
  /** Merchant's external order ID, if assigned. */
  externalOrderNumber?: string;
  /** Order status (`Open`, `Shipped`, `Delivered`, `Cancelled`, …). */
  status?: string;
  /** ISO timestamp when the order was created. */
  createdDate?: string;
  /** ISO timestamp when the order was last updated. */
  modifiedDate?: string;
  /** Customer-facing display total (currency string). */
  total?: number | string;
  /** Untouched raw row — pull any undocumented field from here. */
  raw: Record<string, unknown>;
}

/**
 * Query parameters for `orders.listPackages()`. Same shape as
 * `ListOrdersParams` — the OMS uses a unified filter contract.
 */
export type ListPackagesParams = ListOrdersParams;

/**
 * One shipping-package row. Hepsiburada's `/packages` endpoint returns a
 * raw array; the SDK normalizes each row into this shape.
 */
export interface ShippingPackage {
  /** Hepsiburada package number (e.g. `HBP-…`). */
  packageNumber?: string;
  /** Parent order number. */
  orderNumber?: string;
  /** Package status (`Open`, `Picking`, `Shipped`, …). */
  status?: string;
  /** Cargo firm code (`ARAS`, `MNG`, `YURTICI`, …). */
  cargoCompany?: string;
  /** Cargo tracking number, if available. */
  trackingNumber?: string;
  /** ISO timestamp when the package was created. */
  createdDate?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
