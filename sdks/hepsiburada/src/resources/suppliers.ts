import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CreateListingUpdateRequestInput,
  ListingUpdateRequestDetail,
  ListingUpdateRequestItem,
  ListingUpdateRequestReceipt,
  ListingUpdateRequestSearchInput,
  ListingUpdateRequestSummary,
  OpenPurchaseOrder,
  OpenPurchaseOrderSearchInput,
  SupplierEnvelope,
  SupplierListing,
  SupplierListingSearchInput,
  SupplierSearchResult,
} from '../types/supplier.js';

const SERVICE = 'supplier-api' as const;

/**
 * Hepsiburada Supplier integration (`tedarikci-entegrasyonu`).
 *
 * **Service base URL**: `supplier-api-external[-sit].hepsiburada.com` (per the
 * portal spec — routing through `oms-external` returns 401 because the routes
 * don't exist there; verified on SIT 2026-08-30).
 *
 * Covers purchase-order discovery, inventory search, and the offer
 * (`listingUpdateRequest`) lifecycle for suppliers. Every response arrives in
 * the supplier API's `{ data, message, errorCode }` envelope; the SDK unwraps
 * `data` into the typed result and keeps the untouched body on `raw`.
 *
 * NOTE: A merchant that is not enrolled as a supplier gets a route-level
 * `404` with `errorCode: "E4201"` ("Tedarikçi bulunamadı") — the SIT sandbox
 * merchant behaves this way, and so does a non-enrolled production merchant
 * (verified on prod 2026-08-30). Endpoints typed from the developer-portal spec
 * (`specs/hepsiburada/supplier-api-external.json`).
 */
export class SuppliersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 60, intervalMs: 60_000 });
  }

  /** Search open purchase orders. Resolves to one page of {@link OpenPurchaseOrder} rows. */
  async searchOpenPurchaseOrders(
    input: OpenPurchaseOrderSearchInput,
  ): Promise<SupplierSearchResult<OpenPurchaseOrder>> {
    this.assertInput(input, 'suppliers.searchOpenPurchaseOrders');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/openPurchaseOrders/search`,
      body: input,
      rateLimiter: this.limiter,
    });
    return toSearchResult(data, normalizeOpenPurchaseOrder);
  }

  /** Search the supplier's inventory listings. Resolves to one page of {@link SupplierListing} rows. */
  async searchSupplierListings(
    input: SupplierListingSearchInput,
  ): Promise<SupplierSearchResult<SupplierListing>> {
    this.assertInput(input, 'suppliers.searchSupplierListings');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/supplierlistings/search`,
      body: input,
      rateLimiter: this.limiter,
    });
    return toSearchResult(data, normalizeSupplierListing);
  }

  /**
   * Search the supplier's offers (`listingUpdateRequests`). Resolves to one
   * page of {@link ListingUpdateRequestSummary} rows; fetch a single offer's
   * product lines with `getListingUpdateRequest`.
   */
  async searchListingUpdateRequests(
    input: ListingUpdateRequestSearchInput,
  ): Promise<SupplierSearchResult<ListingUpdateRequestSummary>> {
    this.assertInput(input, 'suppliers.searchListingUpdateRequests');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/listingUpdateRequests/search`,
      body: input,
      rateLimiter: this.limiter,
    });
    return toSearchResult(data, normalizeListingUpdateRequestSummary);
  }

  /** Get a single offer by request id, with its per-product approval statuses. */
  async getListingUpdateRequest(requestId: string): Promise<ListingUpdateRequestDetail> {
    if (!requestId) {
      throw new ValidationError({
        message: 'suppliers.getListingUpdateRequest: requestId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/listingUpdateRequests/${encodeURIComponent(requestId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeListingUpdateRequestDetail(data);
  }

  /** Create a new offer (`listingUpdateRequest`). Resolves to the new offer's `id`. */
  async createListingUpdateRequest(
    input: CreateListingUpdateRequestInput,
  ): Promise<ListingUpdateRequestReceipt> {
    this.assertInput(input, 'suppliers.createListingUpdateRequest');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/suppliers/${this.merchantSegment()}/listingUpdateRequests`,
      body: input,
      rateLimiter: this.limiter,
    });
    return normalizeListingUpdateRequestReceipt(data);
  }

  private merchantSegment(): string {
    return encodeURIComponent(this.transport.merchantId);
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }
}

// ─── Normalizers ───────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
type Kind = 'string' | 'number' | 'boolean' | 'string[]';
/** One wire type per typed field — the mapped type keeps each list in sync with its interface. */
type FieldKinds<T> = { [K in Exclude<keyof T, 'raw'>]-?: Kind };

function asRecord(value: unknown): Raw {
  return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Raw;
}

/** Copy the fields whose wire value has the documented primitive type; everything else stays on `raw`. */
function pickFields<T>(r: Raw, kinds: FieldKinds<T>): Partial<T> {
  const out: Raw = {};
  for (const [key, kind] of Object.entries(kinds) as [string, Kind][]) {
    const value = r[key];
    const matches =
      kind === 'string[]'
        ? Array.isArray(value) && value.every((v) => typeof v === 'string')
        : typeof value === kind;
    if (matches) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Split the supplier envelope `{ data, message, errorCode }`. A body without a
 * `data` key is treated as the payload itself (Hepsiburada's envelopes are not
 * uniform across surfaces); `data: null` yields an empty payload.
 */
function unwrapSupplierEnvelope(body: unknown): { payload: Raw; envelope: SupplierEnvelope } {
  const b = asRecord(body);
  const payload = 'data' in b ? asRecord(b.data) : b;
  const envelope: SupplierEnvelope = { raw: body };
  if (typeof b.message === 'string') envelope.message = b.message;
  if (typeof b.errorCode === 'string') envelope.errorCode = b.errorCode;
  return { payload, envelope };
}

function toSearchResult<T>(body: unknown, mapRow: (row: unknown) => T): SupplierSearchResult<T> {
  const { payload, envelope } = unwrapSupplierEnvelope(body);
  const out: SupplierSearchResult<T> = {
    ...envelope,
    items: Array.isArray(payload.rows) ? payload.rows.map(mapRow) : [],
  };
  if (typeof payload.totalCount === 'number') out.totalCount = payload.totalCount;
  return out;
}

const OPEN_PURCHASE_ORDER_FIELDS: FieldKinds<OpenPurchaseOrder> = {
  purchaseOrderNumber: 'string',
  lineNumber: 'number',
  sku: 'string',
  warehouseCode: 'string',
  warehouseName: 'string',
  createdDate: 'string',
  dueDate: 'string',
  remainingQuantity: 'number',
  receivedQuantity: 'number',
  issuedQuantity: 'number',
  description: 'string',
  currencyCode: 'string',
  purchaseOrderUnitPrice: 'number',
  purchaseOrderTotalPrice: 'number',
  definitionName: 'string',
  brand: 'string',
  vatRate: 'number',
  barcode: 'string[]',
  originalLineQuantity: 'number',
  shipmentListCreatedQuantity: 'number',
  buyingCategoryId: 'string',
  buyingCategoryName: 'string',
  inProgressPurchaseOrdersOperation: 'boolean',
  operationStatus: 'string',
  purchaseOrderType: 'string',
  merchantSku: 'string',
  warehouseGateId: 'string',
  isPostdated: 'boolean',
  isSent: 'boolean',
};

function normalizeOpenPurchaseOrder(row: unknown): OpenPurchaseOrder {
  const r = asRecord(row);
  return { ...pickFields(r, OPEN_PURCHASE_ORDER_FIELDS), raw: r };
}

const SUPPLIER_LISTING_FIELDS: FieldKinds<SupplierListing> = {
  sku: 'string',
  merchantSku: 'string',
  price: 'number',
  currencyCode: 'string',
  lastPurchasePriceUpdateDate: 'string',
  stock: 'number',
  unitPerPackage: 'number',
  status: 'string',
  listingType: 'string',
};

function normalizeSupplierListing(row: unknown): SupplierListing {
  const r = asRecord(row);
  return { ...pickFields(r, SUPPLIER_LISTING_FIELDS), raw: r };
}

const LISTING_UPDATE_REQUEST_SUMMARY_FIELDS: FieldKinds<ListingUpdateRequestSummary> = {
  requestId: 'string',
  createdDateTime: 'string',
  operationSource: 'string',
  rowCount: 'number',
};

function normalizeListingUpdateRequestSummary(row: unknown): ListingUpdateRequestSummary {
  const r = asRecord(row);
  return { ...pickFields(r, LISTING_UPDATE_REQUEST_SUMMARY_FIELDS), raw: r };
}

const LISTING_UPDATE_REQUEST_ITEM_FIELDS: FieldKinds<ListingUpdateRequestItem> = {
  sku: 'string',
  price: 'number',
  priceEffectiveDate: 'string',
  currencyCode: 'string',
  stock: 'number',
  unitPerPackage: 'number',
  priceApprovalStatus: 'string',
  priceRejectionReason: 'string',
  priceEffectiveDateApprovalStatus: 'string',
  priceEffectiveDateRejectionReason: 'string',
  stockApprovalStatus: 'string',
  stockRejectionReason: 'string',
  unitPerPackageApprovalStatus: 'string',
  merchantSku: 'string',
  merchantSkuApprovalStatus: 'string',
  salable: 'boolean',
  salableApprovalStatus: 'string',
  salableRejectionReason: 'string',
};

function normalizeListingUpdateRequestItem(row: unknown): ListingUpdateRequestItem {
  const r = asRecord(row);
  return { ...pickFields(r, LISTING_UPDATE_REQUEST_ITEM_FIELDS), raw: r };
}

function normalizeListingUpdateRequestDetail(body: unknown): ListingUpdateRequestDetail {
  const { payload, envelope } = unwrapSupplierEnvelope(body);
  const out: ListingUpdateRequestDetail = {
    ...envelope,
    requestItems: Array.isArray(payload.requestItems)
      ? payload.requestItems.map(normalizeListingUpdateRequestItem)
      : [],
  };
  if (typeof payload.requestId === 'string') out.requestId = payload.requestId;
  if (typeof payload.createdDateTime === 'string') out.createdDateTime = payload.createdDateTime;
  return out;
}

function normalizeListingUpdateRequestReceipt(body: unknown): ListingUpdateRequestReceipt {
  const { payload, envelope } = unwrapSupplierEnvelope(body);
  const out: ListingUpdateRequestReceipt = { ...envelope };
  if (typeof payload.id === 'string') out.id = payload.id;
  return out;
}
