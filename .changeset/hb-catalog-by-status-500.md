---
'@lonca/hepsiburada': patch
---

Fix `catalog.listProductsByStatus` returning HTTP 500 on every call. The SDK sent the filter as `status=…`, but Hepsiburada's `products-by-merchant-and-status` endpoint requires it as `productStatus` and answers 500 (not 400) when that parameter is missing or not one of its UPPER_SNAKE values. The method now sends `productStatus`, requires `status` (a `ValidationError` is thrown client-side when it is missing), types it as the documented `CatalogProductLifecycleStatus` union (`'WAITING' | 'MATCHED' | 'MISSING_INFO' | …`, with an open string escape hatch), passes the documented optional `taskStatus` / `version` parameters through, and no longer sends the undocumented `modifiedAtSince` (now deprecated). The previously documented `'Active'` / `'WaitingApproval'` values were never accepted by the API — replace them with the UPPER_SNAKE vocabulary.
