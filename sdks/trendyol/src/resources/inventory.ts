import { ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { PriceInventoryUpdate, UpdatePriceInventoryResponse } from '../types/inventory.js';

/** Trendyol's hard limit for items per `updatePriceAndInventory` call. */
const MAX_ITEMS_PER_REQUEST = 1000;

interface TrendyolBatchRequestResponse {
  batchRequestId?: string;
}

/**
 * Trendyol stock & price update endpoint (a.k.a. `updatePriceAndInventory`).
 *
 * Rate limit: **none** — Trendyol explicitly lists this endpoint as
 * `NO LIMIT` in its service limits table. The `15-minute duplicate
 * suppression` rule still applies on Trendyol's side, but that's a
 * server-side concern.
 *
 * The endpoint is asynchronous. The response carries a `batchRequestId`
 * you can poll with `client.products.getBatchStatus(batchRequestId)` —
 * Trendyol retains the result for 4 hours.
 */
export class InventoryResource {
  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
  ) {}

  /**
   * Update price and/or stock for one or more SKUs (by barcode).
   *
   * @example
   * ```ts
   * const { batchRequestId } = await client.inventory.update([
   *   { barcode: 'ABC123', quantity: 42, salePrice: 199.9, listPrice: 249.9 },
   *   { barcode: 'XYZ789', quantity: 0 },
   * ]);
   * const status = await client.products.getBatchStatus(batchRequestId);
   * ```
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async update(items: PriceInventoryUpdate[]): Promise<UpdatePriceInventoryResponse> {
    if (items.length === 0) {
      throw new ValidationError({ message: 'updatePriceAndInventory: items must not be empty' });
    }
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      throw new ValidationError({
        message: `updatePriceAndInventory: max ${MAX_ITEMS_PER_REQUEST} items per request, got ${items.length}`,
      });
    }

    const data = await this.transport.request<TrendyolBatchRequestResponse>({
      method: 'POST',
      path: `/integration/inventory/sellers/${this.sellerId}/products/price-and-inventory`,
      body: { items },
    });

    return { batchRequestId: data.batchRequestId ?? '' };
  }
}
