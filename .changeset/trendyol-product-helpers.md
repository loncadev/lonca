---
'@lonca/trendyol': minor
---

Add **Group 5 — product helpers**: `brands.search` and `categories.getByBarcodes`. This is the final group of the products Phase 2 plan — the Trendyol products surface is now feature-complete.

### New methods

- **`client.brands.search(name)` → `Brand[]`**
  - `GET /integration/product/brands/by-name?name=...`
  - Returns matching brands directly without paging the 1000-per-page `list()`.
  - **Discovery-first wire fact**: Trendyol's docs claim case-sensitive exact match; the live wire is actually substring + case-insensitive. Documented in JSDoc.

- **`client.categories.getByBarcodes(barcodes)` → `BarcodeCategoryLookup`**
  - `POST /integration/ecgw/v1/{sellerId}/lookup/product-categories/by-barcodes`
  - Returns `{ matches: [{barcode, category: {id, name}}], notFound: string[] }`.
  - Normalizes Trendyol's map-shaped `barcodeCategories` response into a flat array.
  - **Requires Trendyol Export Center (AutoFT) enrollment.** Sellers without it will get an auth error — documented in JSDoc.

`CategoriesResource` now optionally takes a `sellerId` (third constructor arg) for the AutoFT lookup — wired automatically when constructed via `createTrendyolClient`. Other category endpoints are unaffected and require no seller ID.

### New exports

- `BarcodeCategoryLookup`

### Smoke verified (STAGE 2026-05-25, output)

```
── 1.5 brands.search("Trendyol")
✓ Got 17 match(es). First 5:
      311522  Trendyol
          40  TRENDYOLMILLA
       14161  TRENDYOLKIDS
       13438  trendyol vavist
      317259  Trendyol Üyelik

── 5.5 categories.getByBarcodes(["3535ddvcxxnnbbvc"])
✓ matches: 1  notFound: 0
    3535ddvcxxnnbbvc  →      429  Yürüyüş Ayakkabısı
```

Both endpoints round-trip cleanly. Bonus discovery: `brands.search` is substring + case-insensitive (not case-sensitive exact as docs claim).

### Phase 2 final state — Trendyol products surface is feature-complete

- Group 1 (#13): `categories.getAttributeValues` ✅
- Group 2 (#14): read completion (`listUnapproved`, `getBase`, `getBuyboxInfo`) ✅
- Group 3 (#15): write core (`create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`) ✅
- Group 4 (#16): lifecycle (`delete`, `archive`/`unarchive`, `unlock`) ✅
- **Group 5 (this PR): helpers (`brands.search`, `categories.getByBarcodes`) ✅**

Full chain coverage: brands (list + search) → categories (tree + attrs + values + barcode→cat lookup) → suppliers → products (read approved/unapproved + base + buybox + write 5 endpoints + lifecycle 4 endpoints + batch status) → inventory → orders.
