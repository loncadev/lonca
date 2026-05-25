import {
  TokenBucketRateLimiter,
  ValidationError,
  type CursorPage,
  type CursorPaginationParams,
} from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  CancelPackageItemInput,
  OrderAddress,
  OrderCustomer,
  OrderLine,
  PackageHistoryEntry,
  ProcessAlternativeDeliveryInput,
  ShipmentPackage,
  ShipmentPackageStatus,
  UpdatePackageStatusInput,
} from '../types/order.js';

/** Trendyol caps `size` at 200; default 200. */
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export interface ListOrdersParams extends CursorPaginationParams {
  status?: ShipmentPackageStatus;
  orderNumber?: string;
  /** Filter packages updated on or after this date (Trendyol expects ms-epoch). */
  startDate?: Date;
  /** Filter packages updated on or before this date. */
  endDate?: Date;
}

// ─── Wire shapes (verified via raw inspect on STAGE 2026-05-25) ─────────────

interface TrendyolPackageHistoryNode {
  status?: string;
  createdDate?: number;
  [key: string]: unknown;
}

interface TrendyolOrderLineNode {
  lineId?: number | string;
  quantity?: number;
  productName?: string;
  barcode?: string;
  productSize?: string;
  productColor?: string;
  stockCode?: string;
  contentId?: number | string;
  sellerId?: number | string;
  productCategoryId?: number | string;
  salesCampaignId?: number | string;
  currencyCode?: string;
  lineUnitPrice?: number;
  lineGrossAmount?: number;
  lineSellerDiscount?: number;
  lineTyDiscount?: number;
  lineTotalDiscount?: number;
  vatRate?: number;
  commission?: number;
  orderLineItemStatusName?: string;
  businessUnit?: string;
  fastDeliveryOptions?: unknown[];
  discountDetails?: unknown[];
  [key: string]: unknown;
}

interface TrendyolAddressNode {
  id?: number | string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  fullAddress?: string;
  shortAddress?: string;
  city?: string;
  cityCode?: number;
  district?: string;
  districtId?: number;
  neighborhoodId?: number;
  countyId?: number;
  countyName?: string;
  stateName?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  addressLines?: { addressLine1?: string; addressLine2?: string };
}

interface TrendyolShipmentPackageNode {
  shipmentPackageId?: number | string;
  orderNumber?: string;
  shipmentNumber?: number | string;
  originPackageIds?: Array<number | string> | null;
  warehouseId?: number | string;
  supplierId?: number | string;

  status?: string;
  shipmentPackageStatus?: string;

  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerId?: number | string;
  taxNumber?: string | null;
  identityNumber?: string;

  orderDate?: number;
  lastModifiedDate?: number;
  agreedDeliveryDate?: number;
  estimatedDeliveryStartDate?: number;
  estimatedDeliveryEndDate?: number;
  originShipmentDate?: number;

  currencyCode?: string;
  packageTotalPrice?: number;
  packageGrossAmount?: number;
  packageSellerDiscount?: number;
  packageTyDiscount?: number;
  packageTotalDiscount?: number;

  invoiceAddress?: TrendyolAddressNode;
  shipmentAddress?: TrendyolAddressNode;
  deliveryAddressType?: string;

  cargoTrackingNumber?: number | string;
  cargoProviderName?: string;
  cargoProviderId?: number | string;
  cargoSenderNumber?: string;

  deliveryType?: string;
  whoPays?: number;
  timeSlotId?: number;
  fastDelivery?: boolean;
  fastDeliveryType?: string;
  deliveredByService?: boolean;

  commercial?: boolean;
  micro?: boolean;
  giftBoxRequested?: boolean;
  containsDangerousProduct?: boolean;
  isCod?: boolean;
  is4P?: boolean;

  invoiceLink?: string;
  createdBy?: string;

  lines?: TrendyolOrderLineNode[];
  packageHistories?: TrendyolPackageHistoryNode[];

  [key: string]: unknown;
}

interface TrendyolGetOrdersResponse {
  content?: TrendyolShipmentPackageNode[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

// ─── Normalizers ────────────────────────────────────────────────────────────

function toIso(epochMs: number | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs === 0) {
    return undefined;
  }
  return new Date(epochMs).toISOString();
}

function normalizeAddress(node: TrendyolAddressNode | undefined): OrderAddress | undefined {
  if (!node) return undefined;
  const out: OrderAddress = {};
  if (node.id !== undefined) out.id = String(node.id);
  if (node.firstName !== undefined) out.firstName = node.firstName;
  if (node.lastName !== undefined) out.lastName = node.lastName;
  if (node.fullName !== undefined) out.fullName = node.fullName;
  if (node.company !== undefined) out.company = node.company;
  if (node.address1 !== undefined) out.address1 = node.address1;
  if (node.address2 !== undefined) out.address2 = node.address2;
  if (node.fullAddress !== undefined) out.fullAddress = node.fullAddress;
  if (node.shortAddress !== undefined) out.shortAddress = node.shortAddress;
  if (node.city !== undefined) out.city = node.city;
  if (node.cityCode !== undefined) out.cityCode = node.cityCode;
  if (node.district !== undefined) out.district = node.district;
  if (node.districtId !== undefined) out.districtId = node.districtId;
  if (node.neighborhoodId !== undefined) out.neighborhoodId = node.neighborhoodId;
  if (node.countyId !== undefined) out.countyId = node.countyId;
  if (node.countyName !== undefined) out.countyName = node.countyName;
  if (node.stateName !== undefined) out.stateName = node.stateName;
  if (node.postalCode !== undefined) out.postalCode = node.postalCode;
  if (node.countryCode !== undefined) out.countryCode = node.countryCode;
  if (node.phone !== undefined) out.phone = node.phone;
  if (node.addressLines !== undefined) out.addressLines = node.addressLines;
  return out;
}

function normalizeLine(node: TrendyolOrderLineNode): OrderLine {
  const out: OrderLine = {
    id: node.lineId !== undefined ? String(node.lineId) : '',
    quantity: typeof node.quantity === 'number' ? node.quantity : 0,
    productName: node.productName ?? '',
    barcode: node.barcode ?? '',
    lineUnitPrice: typeof node.lineUnitPrice === 'number' ? node.lineUnitPrice : 0,
    lineGrossAmount: typeof node.lineGrossAmount === 'number' ? node.lineGrossAmount : 0,
    raw: node as Record<string, unknown>,
  };
  if (node.productSize !== undefined) out.productSize = node.productSize;
  if (node.productColor !== undefined) out.productColor = node.productColor;
  if (node.stockCode !== undefined) out.stockCode = node.stockCode;
  if (node.contentId !== undefined) out.contentId = String(node.contentId);
  if (node.sellerId !== undefined) out.sellerId = String(node.sellerId);
  if (node.productCategoryId !== undefined) out.productCategoryId = String(node.productCategoryId);
  if (node.salesCampaignId !== undefined) out.salesCampaignId = String(node.salesCampaignId);
  if (node.currencyCode !== undefined) out.currencyCode = node.currencyCode;
  if (node.lineSellerDiscount !== undefined) out.lineSellerDiscount = node.lineSellerDiscount;
  if (node.lineTyDiscount !== undefined) out.lineTyDiscount = node.lineTyDiscount;
  if (node.lineTotalDiscount !== undefined) out.lineTotalDiscount = node.lineTotalDiscount;
  if (node.vatRate !== undefined) out.vatRate = node.vatRate;
  if (node.commission !== undefined) out.commission = node.commission;
  if (node.orderLineItemStatusName !== undefined) {
    out.orderLineItemStatusName = node.orderLineItemStatusName;
  }
  if (node.businessUnit !== undefined) out.businessUnit = node.businessUnit;
  if (Array.isArray(node.fastDeliveryOptions)) out.fastDeliveryOptions = node.fastDeliveryOptions;
  if (Array.isArray(node.discountDetails)) {
    out.discountDetails = node.discountDetails as OrderLine['discountDetails'];
  }
  return out;
}

function normalizeHistory(node: TrendyolPackageHistoryNode): PackageHistoryEntry {
  const out: PackageHistoryEntry = { raw: node as Record<string, unknown> };
  if (node.status !== undefined) out.status = node.status;
  const createdAt = toIso(node.createdDate);
  if (createdAt) out.createdAt = createdAt;
  return out;
}

function normalizeCustomer(node: TrendyolShipmentPackageNode): OrderCustomer {
  const out: OrderCustomer = {
    firstName: node.customerFirstName ?? '',
    lastName: node.customerLastName ?? '',
  };
  if (node.customerId !== undefined) out.id = String(node.customerId);
  if (node.customerEmail !== undefined) out.email = node.customerEmail;
  if (node.taxNumber !== undefined && node.taxNumber !== null) out.taxNumber = node.taxNumber;
  if (node.identityNumber !== undefined) out.identityNumber = node.identityNumber;
  return out;
}

function normalizePackage(node: TrendyolShipmentPackageNode): ShipmentPackage {
  const out: ShipmentPackage = {
    id: node.shipmentPackageId !== undefined ? String(node.shipmentPackageId) : '',
    orderNumber: node.orderNumber ?? '',
    status: (node.status as ShipmentPackageStatus) ?? '',
    customer: normalizeCustomer(node),
    orderDate: toIso(node.orderDate) ?? '',
    lastModifiedDate: toIso(node.lastModifiedDate) ?? '',
    currencyCode: node.currencyCode ?? '',
    packageTotalPrice: typeof node.packageTotalPrice === 'number' ? node.packageTotalPrice : 0,
    packageGrossAmount: typeof node.packageGrossAmount === 'number' ? node.packageGrossAmount : 0,
    packageSellerDiscount:
      typeof node.packageSellerDiscount === 'number' ? node.packageSellerDiscount : 0,
    packageTyDiscount: typeof node.packageTyDiscount === 'number' ? node.packageTyDiscount : 0,
    packageTotalDiscount:
      typeof node.packageTotalDiscount === 'number' ? node.packageTotalDiscount : 0,
    lines: (node.lines ?? []).map(normalizeLine),
    packageHistories: (node.packageHistories ?? []).map(normalizeHistory),
    raw: node as Record<string, unknown>,
  };

  if (node.shipmentNumber !== undefined) out.shipmentNumber = String(node.shipmentNumber);
  if (node.originPackageIds !== undefined && node.originPackageIds !== null) {
    out.originPackageIds = node.originPackageIds.map((id) => String(id));
  }
  if (node.warehouseId !== undefined) out.warehouseId = String(node.warehouseId);
  if (node.supplierId !== undefined) out.supplierId = String(node.supplierId);
  if (node.shipmentPackageStatus !== undefined) {
    out.shipmentPackageStatus = node.shipmentPackageStatus as ShipmentPackageStatus;
  }

  const agreed = toIso(node.agreedDeliveryDate);
  if (agreed) out.agreedDeliveryDate = agreed;
  const estStart = toIso(node.estimatedDeliveryStartDate);
  if (estStart) out.estimatedDeliveryStartDate = estStart;
  const estEnd = toIso(node.estimatedDeliveryEndDate);
  if (estEnd) out.estimatedDeliveryEndDate = estEnd;
  const origin = toIso(node.originShipmentDate);
  if (origin) out.originShipmentDate = origin;

  const invoice = normalizeAddress(node.invoiceAddress);
  if (invoice) out.invoiceAddress = invoice;
  const shipment = normalizeAddress(node.shipmentAddress);
  if (shipment) out.shipmentAddress = shipment;
  if (node.deliveryAddressType !== undefined) out.deliveryAddressType = node.deliveryAddressType;

  if (node.cargoTrackingNumber !== undefined) {
    out.cargoTrackingNumber = String(node.cargoTrackingNumber);
  }
  if (node.cargoProviderName !== undefined) out.cargoProviderName = node.cargoProviderName;
  if (node.cargoProviderId !== undefined) out.cargoProviderId = String(node.cargoProviderId);
  if (node.cargoSenderNumber !== undefined) out.cargoSenderNumber = node.cargoSenderNumber;

  if (node.deliveryType !== undefined) out.deliveryType = node.deliveryType;
  if (node.whoPays !== undefined) out.whoPays = node.whoPays;
  if (node.timeSlotId !== undefined) out.timeSlotId = node.timeSlotId;
  if (typeof node.fastDelivery === 'boolean') out.fastDelivery = node.fastDelivery;
  if (node.fastDeliveryType !== undefined) out.fastDeliveryType = node.fastDeliveryType;
  if (typeof node.deliveredByService === 'boolean')
    out.deliveredByService = node.deliveredByService;

  if (typeof node.commercial === 'boolean') out.commercial = node.commercial;
  if (typeof node.micro === 'boolean') out.micro = node.micro;
  if (typeof node.giftBoxRequested === 'boolean') out.giftBoxRequested = node.giftBoxRequested;
  if (typeof node['3pByTrendyol'] === 'boolean') {
    out.threePByTrendyol = node['3pByTrendyol'];
  }
  if (typeof node.containsDangerousProduct === 'boolean') {
    out.containsDangerousProduct = node.containsDangerousProduct;
  }
  if (typeof node.isCod === 'boolean') out.isCod = node.isCod;
  if (typeof node.is4P === 'boolean') out.is4P = node.is4P;

  if (node.invoiceLink !== undefined) out.invoiceLink = node.invoiceLink;
  if (node.createdBy !== undefined) out.createdBy = node.createdBy;

  return out;
}

/**
 * Trendyol order (shipment-package) endpoints.
 *
 * Rate limit (per Trendyol service limits): scheduled to tighten on 2026-05-15;
 * for now we set a generous default that the user can tune via the constructor.
 *
 * Pagination: Trendyol uses page-based pagination here (not nextPageToken).
 * The SDK still exposes `CursorPage<ShipmentPackage>` so the caller can
 * iterate with `paginate()` from `@lonca/core`; the opaque cursor encodes the
 * page index.
 */
export class OrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * List shipment packages for the seller.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const pkg of paginate((p) => client.orders.list({ ...p, status: 'Created' }))) {
   *   console.log(pkg.id, pkg.status, pkg.customer.firstName);
   * }
   * ```
   */
  async list(params: ListOrdersParams = {}): Promise<CursorPage<ShipmentPackage>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    const query: Record<string, string | number | undefined> = { page, size };
    if (params.status) query.status = params.status;
    if (params.orderNumber) query.orderNumber = params.orderNumber;
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();

    const data = await this.transport.request<TrendyolGetOrdersResponse>({
      method: 'GET',
      path: `/integration/order/sellers/${this.sellerId}/orders`,
      query,
      rateLimiter: this.limiter,
    });

    const items = (data.content ?? []).map(normalizePackage);
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    const result: CursorPage<ShipmentPackage> = { items };
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Push a shipment-package status update.
   *
   * Trendyol restricts the seller-side push to two transitions:
   * - `Picking`  — order picked up from the shelf / being prepared
   * - `Invoiced` — invoice issued, ready for cargo handoff
   *
   * Other transitions (`Shipped`, `Delivered`, etc.) are driven by Trendyol
   * or the cargo provider — call `processAlternativeDelivery` or
   * `manualDeliverByPackageId` if you ship outside Trendyol's cargo
   * network.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async updatePackageStatus(
    packageId: string | number,
    input: UpdatePackageStatusInput,
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: this.packagePath(packageId),
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Notify Trendyol that one or more line items cannot be supplied
   * ("Tedarik Edememe Bildirimi"). Marks the listed line IDs as
   * `UnSupplied`. Trendyol cancels those quantities and notifies the
   * customer.
   *
   * `reasonId` is a numeric code Trendyol publishes separately — consult
   * the seller panel or the "Tedarik Edememe" docs for current values.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async cancelPackageItem(
    packageId: string | number,
    input: CancelPackageItemInput,
  ): Promise<void> {
    if (!Array.isArray(input?.lines) || input.lines.length === 0) {
      throw new ValidationError({ message: 'cancelPackageItem: lines must not be empty' });
    }
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/items/unsupplied`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Extend the agreed delivery date for a shipment package by 1, 2, or 3 days.
   * Trendyol enforces the [1, 3] range server-side; the SDK validates client-side
   * to fail fast.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async extendDeliveryDate(packageId: string | number, extendedDayCount: 1 | 2 | 3): Promise<void> {
    if (![1, 2, 3].includes(extendedDayCount)) {
      throw new ValidationError({
        message: `extendDeliveryDate: extendedDayCount must be 1, 2, or 3 (got ${extendedDayCount})`,
      });
    }
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/extended-agreed-delivery-date`,
      body: { extendedDayCount },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Notify Trendyol of an alternative delivery channel — used when the
   * seller is shipping via a non-Trendyol cargo provider. Trendyol then
   * either SMSes the customer the tracking link (when `isPhoneNumber` is
   * `true`) or stores the tracking URL on the package directly.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async processAlternativeDelivery(
    packageId: string | number,
    input: ProcessAlternativeDeliveryInput,
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/alternative-delivery`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  private packagePath(packageId: string | number): string {
    return `/integration/order/sellers/${this.sellerId}/shipment-packages/${encodeURIComponent(String(packageId))}`;
  }
}
