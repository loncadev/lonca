/**
 * One node of the n11 category tree (`GET /cdn/categories`).
 *
 * The whole tree comes back in one call; a leaf has `subCategories: null` on
 * the wire (observed on prod, 2026-10-10), normalised here to an empty array
 * plus `leaf: true`. Products must use a leaf id.
 */
export interface N11Category {
  id: string;
  /** Absent on the root categories (`parentId: null` on the wire). */
  parentId?: string;
  name: string;
  /** `true` when n11 sends no sub-categories — the only ids products may use. */
  leaf: boolean;
  subCategories: N11Category[];
  /** Untouched raw node, without its `subCategories` (those are normalised above). */
  raw: Record<string, unknown>;
}

/** A selectable value of a category attribute (`attributeValues[]`). */
export interface N11AttributeValue {
  id: string;
  value: string;
}

/** One attribute of a leaf category (`categoryAttributes[]`). */
export interface N11CategoryAttribute {
  /** `attributeId` on the wire. */
  id: string;
  /** `attributeName` on the wire. */
  name: string;
  isMandatory: boolean;
  /** The attribute splits a product into variants (colour, size, …). */
  isVariant: boolean;
  /** Shown as a filter on n11's listing pages. */
  isSlicer: boolean;
  /** A free-text value is accepted besides `values`. */
  isCustomValue: boolean;
  isN11Grouping: boolean;
  /** Display order (`attributeOrder`). */
  order?: number;
  /** Allowed values; empty for free-text attributes. */
  values: N11AttributeValue[];
  /** Untouched raw attribute. */
  raw: Record<string, unknown>;
}

/** Response of `GET /cdn/category/{id}/attribute`: the category plus its attributes. */
export interface N11CategoryAttributes {
  categoryId: string;
  name: string;
  attributes: N11CategoryAttribute[];
}
