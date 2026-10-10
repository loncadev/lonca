/**
 * The role an address plays in the seller's logistics flow.
 *
 * Trendyol allows a single physical address to play more than one role
 * (e.g., shipment + invoice), so always check the boolean flags rather than
 * relying solely on `addressType`.
 */
export type SupplierAddressType = 'SHIPMENT' | 'RETURNING' | 'INVOICE' | 'WAREHOUSE';

/**
 * A supplier address registered in the Trendyol Partner Panel.
 *
 * Used by `createProduct V2` for `shipmentAddressId` / `returningAddressId`.
 *
 * Field set checked against the docs and the prod wire (2026-10-10).
 */
export interface SupplierAddress {
  id: string;
  /**
   * @deprecated Trendyol's address rows carry no name or label — neither the docs nor the prod
   * wire (2026-10-10) have one — so this is always `undefined`. Identify an address by `id`,
   * `addressType` and the role flags; use `fullAddress` / `address` for its text.
   */
  name?: string;
  /**
   * Primary role declared by Trendyol. The docs spell it `Shipment` / `Invoice` / `Returning`;
   * the SDK upper-cases it.
   */
  addressType: SupplierAddressType;
  isShipmentAddress: boolean;
  isReturningAddress: boolean;
  isInvoiceAddress: boolean;
  isDefault: boolean;
  /** Street address as registered in the Partner Panel. */
  address?: string;
  /** The complete address text (Trendyol's `fullAddress`). */
  fullAddress?: string;
  /** Country name as Trendyol sends it. */
  country?: string;
  city?: string;
  /** Trendyol's city code (stringified from the wire number). */
  cityCode?: string;
  district?: string;
  /** Trendyol's district id (stringified from the wire number). */
  districtId?: string;
  postCode?: string;
  /**
   * @deprecated Trendyol's address rows carry no `fullName` — neither the docs nor the prod wire
   * (2026-10-10) have one — so this is always `undefined`. Use `fullAddress` for the complete
   * address text.
   */
  fullName?: string;
}
