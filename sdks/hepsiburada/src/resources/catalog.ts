import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CatalogProduct,
  CatalogProductStatus,
  CatalogTrackingReceipt,
  CheckProductStatusInput,
  DeleteBySkuInput,
  FastListingInput,
  ListCatalogProductsParams,
  ListProductsByStatusParams,
  PreMatchActionInput,
  TrackingIdHistoryEntry,
  UploadProductsInput,
} from '../types/catalog-product.js';

const SERVICE = 'mpop' as const;
const BASE_PATH = '/product/api/products';

/**
 * Hepsiburada Catalog Products (`katalog-urun-entegrasyonu` —
 * product surface).
 *
 * **Service base URL**: `mpop[-sit].hepsiburada.com`, `/product/api/products/*`.
 *
 * Covers the full 11-endpoint product CRUD surface — read (list / by-status /
 * history), upload (file / fast-listing), pre-match approve/reject, delete
 * (async with tracking-id polling), and status checks.
 */
export class CatalogResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  // ─── Read ─────────────────────────────────────────────────────────────

  /** List ALL catalog rows for the merchant. */
  async listProducts(params: ListCatalogProductsParams = {}): Promise<CatalogProduct[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/all-products-of-merchant/${encodeURIComponent(this.transport.merchantId)}`,
      query: { page: params.page, size: params.size },
      rateLimiter: this.limiter,
    });
    return unwrapCatalogRows(data).map(normalizeCatalogProduct);
  }

  /** List catalog rows filtered by status (`Active`, `WaitingApproval`, …). */
  async listProductsByStatus(params: ListProductsByStatusParams = {}): Promise<CatalogProduct[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/products-by-merchant-and-status`,
      query: {
        merchantId: this.transport.merchantId,
        status: params.status,
        modifiedAtSince: params.modifiedAtSince,
        page: params.page,
        size: params.size,
      },
      rateLimiter: this.limiter,
    });
    return unwrapCatalogRows(data).map(normalizeCatalogProduct);
  }

  /** Look up status for a single tracking-id (returned by an earlier upload). */
  async getProductStatus(trackingId: string): Promise<CatalogProductStatus> {
    if (!trackingId) {
      throw new ValidationError({ message: 'catalog.getProductStatus: trackingId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/status/${encodeURIComponent(trackingId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeProductStatus(data);
  }

  /** Get the upload-history feed for the merchant's tracking ids. */
  async getTrackingIdHistory(): Promise<TrackingIdHistoryEntry[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/trackingId-history`,
      rateLimiter: this.limiter,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : [];
    return rows.map(normalizeTrackingIdHistoryEntry);
  }

  // ─── Write ─────────────────────────────────────────────────────────────

  /**
   * Upload one or more products as JSON. Returns a `trackingId` you can
   * poll via `getProductStatus(trackingId)`.
   *
   * @throws {ValidationError} when `products` is empty.
   */
  async uploadProductViaFile(products: UploadProductsInput): Promise<CatalogTrackingReceipt> {
    if (!Array.isArray(products) || products.length === 0) {
      throw new ValidationError({
        message: 'catalog.uploadProductViaFile: products array is required (non-empty)',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/import`,
      body: products,
      rateLimiter: this.limiter,
    });
    return normalizeTrackingReceipt(data);
  }

  /** Upload a fast-listing payload (Hepsiburada's "Hızlı Ürün Yükleme" flow). */
  async uploadFastListing(input: FastListingInput): Promise<CatalogTrackingReceipt> {
    if (!input || (Array.isArray(input) && input.length === 0)) {
      throw new ValidationError({ message: 'catalog.uploadFastListing: input is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/fastlisting`,
      body: input,
      rateLimiter: this.limiter,
    });
    return normalizeTrackingReceipt(data);
  }

  /** Approve a product Hepsiburada has pre-matched to an existing catalog entry. */
  async approvePreMatch(input: PreMatchActionInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'catalog.approvePreMatch: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/approve-prematch`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Reject a pre-match Hepsiburada has proposed. */
  async rejectPreMatch(input: PreMatchActionInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'catalog.rejectPreMatch: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/reject-prematch`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Check upload status for one or more tracking ids in a single request. */
  async checkProductStatus(input: CheckProductStatusInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'catalog.checkProductStatus: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/check-product-status`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  // ─── Delete ────────────────────────────────────────────────────────────

  /**
   * Delete one or more products by merchant SKU. Returns a `trackingId` you
   * can poll via `getDeleteProcess(trackingId)`.
   */
  async deleteByMerchantSkuList(input: DeleteBySkuInput): Promise<CatalogTrackingReceipt> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({
        message: 'catalog.deleteByMerchantSkuList: input is required',
      });
    }
    const list = Array.isArray(input.merchantSkuList) ? input.merchantSkuList : null;
    if (!list || list.length === 0) {
      throw new ValidationError({
        message: 'catalog.deleteByMerchantSkuList: merchantSkuList must be a non-empty array',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/delete-process`,
      body: input,
      rateLimiter: this.limiter,
    });
    return normalizeTrackingReceipt(data);
  }

  /** Look up the status of an in-flight delete request by tracking-id. */
  async getDeleteProcess(trackingId: string): Promise<CatalogProductStatus> {
    if (!trackingId) {
      throw new ValidationError({ message: 'catalog.getDeleteProcess: trackingId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/delete-process/${encodeURIComponent(trackingId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeProductStatus(data);
  }
}

// ─── Normalizers ───────────────────────────────────────────────────────────

/**
 * Catalog list endpoints wrap rows in a Spring-style page envelope
 * (`{ data: [...], totalElements, totalPages, number, ... }`) — verified against
 * live `all-products-of-merchant` (2026-06). Other/older surfaces may return a
 * bare array or a `{ content }` / `{ items }` envelope. Unwrap defensively so a
 * non-array response never silently drops every row.
 */
function unwrapCatalogRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['data', 'content', 'items']) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function normalizeCatalogProduct(row: unknown): CatalogProduct {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: CatalogProduct = { id: String(r.id ?? ''), raw: r };
  if (typeof r.createdAt === 'string') out.createdAt = r.createdAt;
  if (typeof r.createdBy === 'string') out.createdBy = r.createdBy;
  if (typeof r.modifiedAt === 'string') out.modifiedAt = r.modifiedAt;
  if (typeof r.modifiedBy === 'string') out.modifiedBy = r.modifiedBy;
  if (typeof r.merchantSku === 'string') out.merchantSku = r.merchantSku;
  if (typeof r.preMatchedSku === 'string') out.preMatchedSku = r.preMatchedSku;
  if (typeof r.siblingSku === 'string') out.siblingSku = r.siblingSku;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.listingStatus === 'string') out.listingStatus = r.listingStatus;
  if (typeof r.listingFailureReason === 'string') out.listingFailureReason = r.listingFailureReason;
  if (typeof r.validationStatus === 'string') out.validationStatus = r.validationStatus;
  if (typeof r.productType === 'string') out.productType = r.productType;
  if (typeof r.uploadDate === 'string') out.uploadDate = r.uploadDate;
  if (typeof r.productQuality === 'number') out.productQuality = r.productQuality;
  if (typeof r.categoryScore === 'number') out.categoryScore = r.categoryScore;
  if (r.fields && typeof r.fields === 'object') {
    out.fields = r.fields as Record<string, never>;
  }
  // Best-effort typed content. Hepsiburada keeps title/category/brand/images in
  // the per-SKU `fields` map (keys verified against the catalog OpenAPI:
  // `productName`/`name`, `categoryId`, `categoryName`, `brand`, `images`,
  // `description`) — occasionally at the raw top level. Try known key variants;
  // leave `undefined` when none match (never guess a value).
  const fields = r.fields as Record<string, { value?: unknown }> | undefined;
  const title = pickContentString(fields, r, 'productName', 'name', 'title');
  if (title !== undefined) out.title = title;
  const categoryId = pickContentString(fields, r, 'categoryId', 'categoryID');
  if (categoryId !== undefined) out.categoryId = categoryId;
  const categoryName = pickContentString(fields, r, 'categoryName', 'category');
  if (categoryName !== undefined) out.categoryName = categoryName;
  const brand = pickContentString(fields, r, 'brand', 'brandName');
  if (brand !== undefined) out.brand = brand;
  const description = pickContentString(fields, r, 'description');
  if (description !== undefined) out.description = description;
  const images = pickContentImages(fields, r, 'images', 'image', 'imageUrls');
  if (images !== undefined) out.images = images;
  return out;
}

/**
 * Resolve a string content field from the catalog `fields` map (value side),
 * falling back to the raw top level. Tries each key in order; `undefined` when
 * none carry a usable value. Numbers are stringified (e.g. numeric `categoryId`).
 */
function pickContentString(
  fields: Record<string, { value?: unknown }> | undefined,
  raw: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const fromField = coerceString(fields?.[key]?.value);
    if (fromField !== undefined) return fromField;
    const fromRaw = coerceString(raw[key]);
    if (fromRaw !== undefined) return fromRaw;
  }
  return undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') return value ? value : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Resolve image URLs from the catalog `fields` map / raw — accepts `string[]`,
 * `{ url | imageUrl }[]`, or a CSV string. `undefined` when none match.
 */
function pickContentImages(
  fields: Record<string, { value?: unknown }> | undefined,
  raw: Record<string, unknown>,
  ...keys: string[]
): string[] | undefined {
  for (const key of keys) {
    const urls = coerceImages(fields?.[key]?.value) ?? coerceImages(raw[key]);
    if (urls && urls.length) return urls;
  }
  return undefined;
}

function coerceImages(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const urls = value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const u = (item as { url?: unknown }).url ?? (item as { imageUrl?: unknown }).imageUrl;
          return typeof u === 'string' ? u.trim() : undefined;
        }
        return undefined;
      })
      .filter((s): s is string => !!s);
    return urls.length ? urls : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const urls = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return urls.length ? urls : undefined;
  }
  return undefined;
}

function normalizeTrackingReceipt(data: unknown): CatalogTrackingReceipt {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    trackingId: String(obj.trackingId ?? obj.id ?? ''),
    raw: obj,
  };
}

function normalizeProductStatus(data: unknown): CatalogProductStatus {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const out: CatalogProductStatus = { raw: obj };
  if (typeof obj.trackingId === 'string') out.trackingId = obj.trackingId;
  if (typeof obj.status === 'string') out.status = obj.status;
  if (typeof obj.message === 'string') out.message = obj.message;
  if (Array.isArray(obj.rows)) out.rows = obj.rows as Array<Record<string, unknown>>;
  else if (Array.isArray(obj.items)) out.rows = obj.items as Array<Record<string, unknown>>;
  else if (Array.isArray(obj.data)) out.rows = obj.data as Array<Record<string, unknown>>;
  return out;
}

function normalizeTrackingIdHistoryEntry(row: unknown): TrackingIdHistoryEntry {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: TrackingIdHistoryEntry = { raw: r };
  if (typeof r.trackingId === 'string') out.trackingId = r.trackingId;
  if (typeof r.createdAt === 'string') out.createdAt = r.createdAt;
  if (typeof r.status === 'string') out.status = r.status;
  return out;
}
