/**
 * Hepsiburada OMS (Order Management) types.
 *
 * Source: `siparis-olusturma-entegrasyonu` v1.0 (developers.hepsiburada.com)
 * + discovery-first against `oms-external-sit.hepsiburada.com` (2026-05).
 *
 * - Most list endpoints return `{ totalCount, limit, offset, pageCount, items }`.
 * - The unfiltered `/packages` list returns a **raw array** (no envelope).
 * - Action endpoints (deliver, intransit, undeliver, cancel, etc.) accept
 *   loose `Record<string, unknown>` bodies — Hepsiburada's portal docs the
 *   exact field set per endpoint; the SDK passes payloads through unchanged.
 */

/** Wrapper for the orders / packages list endpoints. */
export interface OrdersPage<T = Order> {
  totalCount: number;
  limit: number;
  offset: number;
  pageCount: number;
  items: T[];
}

/** Query parameters shared across all list endpoints. */
export interface ListOrdersParams {
  /** Zero-based offset. Default: 0. */
  offset?: number;
  /** Page size. Default: 100 in SDK, up to 1000 server-side. */
  limit?: number;
  /**
   * Filter by status (open enum: `Open`, `Shipped`, `Delivered`, `Cancelled`, …).
   * Used only by `list()`; status-specific helpers (e.g. `listCancelled`) bake the
   * status into the path instead.
   */
  status?: string;
  /** ISO `yyyy-MM-dd` (or ISO 8601 timestamp). */
  beginDate?: string;
  /** ISO `yyyy-MM-dd` (or ISO 8601 timestamp). */
  endDate?: string;
}

/** Query parameters for `orders.listPackages()` and the status-specific helpers. */
export type ListPackagesParams = ListOrdersParams;

/** One order row. */
export interface Order {
  orderNumber?: string;
  externalOrderNumber?: string;
  status?: string;
  createdDate?: string;
  modifiedDate?: string;
  total?: number | string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One shipping-package row. */
export interface ShippingPackage {
  packageNumber?: string;
  orderNumber?: string;
  status?: string;
  cargoCompany?: string;
  trackingNumber?: string;
  createdDate?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One available cargo company option returned by the changeable-cargo endpoints. */
export interface CargoCompanyOption {
  code?: string;
  name?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Package label (PDF / image URL or base64 payload). */
export interface PackageLabel {
  /** When Hepsiburada returns a downloadable URL. */
  url?: string;
  /** When Hepsiburada returns a base64-encoded inline payload. */
  base64?: string;
  /** Label format (PDF / ZPL / etc.) if surfaced. */
  format?: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/**
 * Body for `orders.createPackages()` — one or more line-item groups to pack.
 * Hepsiburada's portal docs the field set; the SDK accepts any object.
 */
export type CreatePackagesInput = Record<string, unknown>;

/** Body for `orders.splitPackage()`. */
export type SplitPackageInput = Record<string, unknown>;

/** Body for `orders.cancelLineItem()`. Hepsiburada expects a `reason` field. */
export type CancelLineItemInput = Record<string, unknown>;

/** Body for the deliver / intransit / undeliver status transitions. */
export type PackageStatusInput = Record<string, unknown>;

/** Body for cargo-company-change updates (line item or package level). */
export type ChangeCargoCompanyInput = Record<string, unknown>;

/** Body for `orders.updateLineItemLaborCost()`. */
export type LaborCostInput = Record<string, unknown>;

/** Body for `orders.sendInvoiceLink()` — `{ invoiceUrl?, invoiceNumber?, … }`. */
export type InvoiceLinkInput = Record<string, unknown>;

/** Body for `orders.updateParcelInfo()` — `{ desi?, width?, height?, length?, weight? }`. */
export type ParcelInfoInput = Record<string, unknown>;

/** Body for `orders.updateWarehouse()`. */
export type WarehouseInput = Record<string, unknown>;
