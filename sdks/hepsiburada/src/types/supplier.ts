/**
 * Hepsiburada Supplier integration types (`tedarikci-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `tedarikci-entegrasyonu` v1.0
 * (`specs/hepsiburada/supplier-api-external.json`).
 *
 * Five endpoints — open purchase orders search, supplier listings search,
 * listing-update-requests CRUD (search list / get / create).
 *
 * All search endpoints are POST with `{ pageNumber, pageSize, … }` style
 * bodies; the SDK accepts loose `Record<string, unknown>` payloads — see
 * the portal docs for the documented field set per request.
 *
 * Every response is wrapped in the supplier API's own envelope
 * `{ data, message, errorCode }`. The SDK unwraps `data` into the typed
 * result and keeps `message` / `errorCode` next to it; the untouched body
 * (envelope included) is always on `raw`.
 */

/** Body for `suppliers.searchOpenPurchaseOrders()`. */
export type OpenPurchaseOrderSearchInput = Record<string, unknown>;

/** Body for `suppliers.searchSupplierListings()`. */
export type SupplierListingSearchInput = Record<string, unknown>;

/** Body for `suppliers.searchListingUpdateRequests()`. */
export type ListingUpdateRequestSearchInput = Record<string, unknown>;

/** Body for `suppliers.createListingUpdateRequest()`. */
export type CreateListingUpdateRequestInput = Record<string, unknown>;

/** `operationStatus` of an open purchase-order line (spec enum `OpenPurchaseOrderResponseStatus`). */
export type OpenPurchaseOrderStatus = 'Actionable' | 'Pending' | 'DraftShipment';

/** Supplier listing status (spec enum `ListingStatus`). */
export type SupplierListingStatus = 'Suspended' | 'Active' | 'Inactive';

/** Supplier listing type (spec enum `ListingType`). */
export type SupplierListingType = 'Normal' | 'DropShipping' | 'Consignee';

/** Per-field approval status on an offer item (spec enum `ApprovalStatus`). */
export type SupplierApprovalStatus = 'Processing' | 'Approved' | 'Rejected' | 'Accepted';

/**
 * Fields shared by every supplier-API result: the `{ data, message, errorCode }`
 * envelope minus `data` (which is unwrapped into the typed result), plus the
 * untouched body.
 */
export interface SupplierEnvelope {
  /** Server message — `null` on the wire for a successful call, so usually absent. */
  message?: string;
  /** Server error code — `null` on the wire for a successful call, so usually absent. */
  errorCode?: string;
  /** Untouched parsed response body (envelope included). */
  raw: unknown;
}

/**
 * One page of a supplier search — `data: { totalCount, rows }` on the wire.
 * Not an `OffsetPage`: the API pages by `pageNumber` / `pageSize` in the
 * request body and echoes neither back, so `limit` / `offset` are unknowable
 * from the response.
 */
export interface SupplierSearchResult<T> extends SupplierEnvelope {
  /** Total matching rows across all pages. */
  totalCount?: number;
  /** Rows on this page (`data.rows`; empty when the API sends `null`). */
  items: T[];
}

/** One open purchase-order line — `OpenPurchaseOrderResponseItem` in the spec. */
export interface OpenPurchaseOrder {
  /** Purchase order (SAS) number. */
  purchaseOrderNumber?: string;
  /** Line number within the purchase order. */
  lineNumber?: number;
  sku?: string;
  warehouseCode?: string;
  warehouseName?: string;
  /** Purchase-order creation date (`yyyy-MM-dd`). */
  createdDate?: string;
  /** Latest date the goods are expected at the warehouse. */
  dueDate?: string;
  /** Maximum quantity still to be shipped. */
  remainingQuantity?: number;
  /** Quantity received at the warehouse. */
  receivedQuantity?: number;
  /** Quantity issued from the warehouse. */
  issuedQuantity?: number;
  /** Product description. */
  description?: string;
  /** Currency of the unit / total price (`TRY`, `USD`, `EUR`). */
  currencyCode?: string;
  purchaseOrderUnitPrice?: number;
  purchaseOrderTotalPrice?: number;
  /** Product type name. */
  definitionName?: string;
  brand?: string;
  vatRate?: number;
  /** Product barcodes. */
  barcode?: string[];
  /** Quantity the purchase order was opened with. */
  originalLineQuantity?: number;
  /** Quantity already placed on a shipment list. */
  shipmentListCreatedQuantity?: number;
  buyingCategoryId?: string;
  buyingCategoryName?: string;
  /** Whether a purchase-order operation is still in progress. */
  inProgressPurchaseOrdersOperation?: boolean;
  /** Line status; strings outside the documented union pass through. */
  operationStatus?: OpenPurchaseOrderStatus | (string & {});
  /** `ConsignmentPurchaseOrder`, `StandardPurchaseOrder`, … */
  purchaseOrderType?: string;
  /** Supplier's own stock code. */
  merchantSku?: string;
  /** Warehouse gate id (UUID). */
  warehouseGateId?: string;
  /** Whether the due date was postponed before. */
  isPostdated?: boolean;
  /** Whether the line was marked as sent. */
  isSent?: boolean;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One supplier inventory row — `SupplierListingItem` in the spec. */
export interface SupplierListing {
  sku?: string;
  /** Supplier's own stock code. */
  merchantSku?: string;
  price?: number;
  /** `TRY`, `USD`, `EUR`. */
  currencyCode?: string;
  /** Last purchase-price change (`yyyy-MM-dd`). */
  lastPurchasePriceUpdateDate?: string;
  stock?: number;
  /** Units per package (case size). */
  unitPerPackage?: number;
  /** Listing status; strings outside the documented union pass through. */
  status?: SupplierListingStatus | (string & {});
  /** Listing type; strings outside the documented union pass through. */
  listingType?: SupplierListingType | (string & {});
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One offer in a `searchListingUpdateRequests` page — `ListingUpdateRequestSummaryResponse` in the spec. */
export interface ListingUpdateRequestSummary {
  /** Offer id (UUID). */
  requestId?: string;
  /** Offer date (`yyyy-MM-dd`). */
  createdDateTime?: string;
  /** Where the offer was made: `Api` or `Portal`. */
  operationSource?: string;
  /** Number of products in the offer. */
  rowCount?: number;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One product line of an offer — `ListingUpdateRequestItemResponse` in the spec. */
export interface ListingUpdateRequestItem {
  sku?: string;
  /** Offered price. */
  price?: number;
  /** Date the offered price takes effect. */
  priceEffectiveDate?: string;
  /** `TRY`, `USD`, `EUR`, … (spec enum `CurrencyCode`). */
  currencyCode?: string;
  /** Offered stock. */
  stock?: number;
  /** Offered units per package. */
  unitPerPackage?: number;
  priceApprovalStatus?: SupplierApprovalStatus | (string & {});
  priceRejectionReason?: string;
  priceEffectiveDateApprovalStatus?: SupplierApprovalStatus | (string & {});
  priceEffectiveDateRejectionReason?: string;
  stockApprovalStatus?: SupplierApprovalStatus | (string & {});
  stockRejectionReason?: string;
  unitPerPackageApprovalStatus?: SupplierApprovalStatus | (string & {});
  /** Offered supplier stock code. */
  merchantSku?: string;
  merchantSkuApprovalStatus?: SupplierApprovalStatus | (string & {});
  /** Offered salable flag. */
  salable?: boolean;
  salableApprovalStatus?: SupplierApprovalStatus | (string & {});
  salableRejectionReason?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Result of `suppliers.getListingUpdateRequest()` — `ListingUpdateRequestDetailResponse` in the spec. */
export interface ListingUpdateRequestDetail extends SupplierEnvelope {
  /** Offer id (UUID). */
  requestId?: string;
  /** Offer date (`yyyy-MM-dd`). */
  createdDateTime?: string;
  /** Product lines of the offer (`data.requestItems`; empty when the API sends `null`). */
  requestItems: ListingUpdateRequestItem[];
}

/** Receipt returned by `suppliers.createListingUpdateRequest()` — `GuidIdResult` in the spec. */
export interface ListingUpdateRequestReceipt extends SupplierEnvelope {
  /** Id of the offer that was created (UUID). */
  id?: string;
}
