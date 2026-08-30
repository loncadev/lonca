---
'@lonca/hepsiburada': minor
---

`catalog.listProducts` and `catalog.listProductsByStatus` now return `OffsetPage<CatalogProduct>` (from `@lonca/core`) instead of a bare `CatalogProduct[]`, mapped from Hepsiburada's Spring-style envelope: `totalElements` → `totalCount`, `totalPages` → `pageCount`, `data` → `items`. Both methods also accept `offset` / `limit` as an alias of `page` / `size`, so they plug straight into `paginateOffset` (pass `limit` — the API pages by number, so `offset` must be a multiple of it). `listProducts` gains the documented `barcode` / `merchantSku` / `hbSku` filters.

Migration: `const rows = await c.catalog.listProducts()` → `const rows = (await c.catalog.listProducts()).items`.
