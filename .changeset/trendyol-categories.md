---
'@lonca/trendyol': minor
---

Add `categories` resource — required for product creation.

- `client.categories.list()` — fetch the full Trendyol category tree (no pagination; returned in one response)
- `client.categories.getAttributes(categoryId)` — fetch required and optional attributes for a category, including variant / slicer flags and allowed values

New exported types: `Category`, `CategoryAttribute`, `CategoryAttributeValue`. IDs are normalized to strings per `@lonca/core` convention.

Rate-limited to 50 req/min (shared bucket across both endpoints, matching Trendyol's service limits).

Bottom-up rollout: categories are a prerequisite for the upcoming products resource (`createProduct V2` requires `categoryId` + category attributes).
