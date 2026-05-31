/**
 * Hepsiburada Product Update types (`urun-guncelleme-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `urun-guncelleme-entegrasyonu` v1.0.
 * Async upload flow — POST returns a `trackingId` you poll via
 * `getUpdateStatus(trackingId)`.
 */

/** Single update-history row for a specific (merchantId, hbSku) pair. */
export interface ProductUpdateHistoryEntry {
  trackingId?: string;
  status?: string;
  modifiedAt?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Response from `productUpdates.importUpdates()`. */
export interface ProductUpdateReceipt {
  trackingId: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/** Status lookup for a single tracking-id. */
export interface ProductUpdateStatus {
  trackingId?: string;
  status?: string;
  message?: string;
  rows?: Array<Record<string, unknown>>;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/**
 * Body for `productUpdates.importUpdates()` — an array of update rows
 * `{ hbSku, fields: { ... } }`. Hepsiburada's portal documents the exact
 * field set under "Ürün Güncelleme Servisi".
 */
export type ProductUpdateInput = unknown[];
