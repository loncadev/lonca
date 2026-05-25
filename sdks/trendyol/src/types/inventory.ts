/**
 * A single price / stock update entry.
 *
 * `barcode` is the only required field. Include any combination of:
 * - `quantity` to update stock (max 20 000 per product)
 * - `salePrice` to update the sale price
 * - `listPrice` to update the list (strikethrough) price
 *
 * `listPrice` must be greater than or equal to `salePrice`.
 */
export interface PriceInventoryUpdate {
  barcode: string;
  quantity?: number;
  salePrice?: number;
  listPrice?: number;
}

/** Response from `updatePriceAndInventory` — poll with `products.getBatchStatus`. */
export interface UpdatePriceInventoryResponse {
  batchRequestId: string;
}
