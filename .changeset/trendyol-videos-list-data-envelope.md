---
'@lonca/trendyol': patch
---

`videos.list()` now reads rows from the documented `{ meta, data: [...] }` response envelope; previously it returned `[]` for that shape. `SellerIntegrationStatus` now lists the documented values `IN_PROGRESS | SUCCESS | FAILED` (it remains an open union, so other strings still type-check).
