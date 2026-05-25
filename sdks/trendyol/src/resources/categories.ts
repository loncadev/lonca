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
 * Trendyol returns the category tree as a root-level JSON array.
 * (Earlier internal naming had it wrapped in `{ categories }`; the public API does not.)
 */
type TrendyolCategoriesResponse = TrendyolCategoryNode[];

interface TrendyolCategoryAttributeValue {
  id: number;
  name: string;
}

interface TrendyolCategoryAttributeNode {
  attribute: { id: number; name: string };
  required: boolean;
  allowCustom: boolean;
  varianter: boolean;
  slicer: boolean;
  /** V2-only: whether the attribute accepts multiple values at once. */
  allowMultipleAttributeValues?: boolean;
  attributeValues: TrendyolCategoryAttributeValue[];
}

interface TrendyolCategoryAttributesResponse {
  id: number;
  categoryAttributes: TrendyolCategoryAttributeNode[];
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
  const out: CategoryAttribute = {
    id: String(node.attribute.id),
    name: node.attribute.name,
    required: node.required,
    allowCustom: node.allowCustom,
    varianter: node.varianter,
    slicer: node.slicer,
    values: node.attributeValues.map((v) => ({ id: String(v.id), name: v.name })),
  };
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
    return data.map(normalizeCategory);
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
    const data = await this.transport.request<TrendyolCategoryAttributesResponse>({
      method: 'GET',
      path: `/integration/product/categories/${id}/attributes`,
      rateLimiter: this.limiter,
    });
    return data.categoryAttributes.map(normalizeAttribute);
  }
}
