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
 * NOTE: The exact field set is best-effort; some optional fields may differ
 * once verified against real STAGE responses. Bumped fields land in a follow-up
 * minor release if needed.
 */
export interface SupplierAddress {
  id: string;
  /** Free-form label set by the seller. */
  name?: string;
  /** Primary role declared by Trendyol. */
  addressType: SupplierAddressType;
  isShipmentAddress: boolean;
  isReturningAddress: boolean;
  isInvoiceAddress: boolean;
  isDefault: boolean;
  /** Multi-line address string as registered in the Partner Panel. */
  address?: string;
  city?: string;
  district?: string;
  postCode?: string;
  fullName?: string;
}
