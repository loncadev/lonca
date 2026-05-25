---
'@lonca/trendyol': minor
---

Add `categories.getAttributeValues` — V2 endpoint for fetching the value catalog of a single category attribute.

- `client.categories.getAttributeValues(categoryId, attributeId, { cursor?, limit? })` → `CursorPage<CategoryAttributeValue>`
  - GETs `/integration/product/categories/{categoryId}/attributes/{attributeId}/values`
  - Page-based pagination internally (max page size 1000); SDK exposes the cursor convention from `@lonca/core` so callers can iterate with `paginate()`
  - Rate limit: 50 req/min (shared with `categories.list` / `getAttributes`)

**Why this exists:** `categories.getAttributes` returns attribute metadata + flags but typically **omits** the `attributeValues` field on live responses. When `allowCustom` is `false`, you previously had no way to discover the accepted values from the SDK — this fills the gap so you can build valid `createProducts` payloads.

**Discovery-first wire fix:** The official OpenAPI spec advertises `{ attributeValueId, attributeValueName }` as the response item shape, but live STAGE responses (verified 2026-05-25 on cat 67302 / attr 42737, 4 populated values) return `{ attributeValueId, attributeValue }` — without the `Name` suffix. The SDK normalizes both spellings into `{ id, name }`. Mock test pins the live wire shape so a regression on Trendyol's side surfaces immediately.

New exports:
- `ListCategoryAttributeValuesParams`

Existing `CategoryAttribute.values` JSDoc updated to point at this new method.

This unblocks the upcoming `products.create` (V2) implementation — the upstream prerequisite chain for product creation is now complete.
