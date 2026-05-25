import {
  TokenBucketRateLimiter,
  ValidationError,
  type CursorPage,
  type CursorPaginationParams,
} from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  BarcodeCategoryLookup,
  Category,
  CategoryAttribute,
  CategoryAttributeValue,
} from '../types/category.js';

interface TrendyolCategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  subCategories?: TrendyolCategoryNode[];
}

/**
 * Trendyol's category-tree response shape.
 *
 * The OpenAPI spec advertises a root-level array, but live PROD/STAGE responses
 * may wrap it. We accept both shapes defensively.
 */
type TrendyolCategoriesResponse = TrendyolCategoryNode[] | { categories: TrendyolCategoryNode[] };

interface TrendyolCategoryAttributeValue {
  id: number;
  name: string;
}

/**
 * Wire shape of one item in the V2 `getCategoryAttributeValues` page.
 *
 * Important: the official OpenAPI spec calls this `attributeValueName`,
 * but live STAGE responses (verified 2026-05-25) return `attributeValue`.
 * We accept both defensively.
 */
interface TrendyolAttributeValueItem {
  attributeValueId?: number | string;
  attributeValue?: string;
  attributeValueName?: string;
}

interface TrendyolAttributeValuesPage {
  content?: TrendyolAttributeValueItem[];
  page?: number;
  size?: number;
  totalPages?: number;
  totalElements?: number;
}

interface TrendyolCategoryAttributeNode {
  attribute?: { id: number; name: string };
  categoryId?: number;
  required?: boolean;
  allowCustom?: boolean;
  varianter?: boolean;
  slicer?: boolean;
  /** V2-only: whether the attribute accepts multiple values at once. */
  allowMultipleAttributeValues?: boolean;
  /** Often omitted by Trendyol's live API; treat as optional. */
  attributeValues?: TrendyolCategoryAttributeValue[];
}

function normalizeCategory(node: TrendyolCategoryNode): Category {
  return {
    id: String(node.id),
    name: node.name,
    parentId: node.parentId === null || node.parentId === undefined ? null : String(node.parentId),
    subCategories: (node.subCategories ?? []).map(normalizeCategory),
  };
}

function normalizeAttribute(node: TrendyolCategoryAttributeNode): CategoryAttribute {
  const attr = node.attribute ?? { id: 0, name: '' };
  const rawValues = node.attributeValues ?? [];
  const out: CategoryAttribute = {
    id: String(attr.id),
    name: attr.name,
    required: !!node.required,
    allowCustom: !!node.allowCustom,
    varianter: !!node.varianter,
    slicer: !!node.slicer,
    values: rawValues.map((v) => ({ id: String(v.id), name: v.name })),
  };
  if (node.categoryId !== undefined) {
    out.categoryId = String(node.categoryId);
  }
  if (node.allowMultipleAttributeValues !== undefined) {
    out.allowMultipleAttributeValues = node.allowMultipleAttributeValues;
  }
  return out;
}

/** Trendyol caps `page` and `size` at 1000 for the values endpoint. */
const MAX_ATTR_VALUES_PAGE_SIZE = 1000;
const DEFAULT_ATTR_VALUES_PAGE_SIZE = 100;

export type ListCategoryAttributeValuesParams = CursorPaginationParams;

/**
 * Trendyol category-tree and category-attribute endpoints.
 *
 * Rate limits (per Trendyol service limits):
 * - Category list: 50 req/min
 * - Category attributes: 50 req/min
 * - Category attribute values: 50 req/min (same service tier)
 *
 * All three counters live on the same Trendyol service, so we share one
 * limiter across the endpoints.
 */
export class CategoriesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
    /**
     * Trendyol seller (supplier) ID — required only for the AutoFT-scoped
     * `getByBarcodes` lookup. Other category endpoints don't need it.
     * Provided automatically when constructed via `createTrendyolClient`.
     */
    private readonly sellerId?: number,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 50, intervalMs: 60_000 });
  }

  /**
   * Fetch the full Trendyol category tree.
   *
   * Trendyol returns the entire tree in one response — there is no pagination.
   * Cache the result aggressively in your application; the tree changes rarely.
   */
  async list(): Promise<Category[]> {
    const data = await this.transport.request<TrendyolCategoriesResponse>({
      method: 'GET',
      path: '/integration/product/product-categories',
      rateLimiter: this.limiter,
    });
    const list = Array.isArray(data) ? data : data.categories;
    return list.map(normalizeCategory);
  }

  /**
   * Fetch the attributes (required and optional) for a single category.
   *
   * Call this before `createProduct V2` so you know which attributes are
   * mandatory — the API rejects products that omit any `required` attribute.
   *
   * @param categoryId Trendyol numeric category ID; accepts `string` or `number`.
   */
  async getAttributes(categoryId: string | number): Promise<CategoryAttribute[]> {
    const id = encodeURIComponent(String(categoryId));
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/product/categories/${id}/attributes`,
      rateLimiter: this.limiter,
    });

    // Defensive: live API wraps the array as either a root array, `categoryAttributes`,
    // or `attributes`. Verified via STAGE + PROD smoke tests on 2026-05-25.
    const list = extractAttributeList(data);
    if (!list) {
      // eslint-disable-next-line no-console
      console.error(
        '[@lonca/trendyol] getCategoryAttributes: unexpected response shape:',
        JSON.stringify(data).slice(0, 800),
      );
      return [];
    }
    return list.map(normalizeAttribute);
  }

  /**
   * Fetch the allowed values for a single category attribute (paginated).
   *
   * `getCategoryAttributes` returns attribute metadata + flags but typically
   * omits the value catalog. Use this method to fetch the catalog for an
   * attribute when `allowCustom` is `false` and you need to map your data
   * onto Trendyol's accepted values.
   *
   * @param categoryId  Trendyol numeric category ID; accepts `string` or `number`.
   * @param attributeId Attribute ID returned by `getAttributes`.
   * @param params      Cursor pagination (max page size 1000; default 100).
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const value of paginate((p) =>
   *   client.categories.getAttributeValues(catId, attrId, p),
   * )) {
   *   console.log(value.id, value.name);
   * }
   * ```
   */
  async getAttributeValues(
    categoryId: string | number,
    attributeId: string | number,
    params: ListCategoryAttributeValuesParams = {},
  ): Promise<CursorPage<CategoryAttributeValue>> {
    const catId = encodeURIComponent(String(categoryId));
    const attrId = encodeURIComponent(String(attributeId));
    const size = Math.min(params.limit ?? DEFAULT_ATTR_VALUES_PAGE_SIZE, MAX_ATTR_VALUES_PAGE_SIZE);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    const data = await this.transport.request<TrendyolAttributeValuesPage>({
      method: 'GET',
      path: `/integration/product/categories/${catId}/attributes/${attrId}/values`,
      query: { page, size },
      rateLimiter: this.limiter,
    });

    const items: CategoryAttributeValue[] = (data.content ?? []).map((item) => ({
      id: item.attributeValueId !== undefined ? String(item.attributeValueId) : '',
      name: item.attributeValue ?? item.attributeValueName ?? '',
    }));
    const result: CursorPage<CategoryAttributeValue> = { items };
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Look up category info for a list of barcodes (Trendyol Export Center
   * / AutoFT endpoint).
   *
   * **Requires Export Center enrollment.** Sellers who have not joined
   * Trendyol's "İhracat Merkezi" program will get an auth error on this
   * endpoint even though their regular Marketplace credentials are valid.
   *
   * @param barcodes 1–N barcodes to look up.
   * @throws {ValidationError} when `barcodes` is empty.
   * @throws Error when the client was created without a `sellerId` and this
   *   method is called directly (use `createTrendyolClient` to wire it).
   */
  async getByBarcodes(barcodes: string[]): Promise<BarcodeCategoryLookup> {
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      throw new ValidationError({ message: 'getByBarcodes: barcodes must not be empty' });
    }
    if (this.sellerId === undefined) {
      throw new Error(
        'CategoriesResource.getByBarcodes requires a sellerId; instantiate via createTrendyolClient',
      );
    }

    interface WireResponse {
      barcodeCategories?: Record<string, { id?: number | string; displayName?: string }>;
      notFound?: string[];
    }
    const data = await this.transport.request<WireResponse>({
      method: 'POST',
      path: `/integration/ecgw/v1/${this.sellerId}/lookup/product-categories/by-barcodes`,
      body: { barcodes },
      rateLimiter: this.limiter,
    });

    const matches = Object.entries(data.barcodeCategories ?? {}).map(([barcode, cat]) => ({
      barcode,
      category: {
        id: cat.id !== undefined ? String(cat.id) : '',
        name: cat.displayName ?? '',
      },
    }));
    return { matches, notFound: data.notFound ?? [] };
  }
}

function extractAttributeList(data: unknown): TrendyolCategoryAttributeNode[] | null {
  if (Array.isArray(data)) return data as TrendyolCategoryAttributeNode[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.categoryAttributes)) {
      return obj.categoryAttributes as TrendyolCategoryAttributeNode[];
    }
    if (Array.isArray(obj.attributes)) {
      return obj.attributes as TrendyolCategoryAttributeNode[];
    }
  }
  return null;
}
