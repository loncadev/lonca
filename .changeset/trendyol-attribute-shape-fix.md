---
'@lonca/trendyol': patch
---

Fix `categories.getAttributes` parsing against the real Trendyol response shape (verified against STAGE + PROD on 2026-05-25).

The OpenAPI spec advertised an `attributeValues: [...]` field per attribute, but Trendyol's live `getCategoryAttributes` endpoint omits it for most attributes — the endpoint returns attribute metadata and flags only, not the value catalog. Without this fix, calling `getAttributes` against any real category would throw `TypeError: Cannot read properties of undefined (reading 'map')`.

Changes:
- `CategoryAttribute.values` is still typed as `CategoryAttributeValue[]`, but the resource now defaults to `[]` when the field is absent. JSDoc explains where to look for the actual value catalog when needed.
- New optional `CategoryAttribute.categoryId` field — Trendyol echoes this back per attribute and it's useful for grouping.
- Defensive normalization handles missing `attribute`, missing flags (default `false`), and missing `attributeValues`.
- Categories list response handles both root-array and `{ categories: [...] }` wrapped shapes (different envs/seller setups behave differently).
- New regression mock test pinned to the exact wire format we observed in PROD.

Also documents in `brands.ts` that Trendyol enforces a **minimum 1000 page size** server-side regardless of the `limit` value passed.
