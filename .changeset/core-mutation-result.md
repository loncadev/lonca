---
'@lonca/core': minor
---

Add a shared `MutationResult` type (`{ raw: unknown }`) — a minimal envelope for
mutation/action endpoints whose response the SDKs don't model field-by-field.
Re-exported from `@lonca/trendyol` and `@lonca/hepsiburada`, it gives callers a
stable `result.raw` access point instead of a bare `unknown`.
