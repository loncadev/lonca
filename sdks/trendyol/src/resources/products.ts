import { TokenBucketRateLimiter, type CursorPage, type CursorPaginationParams } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  BatchRequestItemResult,
  BatchRequestResult,
  NamedRef,
  Product,
  ProductAttribute,
  ProductVariant,
} from '../types/product.js';

const DEFAULT_PAGE_SIZE = 50;
/** Trendyol caps `page × size` at 10,000; we cap `size` defensively. */
const MAX_PAGE_SIZE = 1000;

export interface ListProductsParams extends CursorPaginationParams {
  /** Filter by a single barcode. */
  barcode?: string;
  /** Filter products updated on or after this date (Trendyol expects ms-epoch). */
  startDate?: Date;
  /** Filter products updated on or before this date. */
  endDate?: Date;
}

// ─── Wire types (Trendyol's real shape, verified live) ──────────────────────

interface TrendyolRef {
  id?: number | string;
  name?: string;
}

interface TrendyolAttributeNode {
  attributeId?: number | string;
  attributeName?: string;
  attributeValueId?: number | string;
  attributeValue?: string;
}

interface TrendyolVariantNode {
  variantId?: number | string;
  barcode?: string;
  commission?: number;
  attributes?: TrendyolAttributeNode[];
  productUrl?: string;
  onSale?: boolean;
  stock?: { quantity?: number } | number;
  [key: string]: unknown;
}

interface TrendyolProductNode {
  contentId?: number | string;
  productMainId?: string;
  title?: string;
  description?: string;
  brand?: TrendyolRef;
  category?: TrendyolRef;
  images?: Array<{ url?: string } | string>;
  attributes?: TrendyolAttributeNode[];
  variants?: TrendyolVariantNode[];
  creationDate?: number;
  lastModifiedDate?: number;
  lastModifiedBy?: string;
  [key: string]: unknown;
}

interface TrendyolFilterResponse {
  content?: TrendyolProductNode[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
  nextPageToken?: string;
}

interface TrendyolBatchResultResponse {
  batchRequestId?: string;
  status?: string;
  itemCount?: number;
  failedItemCount?: number;
  items?: Array<{
    requestItem?: unknown;
    status?: string;
    failureReasons?: string[];
  }>;
  creationDate?: number;
  lastModification?: number;
  sourceType?: string;
  batchRequestType?: string;
  notes?: string;
  objectKey?: string;
  storeFrontCode?: string;
  [key: string]: unknown;
}

// ─── Normalizers ────────────────────────────────────────────────────────────

function normalizeRef(ref: TrendyolRef | undefined): NamedRef {
  return {
    id: ref?.id !== undefined ? String(ref.id) : '',
    name: ref?.name ?? '',
  };
}

function normalizeAttribute(attr: TrendyolAttributeNode): ProductAttribute {
  const out: ProductAttribute = {
    attributeId: attr.attributeId !== undefined ? String(attr.attributeId) : '',
  };
  if (attr.attributeName !== undefined) out.attributeName = attr.attributeName;
  if (attr.attributeValueId !== undefined) {
    out.attributeValueId = String(attr.attributeValueId);
  }
  if (attr.attributeValue !== undefined) out.attributeValue = attr.attributeValue;
  return out;
}

function normalizeImages(images: TrendyolProductNode['images']): string[] {
  if (!images) return [];
  return images
    .map((img) => (typeof img === 'string' ? img : img?.url))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
}

function normalizeStock(stock: TrendyolVariantNode['stock']): number | undefined {
  if (typeof stock === 'number') return stock;
  if (stock && typeof stock === 'object' && typeof stock.quantity === 'number') {
    return stock.quantity;
  }
  return undefined;
}

function normalizeVariant(variant: TrendyolVariantNode): ProductVariant {
  const out: ProductVariant = {
    variantId: variant.variantId !== undefined ? String(variant.variantId) : '',
    barcode: variant.barcode ?? '',
    attributes: (variant.attributes ?? []).map(normalizeAttribute),
    raw: variant as Record<string, unknown>,
  };
  if (typeof variant.commission === 'number') out.commission = variant.commission;
  if (variant.productUrl !== undefined) out.productUrl = variant.productUrl;
  if (typeof variant.onSale === 'boolean') out.onSale = variant.onSale;
  const stock = normalizeStock(variant.stock);
  if (stock !== undefined) out.stock = stock;
  return out;
}

function toIso(epochMs: number | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return undefined;
  return new Date(epochMs).toISOString();
}

function normalizeProduct(node: TrendyolProductNode): Product {
  const out: Product = {
    contentId: node.contentId !== undefined ? String(node.contentId) : '',
    productMainId: node.productMainId ?? '',
    title: node.title ?? '',
    brand: normalizeRef(node.brand),
    category: normalizeRef(node.category),
    images: normalizeImages(node.images),
    attributes: (node.attributes ?? []).map(normalizeAttribute),
    variants: (node.variants ?? []).map(normalizeVariant),
    createdAt: toIso(node.creationDate) ?? '',
    updatedAt: toIso(node.lastModifiedDate) ?? '',
    raw: node as Record<string, unknown>,
  };
  if (node.description !== undefined) out.description = node.description;
  if (node.lastModifiedBy !== undefined) out.lastModifiedBy = node.lastModifiedBy;
  return out;
}

function normalizeBatchResult(data: TrendyolBatchResultResponse): BatchRequestResult {
  const items: BatchRequestItemResult[] = (data.items ?? []).map((item) => {
    const result: BatchRequestItemResult = {};
    if (item.requestItem !== undefined) result.requestItem = item.requestItem;
    if (item.status !== undefined) result.status = item.status;
    if (item.failureReasons !== undefined) result.failureReasons = item.failureReasons;
    return result;
  });
  const out: BatchRequestResult = {
    batchRequestId: typeof data.batchRequestId === 'string' ? data.batchRequestId : '',
    status: (data.status as BatchRequestResult['status']) ?? 'PROCESSING',
    items,
    raw: data as Record<string, unknown>,
  };
  if (typeof data.itemCount === 'number') out.itemCount = data.itemCount;
  if (typeof data.failedItemCount === 'number') out.failedItemCount = data.failedItemCount;
  const createdAt = toIso(data.creationDate);
  if (createdAt) out.createdAt = createdAt;
  const lastModifiedAt = toIso(data.lastModification);
  if (lastModifiedAt) out.lastModifiedAt = lastModifiedAt;
  if (data.sourceType !== undefined) out.sourceType = data.sourceType;
  if (data.batchRequestType !== undefined) out.batchRequestType = data.batchRequestType;
  if (data.notes !== undefined) out.notes = data.notes;
  if (data.objectKey !== undefined) out.objectKey = data.objectKey;
  if (data.storeFrontCode !== undefined) out.storeFrontCode = data.storeFrontCode;
  return out;
}

/**
 * Trendyol product list + batch-result endpoints.
 *
 * Rate limits (per Trendyol service limits):
 * - filterProducts: 2000 req/min
 * - getBatchRequestResult: 1000 req/min
 */
export class ProductsResource {
  private readonly filterLimiter: TokenBucketRateLimiter;
  private readonly batchLimiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    options: {
      filterLimiter?: TokenBucketRateLimiter;
      batchLimiter?: TokenBucketRateLimiter;
    } = {},
  ) {
    this.filterLimiter =
      options.filterLimiter ?? new TokenBucketRateLimiter({ capacity: 2000, intervalMs: 60_000 });
    this.batchLimiter =
      options.batchLimiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * List approved products. Use `paginate()` from `@lonca/core` to iterate
   * lazily across pages.
   *
   * Trendyol exposes both page-based and `nextPageToken`-based pagination
   * (the latter required when the dataset exceeds 10,000 items). The SDK
   * picks the right strategy automatically — pass our opaque `cursor` from
   * the previous response and we forward it as `nextPageToken`.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const product of paginate((p) => client.products.list(p))) {
   *   for (const variant of product.variants) {
   *     console.log(variant.barcode, product.title);
   *   }
   * }
   * ```
   */
  async list(params: ListProductsParams = {}): Promise<CursorPage<Product>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const query: Record<string, string | number | undefined> = { size };
    if (params.cursor) {
      query.nextPageToken = params.cursor;
    } else {
      query.page = 0;
    }
    if (params.barcode) query.barcode = params.barcode;
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();

    const data = await this.transport.request<TrendyolFilterResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.sellerId}/products/approved`,
      query,
      rateLimiter: this.filterLimiter,
    });

    const items = (data.content ?? []).map(normalizeProduct);
    const page: CursorPage<Product> = { items };
    if (data.nextPageToken) {
      page.nextCursor = data.nextPageToken;
    }
    return page;
  }

  /**
   * Poll a batch request returned by an async write (e.g. `createProducts`,
   * `updatePriceAndInventory`).
   *
   * Trendyol retains batch results for **4 hours** after the originating
   * request — poll within that window.
   *
   * @param batchRequestId The opaque ID returned by the originating call.
   */
  async getBatchStatus(batchRequestId: string): Promise<BatchRequestResult> {
    const id = encodeURIComponent(batchRequestId);
    const data = await this.transport.request<TrendyolBatchResultResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.sellerId}/products/batch-requests/${id}`,
      rateLimiter: this.batchLimiter,
    });
    return normalizeBatchResult(data);
  }
}
