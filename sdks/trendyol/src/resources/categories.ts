import { TokenBucketRateLimiter } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { Category, CategoryAttribute } from '../types/category.js';

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

/**
 * Trendyol category-tree and category-attribute endpoints.
 *
 * Rate limits (per Trendyol service limits):
 * - Category list: 50 req/min
 * - Category attributes: 50 req/min
 *
 * Both rate counters live on the same Trendyol service, so we share one
 * limiter across both endpoints.
 */
export class CategoriesResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
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
