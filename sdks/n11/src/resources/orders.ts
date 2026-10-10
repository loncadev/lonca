import {
  moneyFromMajor,
  TokenBucketRateLimiter,
  TRY,
  type CursorPage,
  type Money,
} from '@lonca/core';
import type { N11Transport } from '../transport.js';
import type {
  ListN11OrdersParams,
  N11Address,
  N11OrderLine,
  N11PackageHistory,
  N11ShipmentPackage,
} from '../types/order.js';

/** Page size used when `limit` is omitted. */
const DEFAULT_PAGE_SIZE = 50;
/** Documented maximum; prod silently clamps larger values to 100. */
const MAX_PAGE_SIZE = 100;

type Nullable<T> = T | null | undefined;

interface N11AddressWire {
  fullName?: Nullable<string>;
  address?: Nullable<string>;
  city?: Nullable<string>;
  district?: Nullable<string>;
  neighborhood?: Nullable<string>;
  postalCode?: Nullable<string>;
  gsm?: Nullable<string>;
  tcId?: Nullable<string>;
  taxId?: Nullable<string>;
  taxHouse?: Nullable<string>;
  invoiceType?: Nullable<number>;
  countryCode?: Nullable<string>;
}

interface N11OrderLineWire {
  orderLineId?: number | string;
  productId?: Nullable<number | string>;
  productName?: Nullable<string>;
  stockCode?: Nullable<string>;
  barcode?: Nullable<string>;
  quantity?: number;
  price?: Nullable<number>;
  dueAmount?: Nullable<number>;
  sellerInvoiceAmount?: Nullable<number>;
  sellerDiscount?: Nullable<number>;
  sellerCouponDiscount?: Nullable<number>;
  mallDiscount?: Nullable<number>;
  orderItemLineItemStatusName?: Nullable<string>;
  vatRate?: Nullable<number>;
  commissionRate?: Nullable<number>;
  variantAttributes?: Nullable<{ name?: string; value?: string }[]>;
}

/** One package of `GET /rest/delivery/v1/shipmentPackages` as observed on prod (2026-10-10). */
interface N11PackageWire {
  id?: number | string;
  orderNumber?: string;
  shipmentPackageStatus?: string;
  customerId?: Nullable<number | string>;
  /** Lower-case `f` on the wire. */
  customerfullName?: Nullable<string>;
  customerEmail?: Nullable<string>;
  tcIdentityNumber?: Nullable<string>;
  taxId?: Nullable<string>;
  taxOffice?: Nullable<string>;
  billingAddress?: Nullable<N11AddressWire>;
  shippingAddress?: Nullable<N11AddressWire>;
  deliveryAddressType?: Nullable<string>;
  shipmentCompanyId?: Nullable<number | string>;
  cargoProviderName?: Nullable<string>;
  cargoTrackingNumber?: Nullable<string>;
  cargoTrackingLink?: Nullable<string>;
  cargoSenderNumber?: Nullable<string>;
  shipmentMethod?: Nullable<number>;
  totalAmount?: Nullable<number>;
  totalDiscountAmount?: Nullable<number>;
  isReturned?: Nullable<boolean>;
  lastModifiedDate?: Nullable<number>;
  agreedDeliveryDate?: Nullable<number>;
  lines?: Nullable<N11OrderLineWire[]>;
  packageHistories?: Nullable<{ status?: string; createdDate?: Nullable<number> }[]>;
}

/**
 * Page envelope. Unlike `product-query` this is not Spring's: `page`, `size`,
 * `totalPages`, and a `pageCount` that on prod equals the number of rows in
 * the page, not the number of pages.
 */
interface N11PackagePageWire {
  content?: N11PackageWire[];
  totalPages?: number;
  page?: number;
  size?: number;
  pageCount?: number;
}

function money(value: Nullable<number>): Money | undefined {
  return typeof value === 'number' ? moneyFromMajor(value, TRY) : undefined;
}

function isoFromEpoch(value: Nullable<number>): string | undefined {
  return typeof value === 'number' ? new Date(value).toISOString() : undefined;
}

function idOf(value: Nullable<number | string>): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

/** Copy the defined, non-null, non-empty entries of `source` onto `target`. */
function assignDefined<T extends object>(target: T, source: Partial<Record<keyof T, unknown>>): T {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && value !== '') {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}

function normalizeAddress(node: Nullable<N11AddressWire>): N11Address | undefined {
  if (!node) return undefined;
  return assignDefined<N11Address>({}, node);
}

function normalizeLine(node: N11OrderLineWire): N11OrderLine {
  return assignDefined<N11OrderLine>(
    {
      lineId: String(node.orderLineId ?? ''),
      quantity: node.quantity ?? 0,
      variantAttributes: (node.variantAttributes ?? []).map((a) => ({
        name: a.name ?? '',
        value: a.value ?? '',
      })),
      raw: node as Record<string, unknown>,
    },
    {
      productId: idOf(node.productId),
      productName: node.productName,
      stockCode: node.stockCode,
      barcode: node.barcode,
      price: money(node.price),
      dueAmount: money(node.dueAmount),
      sellerInvoiceAmount: money(node.sellerInvoiceAmount),
      sellerDiscount: money(node.sellerDiscount),
      sellerCouponDiscount: money(node.sellerCouponDiscount),
      mallDiscount: money(node.mallDiscount),
      status: node.orderItemLineItemStatusName,
      vatRate: node.vatRate,
      commissionRate: node.commissionRate,
    },
  );
}

function normalizeHistory(node: {
  status?: string;
  createdDate?: Nullable<number>;
}): N11PackageHistory {
  return assignDefined<N11PackageHistory>(
    { status: node.status ?? '' },
    { createdAt: isoFromEpoch(node.createdDate) },
  );
}

function normalizePackage(row: N11PackageWire): N11ShipmentPackage {
  return assignDefined<N11ShipmentPackage>(
    {
      id: String(row.id ?? ''),
      orderNumber: row.orderNumber ?? '',
      status: row.shipmentPackageStatus ?? '',
      lines: (row.lines ?? []).map(normalizeLine),
      histories: (row.packageHistories ?? []).map(normalizeHistory),
      raw: row as Record<string, unknown>,
    },
    {
      customerId: idOf(row.customerId),
      customerFullName: row.customerfullName,
      customerEmail: row.customerEmail,
      tcIdentityNumber: row.tcIdentityNumber,
      taxId: row.taxId,
      taxOffice: row.taxOffice,
      billingAddress: normalizeAddress(row.billingAddress),
      shippingAddress: normalizeAddress(row.shippingAddress),
      deliveryAddressType: row.deliveryAddressType,
      shipmentCompanyId: idOf(row.shipmentCompanyId),
      cargoProviderName: row.cargoProviderName,
      cargoTrackingNumber: row.cargoTrackingNumber,
      cargoTrackingLink: row.cargoTrackingLink,
      cargoSenderNumber: row.cargoSenderNumber,
      shipmentMethod: row.shipmentMethod,
      totalAmount: money(row.totalAmount),
      totalDiscountAmount: money(row.totalDiscountAmount),
      isReturned: row.isReturned,
      lastModifiedAt: isoFromEpoch(row.lastModifiedDate),
      agreedDeliveryAt: isoFromEpoch(row.agreedDeliveryDate),
    },
  );
}

function epoch(value: Date | number | undefined): number | undefined {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * n11 order reads (`GET https://api.n11.com/rest/delivery/v1/shipmentPackages`).
 *
 * Source: developer.n11.com → "Sipariş Listeleme Servisi" (at most 1000
 * requests/minute, `size` at most 100, a 15-day date window, nothing before
 * November 2024). Response shape verified against prod on 2026-10-10.
 *
 * Rate limit: the documented 1000 requests/minute is applied by default; pass
 * a limiter to share one bucket across clients using the same key.
 */
export class OrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: N11Transport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * List shipment packages, one page at a time. The 0-based page index is the
   * `CursorPage` cursor, so `paginate()` from `@lonca/core` drives it.
   */
  async list(params: ListN11OrdersParams = {}): Promise<CursorPage<N11ShipmentPackage>> {
    const page = parsePageCursor(params.cursor);
    const size = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const data = await this.transport.request<N11PackagePageWire | undefined>({
      method: 'GET',
      path: '/rest/delivery/v1/shipmentPackages',
      query: {
        status: params.status,
        startDate: epoch(params.startDate),
        endDate: epoch(params.endDate),
        orderNumber: params.orderNumber,
        orderByField: params.orderByField,
        orderByDirection: params.orderByDirection,
        page,
        size,
      },
      rateLimiter: this.limiter,
    });

    const rows = data?.content ?? [];
    const result: CursorPage<N11ShipmentPackage> = { items: rows.map(normalizePackage) };
    const totalPages = data?.totalPages;
    if (rows.length > 0 && (totalPages === undefined || page + 1 < totalPages)) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }
}

function parsePageCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const page = Number(cursor);
  if (!Number.isInteger(page) || page < 0) {
    throw new TypeError(`n11 orders cursor must be a non-negative page index, got "${cursor}"`);
  }
  return page;
}
