---
'@lonca/trendyol': patch
---

Align endpoint paths and response shapes with the official Trendyol OpenAPI specs.

**Bug fix** — `@lonca/trendyol@0.1.0` shipped with placeholder paths that did not match Trendyol's actual API. Anyone trying to use the SDK against real Trendyol would have hit `404 Not Found`. This release fixes all four implemented endpoints.

Path corrections (verified against the OpenAPI spec embedded in each `/reference/<endpoint>.md` page and against the official Postman collection):

| Endpoint | Was | Now |
|---|---|---|
| `brands.list` | `/sapigw/brands` | `/integration/product/brands` |
| `categories.list` | `/sapigw/product-categories` | `/integration/product/product-categories` |
| `categories.getAttributes` | `/sapigw/product-categories/{id}/attributes` | `/integration/product/categories/{id}/attributes` |
| `suppliers.getAddresses` | `/sapigw/suppliers/{sellerId}/addresses` | `/integration/sellers/{sellerId}/addresses` |

Response shape fixes:
- `categories.list` now parses the root-level JSON array (Trendyol does not wrap it in `{ categories: [...] }`)
- `categories.getAttributes` pipes through the V2-only `allowMultipleAttributeValues` flag (added as an optional field on `CategoryAttribute`)

Public TypeScript surface and runtime behavior remain otherwise unchanged.
