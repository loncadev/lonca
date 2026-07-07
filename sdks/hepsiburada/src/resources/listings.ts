import { TokenBucketRateLimiter, ValidationError, type OffsetPage } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  AdditionalInfoUploadItem,
  BulkUnlockInput,
  BuyboxOrderRow,
  CommissionRow,
  InventoryUploadItem,
  ListListingsParams,
  Listing,
  PriceUploadItem,
  PriceUploadResult,
  ShippingInfoUploadItem,
  StockUploadItem,
  UpdateListingInput,
  UploadError,
  UploadReceipt,
  UploadResult,
} from '../types/listing.js';

const SERVICE = 'listing' as const;

/** Hepsiburada caps bulk uploads at ~1000 items per call. */
const MAX_BULK_ITEMS = 1000;

interface WirePage {
  listings?: WireListing[];
  totalCount?: number;
  limit?: number;
  offset?: number;
}

interface WireListing {
  listingId: string;
  uniqueIdentifier?: string;
  hepsiburadaSku?: string;
  merchantSku?: string;
  price: number;
  availableStock: number;
  dispatchTime: number;
  cargoCompany1?: string;
  cargoCompany2?: string;
  cargoCompany3?: string;
  shippingAddressLabel?: string;
  shippingProfileName?: string;
  claimAddressLabel?: string;
  maximumPurchasableQuantity: number;
  minimumPurchasableQuantity: number;
  pricings?: Array<{
    finalPrice: number;
    startDate?: string;
    endDate?: string;
    debtors?: string[];
  }>;
  isSalable: boolean;
  customizableProperties?: Array<{
    displayName?: string;
    displayLength: number;
    displayDescription?: string;
  }>;
  deactivationReasons?: string[];
  isSuspended: boolean;
  isLocked: boolean;
  lockReasons?: string[];
  isFrozen: boolean;
  freezeReasons?: string[];
  availableWarehouses?: string[];
  isFulfilledByHB: boolean;
  priceIncreaseDisabled: boolean;
  priceDecreaseDisabled: boolean;
  stockDecreaseDisabled: boolean;
  skuAfterSuspension?: string;
  productId?: string;
  hasVariant: boolean;
  [key: string]: unknown;
}

function normalizeListing(node: WireListing): Listing {
  // Listing shape is 1:1 with the wire today — keep the typed copy explicit
  // so future field changes show up here, not in an `as unknown` cast.
  const listing = { ...node } as Listing;
  listing.updatedAt = extractUpdatedAt(node);
  return listing;
}

/** Best-effort last-update timestamp from a listing row; `null` when absent. */
function extractUpdatedAt(node: Record<string, unknown>): string | null {
  for (const key of ['updatedAt', 'lastUpdateDate', 'lastModifiedDate', 'modifiedDate']) {
    const value = node[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

interface WireUploadResult {
  id?: string;
  status?: string;
  createdAt?: string;
  total?: number;
  errors?: Array<{
    elementNo?: number;
    hepsiburadaSku?: string;
    merchantSku?: string;
    errors?: string[];
    [key: string]: unknown;
  }>;
  priceValidations?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function normalizeUploadError(row: NonNullable<WireUploadResult['errors']>[number]): UploadError {
  const out: UploadError = { raw: row as Record<string, unknown> };
  if (row.elementNo !== undefined) out.elementNo = row.elementNo;
  if (row.hepsiburadaSku !== undefined) out.hepsiburadaSku = row.hepsiburadaSku;
  if (row.merchantSku !== undefined) out.merchantSku = row.merchantSku;
  if (row.errors !== undefined) out.errors = row.errors;
  return out;
}

function normalizeUploadResult(data: WireUploadResult): UploadResult {
  const errors = (data.errors ?? []).map(normalizeUploadError);
  return {
    id: data.id ?? '',
    status: data.status as UploadResult['status'],
    createdAt: data.createdAt,
    total: typeof data.total === 'number' ? data.total : 0,
    errors,
  };
}

/**
 * Hepsiburada listings / stock / price / shipping / additional-info endpoints.
 *
 * **Service base URL**: `listing-external[-sit].hepsiburada.com`.
 *
 * Async upload pattern (mirrors Trendyol's batch model): every POST upload
 * endpoint returns `{ id }` — poll the matching `get*Upload(id)` to read the
 * outcome (status + per-item errors). Hepsiburada retains upload results for
 * **24+ hours**.
 *
 * Rate limit: Hepsiburada doesn't publish a per-endpoint limit on this surface;
 * the SDK provisions a generous 600 req/min token bucket that you can override.
 */
export class ListingsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 600, intervalMs: 60_000 });
  }

  // ─── Listings read ────────────────────────────────────────────────────

  /**
   * List the merchant's listings. Pagination is mandatory — pass `offset`
   * and `limit`.
   *
   * @throws {ValidationError} when `limit < 1` or `offset < 0`.
   */
  async list(params: ListListingsParams): Promise<OffsetPage<Listing>> {
    if (!params || typeof params.offset !== 'number' || params.offset < 0) {
      throw new ValidationError({ message: 'listings.list: offset must be ≥ 0' });
    }
    if (typeof params.limit !== 'number' || params.limit < 1) {
      throw new ValidationError({ message: 'listings.list: limit must be ≥ 1' });
    }

    const query: Record<string, string | number | boolean | undefined> = {
      offset: params.offset,
      limit: params.limit,
    };
    if (params.hbSkuList) query.hbSkuList = params.hbSkuList;
    if (params.merchantSkuList) query.merchantSkuList = params.merchantSkuList;
    if (params.salableListings !== undefined) query['salable-listings'] = params.salableListings;
    if (params.notsalableListings !== undefined) {
      query['notsalable-listings'] = params.notsalableListings;
    }
    if (params.updateStartDate) query.updateStartDate = params.updateStartDate;
    if (params.updateEndDate) query.updateEndDate = params.updateEndDate;
    if (params.productId) query.productId = params.productId;

    const data = await this.transport.request<WirePage>({
      method: 'GET',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query,
      rateLimiter: this.limiter,
    });

    const totalCount = typeof data.totalCount === 'number' ? data.totalCount : 0;
    const limit = typeof data.limit === 'number' ? data.limit : params.limit;
    return {
      totalCount,
      limit,
      offset: typeof data.offset === 'number' ? data.offset : params.offset,
      pageCount: limit > 0 ? Math.ceil(totalCount / limit) : 0,
      items: (data.listings ?? []).map(normalizeListing),
    };
  }

  /**
   * Buybox-rank info for one or more SKUs. Pass a comma-separated string
   * via `skuList` — Hepsiburada accepts both Hepsiburada SKUs and merchant
   * SKUs. **Required** despite what the published OpenAPI spec suggests:
   * the live API rejects empty/missing `skuList` with `400 "skuList cannot
   * be empty"`. The SDK validates client-side so the bad request never
   * leaves the process.
   *
   * @throws {ValidationError} when `skuList` is empty / not a string.
   */
  async getBuyboxOrder(skuList: string): Promise<BuyboxOrderRow[]> {
    if (typeof skuList !== 'string' || skuList.trim() === '') {
      throw new ValidationError({
        message: 'listings.getBuyboxOrder: skuList is required (non-empty)',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/buybox-orders/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query: { skuList },
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : [];
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const out: BuyboxOrderRow = { raw: row };
      if (typeof row.hepsiburadaSku === 'string') out.hepsiburadaSku = row.hepsiburadaSku;
      if (typeof row.merchantSku === 'string') out.merchantSku = row.merchantSku;
      if (typeof row.buyboxOrder === 'number') out.buyboxOrder = row.buyboxOrder;
      if (typeof row.buyboxPrice === 'number') out.buyboxPrice = row.buyboxPrice;
      return out;
    });
  }

  /**
   * Commission rates for one or more SKUs (`skuList` as CSV).
   *
   * **Required** despite what the published OpenAPI spec suggests: the live
   * API rejects empty/missing `skuList` with `400 "skuList cannot be empty"`.
   *
   * @throws {ValidationError} when `skuList` is empty / not a string.
   */
  async getCommissions(skuList: string): Promise<CommissionRow[]> {
    if (typeof skuList !== 'string' || skuList.trim() === '') {
      throw new ValidationError({
        message: 'listings.getCommissions: skuList is required (non-empty)',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `/commissions/merchantid/${encodeURIComponent(this.transport.merchantId)}`,
      query: { skuList },
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : [];
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const out: CommissionRow = { raw: row };
      if (typeof row.hepsiburadaSku === 'string') out.hepsiburadaSku = row.hepsiburadaSku;
      if (typeof row.merchantSku === 'string') out.merchantSku = row.merchantSku;
      if (typeof row.commissionRate === 'number') out.commissionRate = row.commissionRate;
      return out;
    });
  }

  // ─── Inventory upload (combined stock + price + shipping) ─────────────

  /**
   * "Inventory upload" — Hepsiburada's combined stock/price/shipping/etc.
   * bulk endpoint. Use this when you want to push everything at once;
   * `uploadStock`, `uploadPrice`, `uploadShippingInfo` are narrower
   * surfaces that update one dimension at a time.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async uploadInventory(items: InventoryUploadItem[]): Promise<UploadReceipt> {
    return this.submitUpload(
      '/listings/merchantid/${id}/inventory-uploads',
      items,
      'uploadInventory',
    );
  }

  /** Poll the result of a prior `uploadInventory`. */
  async getInventoryUpload(uploadId: string): Promise<UploadResult> {
    return this.pollUpload(
      `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/inventory-uploads/id/${encodeURIComponent(uploadId)}`,
    );
  }

  // ─── Stock upload ─────────────────────────────────────────────────────

  /**
   * Bulk-update stock quantities.
   *
   * ⚠️ This overwrites the stock Hepsiburada holds for each SKU. For listings
   * fulfilled by Hepsiburada (`Listing.isFulfilledByHB === true`), that figure
   * is managed by HB's warehouse — pushing your own can oversell or zero them
   * out. Filter those SKUs out of your stock sync unless you mean to override.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async uploadStock(items: StockUploadItem[]): Promise<UploadReceipt> {
    return this.submitUpload('/listings/merchantid/${id}/stock-uploads', items, 'uploadStock');
  }

  async getStockUpload(uploadId: string): Promise<UploadResult> {
    return this.pollUpload(
      `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/stock-uploads/id/${encodeURIComponent(uploadId)}`,
    );
  }

  // ─── Price upload ─────────────────────────────────────────────────────

  /**
   * Bulk-update prices.
   *
   * Hepsiburada validates against floor/ceiling rules; if rejected, the
   * result populates `priceValidations[]` on `getPriceUpload`.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async uploadPrice(items: PriceUploadItem[]): Promise<UploadReceipt> {
    return this.submitUpload('/listings/merchantid/${id}/price-uploads', items, 'uploadPrice');
  }

  /** Poll a price upload — surfaces `priceValidations[]` for floor/ceiling rejections. */
  async getPriceUpload(uploadId: string): Promise<PriceUploadResult> {
    const data = await this.transport.request<WireUploadResult>({
      method: 'GET',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/price-uploads/id/${encodeURIComponent(uploadId)}`,
      rateLimiter: this.limiter,
    });
    const base = normalizeUploadResult(data);
    const out: PriceUploadResult = base;
    if (Array.isArray(data.priceValidations)) {
      out.priceValidations = data.priceValidations.map((row) => ({
        elementNo: typeof row.elementNo === 'number' ? row.elementNo : 0,
        hepsiburadaSku: typeof row.hepsiburadaSku === 'string' ? row.hepsiburadaSku : undefined,
        merchantSku: typeof row.merchantSku === 'string' ? row.merchantSku : undefined,
        type: typeof row.type === 'string' ? row.type : undefined,
        minPrice: typeof row.minPrice === 'number' ? row.minPrice : undefined,
        maxPrice: typeof row.maxPrice === 'number' ? row.maxPrice : undefined,
        regulativePriceDetail:
          row.regulativePriceDetail as PriceUploadResult['priceValidations'] extends
            (infer R)[] | undefined
            ? R extends { regulativePriceDetail?: infer D }
              ? D
              : never
            : never,
        description: typeof row.description === 'string' ? row.description : undefined,
      }));
    }
    return out;
  }

  // ─── Shipping info upload ─────────────────────────────────────────────

  /** Bulk-update shipping config (dispatch time, cargo company, warehouses). */
  async uploadShippingInfo(items: ShippingInfoUploadItem[]): Promise<UploadReceipt> {
    return this.submitUpload(
      '/listings/merchantid/${id}/shipping-info-uploads',
      items,
      'uploadShippingInfo',
    );
  }

  async getShippingInfoUpload(uploadId: string): Promise<UploadResult> {
    return this.pollUpload(
      `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/shipping-info-uploads/id/${encodeURIComponent(uploadId)}`,
    );
  }

  // ─── Additional info upload ───────────────────────────────────────────

  /** Bulk-update product extras (customization text, installation flag). */
  async uploadAdditionalInfo(items: AdditionalInfoUploadItem[]): Promise<UploadReceipt> {
    return this.submitUpload(
      '/listings/merchantid/${id}/additional-info-uploads',
      items,
      'uploadAdditionalInfo',
    );
  }

  async getAdditionalInfoUpload(uploadId: string): Promise<UploadResult> {
    return this.pollUpload(
      `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/additional-info-uploads/id/${encodeURIComponent(uploadId)}`,
    );
  }

  // ─── Single-SKU mutations ─────────────────────────────────────────────

  /**
   * Activate one listing by `hepsiburadaSku`. Reverses a prior
   * deactivate / "is not salable" state when the underlying issue
   * (low stock, suspended, etc.) is resolved.
   */
  async activate(hepsiburadaSku: string): Promise<void> {
    await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/sku/${encodeURIComponent(hepsiburadaSku)}/activate`,
      rateLimiter: this.limiter,
    });
  }

  /** Deactivate one listing by `hepsiburadaSku`. */
  async deactivate(hepsiburadaSku: string): Promise<void> {
    await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/sku/${encodeURIComponent(hepsiburadaSku)}/deactivate`,
      rateLimiter: this.limiter,
    });
  }

  /** Update one listing's stock / price / dispatch-time in a single call. */
  async updateSingle(
    hepsiburadaSku: string,
    merchantSku: string,
    input: UpdateListingInput,
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/sku/${encodeURIComponent(hepsiburadaSku)}/merchantsku/${encodeURIComponent(merchantSku)}`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Permanently delete one listing. */
  async deleteSingle(hepsiburadaSku: string, merchantSku: string): Promise<void> {
    await this.transport.request<unknown>({
      method: 'DELETE',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/sku/${encodeURIComponent(hepsiburadaSku)}/merchantsku/${encodeURIComponent(merchantSku)}`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Bulk-unlock Hepsiburada SKUs that Hepsiburada has locked (typically
   * due to pricing or supply issues — same family as Trendyol's `unlock`).
   *
   * @throws {ValidationError} when `hbSkuList` is empty.
   */
  async bulkUnlock(input: BulkUnlockInput): Promise<void> {
    if (!Array.isArray(input?.hbSkuList) || input.hbSkuList.length === 0) {
      throw new ValidationError({ message: 'listings.bulkUnlock: hbSkuList must not be empty' });
    }
    await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `/listings/merchantid/${encodeURIComponent(this.transport.merchantId)}/bulk-unlock`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  // ─── Internal helpers ────────────────────────────────────────────────

  private async submitUpload<T>(
    pathTemplate: string,
    items: T[],
    methodLabel: string,
  ): Promise<UploadReceipt> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError({ message: `listings.${methodLabel}: items must not be empty` });
    }
    if (items.length > MAX_BULK_ITEMS) {
      throw new ValidationError({
        message: `listings.${methodLabel}: max ${MAX_BULK_ITEMS} items per call (got ${items.length})`,
      });
    }
    const path = pathTemplate.replace('${id}', encodeURIComponent(this.transport.merchantId));
    const data = await this.transport.request<UploadReceipt>({
      method: 'POST',
      service: SERVICE,
      path,
      body: items,
      rateLimiter: this.limiter,
    });
    return { id: data?.id ?? '' };
  }

  private async pollUpload(path: string): Promise<UploadResult> {
    const data = await this.transport.request<WireUploadResult>({
      method: 'GET',
      service: SERVICE,
      path,
      rateLimiter: this.limiter,
    });
    return normalizeUploadResult(data);
  }
}
