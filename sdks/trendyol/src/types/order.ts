/**
 * Trendyol shipment-package status.
 *
 * Trendyol uses ~13 distinct values (Created, Picking, Invoiced, Shipped,
 * Cancelled, Delivered, UnDelivered, Returned, UnSupplied, Awaiting,
 * UnPacked, AtCollectionPoint, Verified). Typed as a union with an open
 * escape so unknown values still type-check.
 */
export type ShipmentPackageStatus =
  | 'Created'
  | 'Picking'
  | 'Invoiced'
  | 'Shipped'
  | 'Cancelled'
  | 'Delivered'
  | 'UnDelivered'
  | 'Returned'
  | 'UnSupplied'
  | 'Awaiting'
  | 'UnPacked'
  | 'AtCollectionPoint'
  | 'Verified'
  | (string & {});

export interface OrderAddressLines {
  addressLine1?: string;
  addressLine2?: string;
}

/**
 * A customer or invoice/shipment address returned alongside a shipment package.
 * Field set is conservative — Trendyol returns many optional locality fields
 * and we surface them as-is.
 */
export interface OrderAddress {
  id?: string;
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
  addressLines?: OrderAddressLines;
}

/** Customer details on a shipment package (a subset of what Trendyol exposes). */
export interface OrderCustomer {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
  taxNumber?: string;
  identityNumber?: string;
}

export interface OrderLineDiscountDetail {
  lineItemPrice?: number;
  lineItemSellerDiscount?: number;
  lineItemTyDiscount?: number;
}

/** A single item line inside a shipment package. */
export interface OrderLine {
  /** Trendyol's `lineId`. */
  id: string;
  quantity: number;
  productName: string;
  barcode: string;
  productSize?: string;
  productColor?: string;
  stockCode?: string;
  contentId?: string;
  sellerId?: string;
  productCategoryId?: string;
  salesCampaignId?: string;

  currencyCode?: string;
  lineUnitPrice: number;
  lineGrossAmount: number;
  lineSellerDiscount?: number;
  lineTyDiscount?: number;
  lineTotalDiscount?: number;
  vatRate?: number;
  commission?: number;

  orderLineItemStatusName?: string;
  businessUnit?: string;
  fastDeliveryOptions?: unknown[];
  discountDetails?: OrderLineDiscountDetail[];

  /** Untouched raw line response. */
  raw: Record<string, unknown>;
}

/** A status transition entry in `packageHistories`. */
export interface PackageHistoryEntry {
  status?: ShipmentPackageStatus;
  /** ISO 8601 UTC string (converted from Trendyol's ms-epoch). */
  createdAt?: string;
  raw: Record<string, unknown>;
}

/**
 * A Trendyol order — Trendyol models orders as "shipment packages". A single
 * customer order may produce multiple shipment packages (one per warehouse,
 * one per cancellation, etc.).
 *
 * `id` is the `shipmentPackageId` (the operational unit); `orderNumber`
 * groups packages that came from the same customer order.
 */
export interface ShipmentPackage {
  // ─── IDs ───
  /** `shipmentPackageId` — the operational identifier for this package. */
  id: string;
  orderNumber: string;
  shipmentNumber?: string;
  originPackageIds?: string[] | null;
  warehouseId?: string;
  supplierId?: string;

  // ─── Status ───
  status: ShipmentPackageStatus;
  /** Usually identical to `status`; surfaced for completeness. */
  shipmentPackageStatus?: ShipmentPackageStatus;

  // ─── Customer ───
  customer: OrderCustomer;

  // ─── Dates (ISO 8601 UTC) ───
  orderDate: string;
  lastModifiedDate: string;
  agreedDeliveryDate?: string;
  estimatedDeliveryStartDate?: string;
  estimatedDeliveryEndDate?: string;
  originShipmentDate?: string;

  // ─── Pricing ───
  currencyCode: string;
  packageTotalPrice: number;
  packageGrossAmount: number;
  packageSellerDiscount: number;
  packageTyDiscount: number;
  packageTotalDiscount: number;

  // ─── Addresses ───
  invoiceAddress?: OrderAddress;
  shipmentAddress?: OrderAddress;
  deliveryAddressType?: string;

  // ─── Cargo ───
  cargoTrackingNumber?: string;
  cargoProviderName?: string;
  cargoProviderId?: string;
  cargoSenderNumber?: string;

  // ─── Delivery ───
  deliveryType?: string;
  whoPays?: number;
  timeSlotId?: number;
  fastDelivery?: boolean;
  fastDeliveryType?: string;
  deliveredByService?: boolean;

  // ─── Flags ───
  commercial?: boolean;
  micro?: boolean;
  giftBoxRequested?: boolean;
  /** Renamed from Trendyol's wire field `3pByTrendyol` (identifier cannot start with a digit). */
  threePByTrendyol?: boolean;
  containsDangerousProduct?: boolean;
  isCod?: boolean;
  is4P?: boolean;

  // ─── Misc ───
  invoiceLink?: string;
  createdBy?: string;

  // ─── Nested ───
  lines: OrderLine[];
  packageHistories: PackageHistoryEntry[];

  /** Untouched raw response for fields not modeled yet. */
  raw: Record<string, unknown>;
}
