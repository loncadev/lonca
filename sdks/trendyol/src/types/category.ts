/**
 * A node in the Trendyol category tree.
 *
 * Trendyol exposes categories as a deeply nested structure where each node
 * can have child categories under `subCategories`. We normalize numeric IDs
 * to strings to match the `@lonca/core` convention.
 */
export interface Category {
  id: string;
  name: string;
  /** `null` when this is a root category. */
  parentId: string | null;
  subCategories: Category[];
}

/** A single allowed value for a category attribute. */
export interface CategoryAttributeValue {
  id: string;
  name: string;
}

/**
 * A required or optional attribute for products in a given category.
 * Use these when constructing a `createProduct V2` payload — the API rejects
 * products that omit `required` attributes.
 */
export interface CategoryAttribute {
  id: string;
  name: string;
  /** The category this attribute belongs to (echoed back by Trendyol). */
  categoryId?: string;
  required: boolean;
  /** Whether the attribute accepts custom text values in addition to the listed ones. */
  allowCustom: boolean;
  /** Whether the attribute participates in product variants (e.g. color, size). */
  varianter: boolean;
  /** Whether the attribute is used as a price slicer (e.g. size for shoes). */
  slicer: boolean;
  /**
   * V2-only: whether the attribute accepts multiple values at once.
   * Present on responses from the V2 `getCategoryAttributes` endpoint; absent on V1.
   */
  allowMultipleAttributeValues?: boolean;
  /**
   * Allowed values for this attribute.
   *
   * NOTE: Trendyol's live API often omits this field on the `getCategoryAttributes`
   * response — the endpoint returns attribute metadata + flags, not the full value
   * catalog. In that case `values` is an empty array. If `allowCustom` is `true`,
   * any custom text is accepted; otherwise consult Trendyol's separate value
   * lookup mechanisms (a dedicated `getAttributeValues` endpoint may land in a
   * future release of this SDK).
   */
  values: CategoryAttributeValue[];
}
