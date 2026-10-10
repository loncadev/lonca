import type { N11Transport } from '../transport.js';
import type {
  N11AttributeValue,
  N11Category,
  N11CategoryAttribute,
  N11CategoryAttributes,
} from '../types/category.js';

/** One node of `GET /cdn/categories` as observed on prod (2026-10-10). */
interface N11CategoryWire {
  id?: number | string;
  parentId?: number | string | null;
  name?: string;
  subCategories?: N11CategoryWire[] | null;
}

interface N11AttributeWire {
  attributeId?: number | string;
  categoryId?: number | string;
  attributeName?: string;
  isMandatory?: boolean;
  isVariant?: boolean;
  isSlicer?: boolean;
  isCustomValue?: boolean;
  isN11Grouping?: boolean;
  attributeOrder?: number;
  attributeValues?: { id?: number | string; value?: string }[] | null;
}

interface N11CategoryAttributesWire {
  id?: number | string;
  name?: string;
  categoryAttributes?: N11AttributeWire[] | null;
}

function normalizeCategory(node: N11CategoryWire): N11Category {
  const { subCategories, ...rest } = node;
  const children = (subCategories ?? []).map(normalizeCategory);
  const category: N11Category = {
    id: String(node.id ?? ''),
    name: node.name ?? '',
    leaf: children.length === 0,
    subCategories: children,
    raw: rest as Record<string, unknown>,
  };
  if (node.parentId !== null && node.parentId !== undefined) {
    category.parentId = String(node.parentId);
  }
  return category;
}

function normalizeValue(node: { id?: number | string; value?: string }): N11AttributeValue {
  return { id: String(node.id ?? ''), value: node.value ?? '' };
}

function normalizeAttribute(node: N11AttributeWire): N11CategoryAttribute {
  const attribute: N11CategoryAttribute = {
    id: String(node.attributeId ?? ''),
    name: node.attributeName ?? '',
    isMandatory: node.isMandatory === true,
    isVariant: node.isVariant === true,
    isSlicer: node.isSlicer === true,
    isCustomValue: node.isCustomValue === true,
    isN11Grouping: node.isN11Grouping === true,
    values: (node.attributeValues ?? []).map(normalizeValue),
    raw: node as Record<string, unknown>,
  };
  if (typeof node.attributeOrder === 'number') attribute.order = node.attributeOrder;
  return attribute;
}

/**
 * n11 category reads (`/cdn/…`).
 *
 * Sources: developer.n11.com → "Kategori Ağacı Listeleme" and "Kategori
 * Özellikleri Listeleme". Response shapes verified against prod on 2026-10-10.
 * The pages say only `appKey` is needed; prod still answers with the key alone,
 * but the transport sends both headers as the 2025 changelog requires.
 */
export class CategoriesResource {
  constructor(private readonly transport: N11Transport) {}

  /** The full category tree, in one call (`GET /cdn/categories`). */
  async list(): Promise<N11Category[]> {
    const data = await this.transport.request<{ categories?: N11CategoryWire[] } | undefined>({
      method: 'GET',
      path: '/cdn/categories',
    });
    return (data?.categories ?? []).map(normalizeCategory);
  }

  /**
   * Attributes of a **leaf** category, with their allowed values
   * (`GET /cdn/category/{id}/attribute`). An unknown or non-leaf id answers
   * `400 invalidInput` ("category … not found"), surfaced as `ValidationError`.
   */
  async getAttributes(categoryId: string | number): Promise<N11CategoryAttributes> {
    const data = await this.transport.request<N11CategoryAttributesWire | undefined>({
      method: 'GET',
      path: `/cdn/category/${encodeURIComponent(String(categoryId))}/attribute`,
    });
    return {
      categoryId: String(data?.id ?? categoryId),
      name: data?.name ?? '',
      attributes: (data?.categoryAttributes ?? []).map(normalizeAttribute),
    };
  }
}
