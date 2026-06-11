---
'@lonca/hepsiburada': minor
---

Fix `catalog.listProducts` / `listProductsByStatus` silently returning `[]`, and
surface typed product content on `CatalogProduct`.

**Fix (data loss):** Hepsiburada's catalog list endpoints return a paginated
envelope (`{ totalElements, totalPages, data: [...] }`), but the SDK assumed a
bare array and dropped every row when the response was an object — so these calls
returned nothing against the live API. They now unwrap the envelope (`data`, with
`content` / `items` / bare-array fallbacks). Verified against live prod
`all-products-of-merchant`.

**Content typing:** `CatalogProduct` now exposes `title`, `categoryId`,
`categoryName`, `brand`, `description`, and `images`, resolved best-effort from the
row (Hepsiburada keys the title as `productName`/`name`) — so callers stop
hand-parsing the raw row. Fields stay `undefined` when the catalog doesn't surface
them (never guessed); `fields` and `raw` are untouched.

```ts
const products = await client.catalog.listProducts(); // now returns rows (was [])
products[0]?.title;        // string | undefined
products[0]?.categoryName; // string | undefined
products[0]?.images;       // string[] | undefined
```
