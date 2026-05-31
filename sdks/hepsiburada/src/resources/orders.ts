import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CancelLineItemInput,
  CargoCompanyOption,
  ChangeCargoCompanyInput,
  CreatePackagesInput,
  InvoiceLinkInput,
  LaborCostInput,
  ListOrdersParams,
  ListPackagesParams,
  Order,
  OrdersPage,
  PackageLabel,
  PackageStatusInput,
  ParcelInfoInput,
  ShippingPackage,
  SplitPackageInput,
  WarehouseInput,
} from '../types/order.js';

const SERVICE = 'oms' as const;

/**
 * Hepsiburada Order Management (`siparis-olusturma-entegrasyonu` +
 * `oms-fulfilment-entegrasyonu` + `muhasebe-entegrasyonu` performance feed).
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`.
 *
 * Covers the full 28-endpoint OMS surface — status-bucketed list queries,
 * single-order / single-package detail, package status transitions
 * (deliver / intransit / undeliver), line-item actions (cancel / cargo /
 * labor cost), and packaging mutations (create / split / unpack).
 *
 * Most list endpoints return `{ totalCount, items[] }`; the unfiltered
 * `/packages` list returns a raw array (no envelope) — both are normalized.
 */
export class OrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  // ─── Order list endpoints ────────────────────────────────────────────────

  /** List orders whose payment is complete (status: order received). */
  async list(params: ListOrdersParams = {}): Promise<OrdersPage> {
    return this.getOrdersPage(`/orders/merchantId/${this.merchantSegment()}`, params);
  }

  /** List cancelled orders. */
  async listCancelled(params: ListOrdersParams = {}): Promise<OrdersPage> {
    return this.getOrdersPage(`/orders/merchantId/${this.merchantSegment()}/cancelled`, params);
  }

  /** List orders awaiting payment. */
  async listPaymentAwaiting(params: ListOrdersParams = {}): Promise<OrdersPage> {
    return this.getOrdersPage(
      `/orders/merchantId/${this.merchantSegment()}/paymentawaiting`,
      params,
    );
  }

  /**
   * Get full detail for a single order by order number.
   *
   * @throws {ValidationError} when `orderNumber` is missing.
   */
  async getByOrderNumber(orderNumber: string): Promise<Order> {
    if (!orderNumber) {
      throw new ValidationError({ message: 'orders.getByOrderNumber: orderNumber is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/orders/merchantId/${this.merchantSegment()}/ordernumber/${encodeURIComponent(orderNumber)}`,
      rateLimiter: this.limiter,
    });
    return normalizeOrder(data);
  }

  // ─── Package list endpoints ──────────────────────────────────────────────

  /**
   * List shipping packages for the merchant. Returns a **raw array** (no
   * `totalCount` envelope on this specific endpoint).
   */
  async listPackages(params: ListPackagesParams = {}): Promise<ShippingPackage[]> {
    return this.getPackagesArray(`/packages/merchantId/${this.merchantSegment()}`, params);
  }

  /** List packages already shipped (cargo handover complete). */
  async listShippedPackages(params: ListPackagesParams = {}): Promise<OrdersPage<ShippingPackage>> {
    return this.getPackagesPage(`/packages/merchantId/${this.merchantSegment()}/shipped`, params);
  }

  /** List packages already delivered to the buyer. */
  async listDeliveredPackages(
    params: ListPackagesParams = {},
  ): Promise<OrdersPage<ShippingPackage>> {
    return this.getPackagesPage(`/packages/merchantId/${this.merchantSegment()}/delivered`, params);
  }

  /** List packages that failed delivery. */
  async listUndeliveredPackages(
    params: ListPackagesParams = {},
  ): Promise<OrdersPage<ShippingPackage>> {
    return this.getPackagesPage(
      `/packages/merchantId/${this.merchantSegment()}/undelivered`,
      params,
    );
  }

  /** List packages that were unpacked after being created. */
  async listUnpackedPackages(
    params: ListPackagesParams = {},
  ): Promise<OrdersPage<ShippingPackage>> {
    return this.getPackagesPage(
      `/packages/merchantId/${this.merchantSegment()}/status/unpacked`,
      params,
    );
  }

  /** List shipped packages still missing an uploaded invoice. */
  async listMissingInvoicePackages(
    params: ListPackagesParams = {},
  ): Promise<OrdersPage<ShippingPackage>> {
    return this.getPackagesPage(
      `/packages/merchantId/${this.merchantSegment()}/missing-invoice`,
      params,
    );
  }

  /**
   * Get cargo detail for a single package by package number.
   *
   * @throws {ValidationError} when `packageNumber` is missing.
   */
  async getPackage(packageNumber: string): Promise<ShippingPackage> {
    if (!packageNumber) {
      throw new ValidationError({ message: 'orders.getPackage: packageNumber is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}`,
      rateLimiter: this.limiter,
    });
    return normalizePackage(data);
  }

  /**
   * Get the shared label (barcode / PDF) for a package.
   *
   * @throws {ValidationError} when `packageNumber` is missing.
   */
  async getPackageLabel(packageNumber: string): Promise<PackageLabel> {
    if (!packageNumber) {
      throw new ValidationError({ message: 'orders.getPackageLabel: packageNumber is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/labels`,
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const out: PackageLabel = { raw: obj };
    if (typeof obj.url === 'string') out.url = obj.url;
    if (typeof obj.base64 === 'string') out.base64 = obj.base64;
    if (typeof obj.format === 'string') out.format = obj.format;
    return out;
  }

  // ─── Cargo company change discovery ──────────────────────────────────────

  /**
   * List cargo firms a line item (still un-packaged) can be moved to.
   *
   * @throws {ValidationError} when `orderLineId` is missing.
   */
  async getChangeableCargoCompaniesForLineItem(orderLineId: string): Promise<CargoCompanyOption[]> {
    if (!orderLineId) {
      throw new ValidationError({
        message: 'orders.getChangeableCargoCompaniesForLineItem: orderLineId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/delivery/changeablecargocompanies/merchantId/${this.merchantSegment()}/orderlineid/${encodeURIComponent(orderLineId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeCargoCompanyOptions(data);
  }

  /**
   * List cargo firms a packaged shipment can be moved to.
   *
   * @throws {ValidationError} when `packageNumber` is missing.
   */
  async getChangeableCargoCompaniesForPackage(
    packageNumber: string,
  ): Promise<CargoCompanyOption[]> {
    if (!packageNumber) {
      throw new ValidationError({
        message: 'orders.getChangeableCargoCompaniesForPackage: packageNumber is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/changablecargocompanies`,
      rateLimiter: this.limiter,
    });
    return normalizeCargoCompanyOptions(data);
  }

  // ─── Line item discovery ─────────────────────────────────────────────────

  /**
   * List line items that can be packaged together with the given line item.
   *
   * @throws {ValidationError} when `lineItemId` is missing.
   */
  async getPackageableLineItems(lineItemId: string): Promise<unknown[]> {
    if (!lineItemId) {
      throw new ValidationError({
        message: 'orders.getPackageableLineItems: lineItemId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/lineitems/merchantId/${this.merchantSegment()}/packageablewith/lineitemid/${encodeURIComponent(lineItemId)}`,
      rateLimiter: this.limiter,
    });
    return Array.isArray(data) ? data : [];
  }

  // ─── Package mutations ───────────────────────────────────────────────────

  /**
   * Package one or more line items into a new shipping package. Hepsiburada's
   * portal documents the exact body shape under `Kalem veya Kalemleri
   * Paketleme`.
   */
  async createPackages(input: CreatePackagesInput): Promise<unknown> {
    this.assertInput(input, 'orders.createPackages');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Split an existing package into two. */
  async splitPackage(packageNumber: string, input: SplitPackageInput): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({ message: 'orders.splitPackage: packageNumber is required' });
    }
    this.assertInput(input, 'orders.splitPackage');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/split`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Unpack an existing package (returns its line items to the un-packaged pool). */
  async unpackPackage(
    packageNumber: string,
    input: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({ message: 'orders.unpackPackage: packageNumber is required' });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/unpack`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  // ─── Package status transitions ──────────────────────────────────────────

  /** Mark a package as in transit (handed to the cargo firm). */
  async markPackageInTransit(
    packageNumber: string,
    input: PackageStatusInput = {},
  ): Promise<unknown> {
    return this.packageStatusAction(packageNumber, 'intransit', input, 'markPackageInTransit');
  }

  /** Mark a package as delivered. */
  async markPackageDelivered(
    packageNumber: string,
    input: PackageStatusInput = {},
  ): Promise<unknown> {
    return this.packageStatusAction(packageNumber, 'deliver', input, 'markPackageDelivered');
  }

  /** Mark a package as undelivered (failed delivery). */
  async markPackageUndelivered(
    packageNumber: string,
    input: PackageStatusInput = {},
  ): Promise<unknown> {
    return this.packageStatusAction(packageNumber, 'undeliver', input, 'markPackageUndelivered');
  }

  // ─── Line item mutations ─────────────────────────────────────────────────

  /** Cancel a single line item before it has been packaged. */
  async cancelLineItem(lineId: string, input: CancelLineItemInput): Promise<unknown> {
    if (!lineId) {
      throw new ValidationError({ message: 'orders.cancelLineItem: lineId is required' });
    }
    this.assertInput(input, 'orders.cancelLineItem');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/lineitems/merchantId/${this.merchantSegment()}/id/${encodeURIComponent(lineId)}/cancelbymerchant`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Change the cargo company on a line item before it has been packaged. */
  async updateLineItemCargoCompany(
    orderLineId: string,
    input: ChangeCargoCompanyInput,
  ): Promise<unknown> {
    if (!orderLineId) {
      throw new ValidationError({
        message: 'orders.updateLineItemCargoCompany: orderLineId is required',
      });
    }
    this.assertInput(input, 'orders.updateLineItemCargoCompany');
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/lineitems/merchantId/${this.merchantSegment()}/orderlineid/${encodeURIComponent(orderLineId)}/cargocompany`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Update the labor-cost field on a line item. */
  async updateLineItemLaborCost(orderLineId: string, input: LaborCostInput): Promise<unknown> {
    if (!orderLineId) {
      throw new ValidationError({
        message: 'orders.updateLineItemLaborCost: orderLineId is required',
      });
    }
    this.assertInput(input, 'orders.updateLineItemLaborCost');
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/lineitems/merchantId/${this.merchantSegment()}/orderlineid/${encodeURIComponent(orderLineId)}/laborcost`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  // ─── Package field updates ───────────────────────────────────────────────

  /** Change the cargo company on a packaged shipment. */
  async updatePackageCargoCompany(
    packageNumber: string,
    input: ChangeCargoCompanyInput,
  ): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({
        message: 'orders.updatePackageCargoCompany: packageNumber is required',
      });
    }
    this.assertInput(input, 'orders.updatePackageCargoCompany');
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/changecargocompany`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Attach an invoice URL / number to a shipped package. */
  async sendInvoiceLink(packageNumber: string, input: InvoiceLinkInput): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({ message: 'orders.sendInvoiceLink: packageNumber is required' });
    }
    this.assertInput(input, 'orders.sendInvoiceLink');
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/invoice`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Update parcel dimensions / `desi` info on a package. */
  async updateParcelInfo(packageNumber: string, input: ParcelInfoInput): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({ message: 'orders.updateParcelInfo: packageNumber is required' });
    }
    this.assertInput(input, 'orders.updateParcelInfo');
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/parcel-info`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Update the source warehouse for a package. */
  async updatePackageWarehouse(packageNumber: string, input: WarehouseInput): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({
        message: 'orders.updatePackageWarehouse: packageNumber is required',
      });
    }
    this.assertInput(input, 'orders.updatePackageWarehouse');
    return this.transport.request<unknown>({
      method: 'PUT',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/warehouse`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private merchantSegment(): string {
    return encodeURIComponent(this.transport.merchantId);
  }

  private async getOrdersPage(path: string, params: ListOrdersParams): Promise<OrdersPage> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path,
      query: this.listQuery(params),
      rateLimiter: this.limiter,
    });
    return normalizeOrdersPage(data);
  }

  private async getPackagesPage(
    path: string,
    params: ListPackagesParams,
  ): Promise<OrdersPage<ShippingPackage>> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path,
      query: this.listQuery(params),
      rateLimiter: this.limiter,
    });
    return normalizePackagesPage(data);
  }

  private async getPackagesArray(
    path: string,
    params: ListPackagesParams,
  ): Promise<ShippingPackage[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path,
      query: this.listQuery(params),
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data) ? data : [];
    return rows.map(normalizePackage);
  }

  private listQuery(
    params: ListOrdersParams,
  ): Record<string, string | number | boolean | undefined> {
    return {
      offset: params.offset,
      limit: params.limit,
      status: params.status,
      beginDate: params.beginDate,
      endDate: params.endDate,
    };
  }

  private async packageStatusAction(
    packageNumber: string,
    action: 'deliver' | 'intransit' | 'undeliver',
    input: PackageStatusInput,
    methodLabel: string,
  ): Promise<unknown> {
    if (!packageNumber) {
      throw new ValidationError({ message: `orders.${methodLabel}: packageNumber is required` });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/packages/merchantId/${this.merchantSegment()}/packagenumber/${encodeURIComponent(packageNumber)}/${action}`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }
}

// ─── Normalizers ───────────────────────────────────────────────────────────

function normalizeOrdersPage(data: unknown): OrdersPage {
  if (!data || typeof data !== 'object') {
    return { totalCount: 0, limit: 0, offset: 0, pageCount: 0, items: [] };
  }
  const obj = data as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items.map(normalizeOrder) : [];
  return {
    totalCount: Number(obj.totalCount ?? 0),
    limit: Number(obj.limit ?? 0),
    offset: Number(obj.offset ?? 0),
    pageCount: Number(obj.pageCount ?? 0),
    items,
  };
}

function normalizePackagesPage(data: unknown): OrdersPage<ShippingPackage> {
  if (!data || typeof data !== 'object') {
    return { totalCount: 0, limit: 0, offset: 0, pageCount: 0, items: [] };
  }
  const obj = data as Record<string, unknown>;
  const items = Array.isArray(obj.items) ? obj.items.map(normalizePackage) : [];
  return {
    totalCount: Number(obj.totalCount ?? 0),
    limit: Number(obj.limit ?? 0),
    offset: Number(obj.offset ?? 0),
    pageCount: Number(obj.pageCount ?? 0),
    items,
  };
}

function normalizeOrder(row: unknown): Order {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: Order = { raw: r };
  if (typeof r.orderNumber === 'string') out.orderNumber = r.orderNumber;
  if (typeof r.externalOrderNumber === 'string') out.externalOrderNumber = r.externalOrderNumber;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.createdDate === 'string') out.createdDate = r.createdDate;
  if (typeof r.modifiedDate === 'string') out.modifiedDate = r.modifiedDate;
  if (r.total !== undefined && (typeof r.total === 'number' || typeof r.total === 'string')) {
    out.total = r.total;
  }
  return out;
}

function normalizePackage(row: unknown): ShippingPackage {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: ShippingPackage = { raw: r };
  if (typeof r.packageNumber === 'string') out.packageNumber = r.packageNumber;
  if (typeof r.orderNumber === 'string') out.orderNumber = r.orderNumber;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.cargoCompany === 'string') out.cargoCompany = r.cargoCompany;
  if (typeof r.trackingNumber === 'string') out.trackingNumber = r.trackingNumber;
  if (typeof r.createdDate === 'string') out.createdDate = r.createdDate;
  return out;
}

function normalizeCargoCompanyOptions(data: unknown): CargoCompanyOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown[] })?.items)
      ? (data as { items: unknown[] }).items
      : Array.isArray((data as { data?: unknown[] })?.data)
        ? (data as { data: unknown[] }).data
        : [];
  return rows.map((r) => {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const out: CargoCompanyOption = { raw: row };
    if (typeof row.code === 'string') out.code = row.code;
    if (typeof row.name === 'string') out.name = row.name;
    return out;
  });
}
