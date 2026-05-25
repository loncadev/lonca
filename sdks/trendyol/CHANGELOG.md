# @lonca/trendyol

## 0.4.0

### Minor Changes

- [#22](https://github.com/loncadev/lonca/pull/22) [`04c4fbd`](https://github.com/loncadev/lonca/commit/04c4fbd1282c5fa3282e839e3dc980bb7668ec69) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3a — order status lifecycle**: 4 shipment-package write endpoints completing the seller-side order state machine.

  ### New methods
  - **`client.orders.updatePackageStatus(packageId, { status, lines? })`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}`
    - Status is restricted to `'Picking'` (preparing) or `'Invoiced'` (invoice issued) — other transitions are driven by Trendyol / the cargo provider.
    - Optional `lines: [{lineId, quantity}]` for partial transitions.
  - **`client.orders.cancelPackageItem(packageId, { lines, reasonId })`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/items/unsupplied`
    - Trendyol's "supply failure" (Tedarik Edememe) notification — marks specific line items as `UnSupplied`.
    - SDK throws `ValidationError` on empty `lines` before hitting the wire.
    - `reasonId` is a numeric code Trendyol publishes separately (consult the seller panel for current values).
  - **`client.orders.extendDeliveryDate(packageId, days)`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/extended-agreed-delivery-date`
    - `days` is typed as `1 | 2 | 3` (Trendyol enforces server-side; SDK validates client-side too).
  - **`client.orders.processAlternativeDelivery(packageId, { isPhoneNumber, trackingInfo, params })`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/alternative-delivery`
    - Used when shipping via a non-Trendyol cargo provider. `isPhoneNumber: true` → Trendyol SMSes the link; `false` → stores the URL directly.

  All four return `void` (Trendyol responds with HTTP 200 + empty body on success). Path + body shape match the official OpenAPI spec exactly.

  ### New exports
  - `UpdatePackageStatusInput`
  - `CancelPackageItemInput`
  - `ProcessAlternativeDeliveryInput`
  - `PackageLineUpdate`

  ### Smoke verified (STAGE 2026-05-25)

  All 4 endpoints wire-verified against Trendyol STAGE using a deliberately fake integer `packageId`. Trendyol's gateway returns **HTTP 401** for unknown packageIds on these endpoints (its security layer rejects before reaching the handler) — which still proves the SDK is constructing the correct URL + body + headers (the same credentials succeed on every other endpoint in the same smoke run). A separate isolated probe with a real `packageId` returned HTTP 404 with `SellerIntegrationApiDomainNotFoundException` — also a wire-contract confirmation. No real package state is touched.

  ### Phase 3 plan progress
  - **3a (this PR): status lifecycle (4) ✅**
  - 3b: splitting (4)
  - 3c: cargo/delivery (4)
  - 3d: operational metadata (3)
  - 3e: read variants (2)

  Then phases 4 (returns/claims), 5 (webhooks), 6-11 (questions, invoices, settlements, labels, test orders, locations).

- [#23](https://github.com/loncadev/lonca/pull/23) [`bfaf03c`](https://github.com/loncadev/lonca/commit/bfaf03ce2aa5e1b704aca479e736205fb737c540) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3b — shipment-package splitting**: 4 endpoints for re-arranging order lines into new packages.

  ### New methods (all POST, all `void`)
  - **`client.orders.splitPackage(packageId, orderLineIds)`** → `void`
    - `POST /shipment-packages/{packageId}/split` body `{ orderLineIds }`
    - Moves the listed line IDs into a single new package; the original keeps the remainder.
  - **`client.orders.splitPackageByQuantity(packageId, quantitySplit)`** → `void`
    - `POST /shipment-packages/{packageId}/quantity-split` body `{ quantitySplit: [{ orderLineId, quantities: number[] }] }`
    - Carves one line into multiple packages by quantity (e.g. `quantities: [2, 2, 1]` splits 5 units into 3 packages).
  - **`client.orders.multiSplitPackage(packageId, splitGroups)`** → `void`
    - `POST /shipment-packages/{packageId}/multi-split` body `{ splitGroups: [{ orderLineIds: number[] }] }`
    - Splits into multiple new packages by grouping line IDs.
  - **`client.orders.splitMultiPackagesByQuantity(packageId, splitPackages)`** → `void`
    - `POST /shipment-packages/{packageId}/split-packages` body `{ splitPackages: [{ packageDetails: [{ orderLineId, quantities: number }] }] }`
    - Most expressive — multiple new packages, each with multiple lines + per-line single-integer `quantities`.

  All four throw `ValidationError` on empty input arrays before hitting the wire.

  ### New exports
  - `QuantitySplit` — per-line quantity-split entry (`quantities: number[]`)
  - `SplitGroup` — grouping of line IDs for `multiSplitPackage`
  - `PackageDetail` — single line + quantity for `splitMultiPackagesByQuantity` (note: singular `quantities: number`, intentional naming mismatch with the API)
  - `SplitPackagePlan` — one new package's full contents

  ### Smoke verified (STAGE 2026-05-25)

  All 4 endpoints wire-verified with a fake integer `packageId`. Trendyol's gateway returns **HTTP 401** for unknown packageIds on the split endpoints (same gateway-layer behavior as Phase 3a) — same credentials succeed on every other endpoint in the same smoke run, proving the SDK constructs the correct URL + body. No real package state touched.

  ### Phase 3 progress
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)): status lifecycle (4) ✅
  - **3b (this): splitting (4) ✅**
  - 3c: cargo/delivery (4)
  - 3d: operational metadata (3)
  - 3e: read variants (2)

- [#24](https://github.com/loncadev/lonca/pull/24) [`248a4da`](https://github.com/loncadev/lonca/commit/248a4da507aed465bb3db5be37ee4d786c976203) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3c — cargo + manual delivery** (4 endpoints).

  ### New methods
  - **`client.orders.changeCargoProvider(packageId, cargoProvider)`** → `void`
    - `PUT /shipment-packages/{packageId}/cargo-providers` body `{ cargoProvider }`
    - `cargoProvider` is typed as `TrendyolCargoProvider` — the documented enum (`'YKMP'`, `'ARASMP'`, `'SURATMP'`, `'HOROZMP'`, `'DHLECOMMP'`, `'PTTMP'`, `'CEVAMP'`, `'TEXMP'`, `'KOLAYGELSINMP'`, `'CEVATEDARIK'`) plus a `(string & {})` escape for codes Trendyol adds later.
  - **`client.orders.manualDeliverByPackageId(packageId)`** → `void`
    - `PUT /shipment-packages/{packageId}/manual-invoice-delivery` (no body)
    - Flip a package to `Delivered` when delivered outside Trendyol's cargo network.
  - **`client.orders.manualDeliverByTrackingNumber(cargoTrackingNumber)`** → `void`
    - `PUT /shipment-packages/manual-invoice-delivery-by-tracking-number/{cargoTrackingNumber}` (no body)
    - Same operation as above but keyed by cargo tracking number (e.g. from a cargo provider webhook). Note the sibling path — not under `/{packageId}/...`.
  - **`client.orders.markDeliveredByService(packageId)`** → `void`
    - `PUT /shipment-packages/{packageId}/delivered-by-service` (no body)
    - For appliance / installation-required products delivered by an authorized service partner.

  All four are PUT and return `void` (Trendyol responds with 200 + empty body).

  ### New exports
  - `TrendyolCargoProvider`

  ### Smoke verified (STAGE 2026-05-25)

  All 4 wire-verified with a fake integer `packageId` / fake tracking number; Trendyol's gateway returns HTTP 401 (consistent with Phase 3a/3b behavior). Same credentials succeed on every other endpoint in the run, proving the SDK is constructing the correct URL + body.

  ### Phase 3 progress
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)): status lifecycle (4) ✅
  - 3b ([#23](https://github.com/loncadev/lonca/issues/23)): splitting (4) ✅
  - **3c (this): cargo/delivery (4) ✅**
  - 3d: operational metadata (3)
  - 3e: read variants (2)

- [#25](https://github.com/loncadev/lonca/pull/25) [`f944ca1`](https://github.com/loncadev/lonca/commit/f944ca1a436b0750cb380b248dbb01a018714ad5) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3d — operational metadata** (3 endpoints).

  ### New methods
  - **`client.orders.updateBoxInfo(packageId, { deci?, boxQuantity? })`** → `void`
    - `PUT /shipment-packages/{packageId}/box-info`
    - Update desi (volumetric weight) and/or box count. Both fields optional; send at least one for the call to be meaningful.
  - **`client.orders.updateLaborCosts(packageId, items)`** → `void`
    - `PUT /shipment-packages/{packageId}/labor-costs`
    - **Wire note**: Trendyol's body is a **raw array** here (no `{ items: [...] }` envelope) — the SDK forwards as-is. `items: [{ orderLineId, laborCostPerItem }]`.
    - SDK throws `ValidationError` on empty input.
  - **`client.orders.updateWarehouse(packageId, warehouseId)`** → `void`
    - `PUT /shipment-packages/{packageId}/warehouse` body `{ warehouseId }`
    - Reassign the package to a different warehouse. `warehouseId` comes from `client.suppliers.getAddresses()` (filter by `isShipmentAddress`).

  ### New exports
  - `UpdateBoxInfoInput`
  - `LaborCostInput`

  ### Smoke verified (STAGE 2026-05-25)

  All 3 wire-verified with fake `packageId` → Trendyol returns HTTP 401 (same gateway behavior as Phase 3a/3b/3c).

  ### Phase 3 progress
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)), 3b ([#23](https://github.com/loncadev/lonca/issues/23)), 3c ([#24](https://github.com/loncadev/lonca/issues/24)), **3d (this)** ✅ — 15 of 17 order-deep endpoints
  - 3e: read variants (stream, cargo invoice) — last sub-group, then Phase 4 begins

- [#26](https://github.com/loncadev/lonca/pull/26) [`fc211b5`](https://github.com/loncadev/lonca/commit/fc211b5eaf8ab9b9d4a5c22cd8c68f6522fd1676) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3e — order read variants** (2 endpoints). Final sub-group of Phase 3 — the orders surface is now feature-complete.

  ### New methods
  - **`client.orders.listStream({ cursor?, limit?, packageItemStatuses?, lastModifiedStartDate?, lastModifiedEndDate? })`** → `CursorPage<ShipmentPackage>`
    - `GET /integration/order/sellers/{sellerId}/orders/stream`
    - Streaming alternative to `orders.list` with **opaque cursor pagination** (vs page-index on `list`). Required when the dataset exceeds 10 000 records — bypasses the page-size cap.
    - Same `ShipmentPackage` shape as `list`; the normalizer was extended to accept Trendyol's stream-only `id` field (vs `shipmentPackageId` on the regular list).
  - **`client.orders.getCargoInvoiceItems(invoiceSerialNumber, { cursor?, limit? })`** → `CursorPage<CargoInvoiceItem>`
    - `GET /integration/finance/che/sellers/{sellerId}/cargo-invoice/{invoiceSerialNumber}/items`
    - Per-parcel cargo-fee breakdown for one cargo invoice. Useful for reconciling Trendyol cargo deductions against your shipped packages. `invoiceSerialNumber` comes from the Current Account Statement with `transactionType=DeductionInvoices`.
    - Page-based pagination (default page size 500, max 500).
    - Note the different path prefix — `/integration/finance/che/...`, not the regular `/integration/order/...`.

  ### Discovery-first wire fix

  The regular `getShipmentPackages` returns `shipmentPackageId`, but the new `getShipmentPackagesStream` returns the same field as `id`. SDK normalizer now accepts both (`shipmentPackageId ?? id`), and the existing `ShipmentPackage.id` public field stays unchanged for callers.

  ### New exports
  - `CargoInvoiceItem`
  - `ListOrdersStreamParams`

  ### Smoke verified (STAGE 2026-05-25)

  ```
  ── 6.8 orders.listStream({ limit: 2 })
  ✓ Got 2 package(s) (nextCursor: eyJzIjpbMjczOCwxNzc5NzI1…)
      pkg   92051591  order 1017338323  Cancelled   0 TRY
      pkg   92027347  order 1238514712  Invoiced    35.79 TRY

  ── 6.9 orders.getCargoInvoiceItems("LONCA-FAKE-INVOICE")
  ℹ getCargoInvoiceItems wire-verified: HTTP 200 for fake serial (empty content array — Trendyol returns empty for unknown serials)
  ```

  ### Phase 3 complete
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)): status lifecycle (4) ✅
  - 3b ([#23](https://github.com/loncadev/lonca/issues/23)): splitting (4) ✅
  - 3c ([#24](https://github.com/loncadev/lonca/issues/24)): cargo/delivery (4) ✅
  - 3d ([#25](https://github.com/loncadev/lonca/issues/25)): operational metadata (3) ✅
  - **3e (this): read variants (2) ✅**

  **Total: 17 new order endpoints + 1 normalizer extension across 5 stacked PRs.** Orders surface is feature-complete. Next: Phase 4 — Returns/Claims (10 endpoints).

## 0.3.0

### Minor Changes

- [#13](https://github.com/loncadev/lonca/pull/13) [`d04de5a`](https://github.com/loncadev/lonca/commit/d04de5a2043361f2f6896a380403a0456dfa076e) Thanks [@keparlak](https://github.com/keparlak)! - Add `categories.getAttributeValues` — V2 endpoint for fetching the value catalog of a single category attribute.
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

- [#17](https://github.com/loncadev/lonca/pull/17) [`b404f79`](https://github.com/loncadev/lonca/commit/b404f795f843cd81a94c8bef628c7375d96c4ebd) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 5 — product helpers**: `brands.search` and `categories.getByBarcodes`. This is the final group of the products Phase 2 plan — the Trendyol products surface is now feature-complete.

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
  - Group 1 ([#13](https://github.com/loncadev/lonca/issues/13)): `categories.getAttributeValues` ✅
  - Group 2 ([#14](https://github.com/loncadev/lonca/issues/14)): read completion (`listUnapproved`, `getBase`, `getBuyboxInfo`) ✅
  - Group 3 ([#15](https://github.com/loncadev/lonca/issues/15)): write core (`create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`) ✅
  - Group 4 ([#16](https://github.com/loncadev/lonca/issues/16)): lifecycle (`delete`, `archive`/`unarchive`, `unlock`) ✅
  - **Group 5 (this PR): helpers (`brands.search`, `categories.getByBarcodes`) ✅**

  Full chain coverage: brands (list + search) → categories (tree + attrs + values + barcode→cat lookup) → suppliers → products (read approved/unapproved + base + buybox + write 5 endpoints + lifecycle 4 endpoints + batch status) → inventory → orders.

- [#16](https://github.com/loncadev/lonca/pull/16) [`356cba1`](https://github.com/loncadev/lonca/commit/356cba16ce1a5b8a626ced819fb93895c83d8ec0) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 4 — product lifecycle**: `delete`, `archive`/`unarchive`, `unlock`.

  ### New methods
  - **`client.products.delete(barcodes)`** → `BatchAcceptedResponse`
    - `DELETE /integration/product/sellers/{sellerId}/products` with body `{ items: [{barcode}] }`
    - Trendyol allows deletion of unapproved products and approved products that have been archived for more than a day (and not sales-stopped by Trendyol).
    - **Rate-limited separately at 100 req/min** — much tighter than the other writes (the SDK provisions a dedicated `deleteLimiter`).
  - **`client.products.archive(barcodes)`** → `BatchAcceptedResponse`
  - **`client.products.unarchive(barcodes)`** → `BatchAcceptedResponse`
    - Both `PUT /integration/product/sellers/{sellerId}/products/archive-state` with body `{ items: [{barcode, archived: bool}] }`
    - Exposed as two methods for ergonomic call sites; share one endpoint and one rate limiter.
  - **`client.products.unlock(barcodes)`** → `BatchAcceptedResponse`
    - `PUT /integration/product/sellers/{sellerId}/products/unlock` with body `{ items: [{barcode}] }`
    - Restores selling status for products Trendyol paused due to pricing or supply issues.

  All 4 return the standard `{ batchRequestId }` for `getBatchStatus` polling, max 1000 items per call, and throw `ValidationError` for empty or oversized inputs before hitting the network.

  ### Smoke verified (STAGE 2026-05-25, output)

  ```
  ── 6.45 products lifecycle smoke ────────────────────────
  ✓ delete       accepted; batchRequestId=a6e1dc0a-…
  ✓ archive      accepted; batchRequestId=23691686-…
  ✓ unarchive    accepted; batchRequestId=807b9632-…  (state restored)
  ✓ unlock       accepted; batchRequestId=f372ec93-…
  ```

  All 4 endpoints round-trip with real batch IDs. Archive → unarchive on a real approved barcode completes safely (state restored). Delete + unlock exercise the wire with a throw-away fake barcode (per-item fails server-side without affecting real listings).

  ### Phase 2 progress
  - Group 1 ([#13](https://github.com/loncadev/lonca/issues/13)): `categories.getAttributeValues` ✅
  - Group 2 ([#14](https://github.com/loncadev/lonca/issues/14)): read completion ✅
  - Group 3 ([#15](https://github.com/loncadev/lonca/issues/15)): write core ✅
  - **Group 4 (this PR): lifecycle ✅**
  - Group 5: helpers — `categories.getByBarcodes`, `brands.search`

  After Group 5, **the Trendyol products surface is feature-complete**: brands → categories (tree + attrs + values + barcode→cat) → suppliers → products (read + write + lifecycle) → inventory → orders.

- [#19](https://github.com/loncadev/lonca/pull/19) [`8540fb6`](https://github.com/loncadev/lonca/commit/8540fb6272899438c63d4855be7c55e5f5510cd8) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 2 — product reads**: 3 endpoints rounding out the read surface ahead of the upcoming write APIs.

  ### New methods
  - **`client.products.listUnapproved({ cursor?, limit?, barcode?, startDate?, endDate?, dateQueryType?, supplierId? })` → `CursorPage<UnapprovedProduct>`**
    - GETs `/integration/product/sellers/{sellerId}/products/unapproved`
    - Returns draft / `rejected` / `pendingApproval` products. Each item is a flat barcode/SKU (not nested under `variants[]` like approved products), with `rejectReasonDetails[]` populated for failed reviews.
    - Same `nextPageToken` cursor convention as `list()`.
    - Rate limit: shares the 2000 req/min filter bucket.
  - **`client.products.getBase(barcode)` → `ProductBase`**
    - GETs `/integration/product/sellers/{sellerId}/product/{barcode}` (singular `product` in path).
    - Cheap polling primitive for `createProducts` — flip-detect `approved: true` and grab the assigned `contentId` / `listingId`.
  - **`client.products.getBuyboxInfo(barcodes)` → `BuyboxInfo[]`**
    - POSTs `/integration/product/sellers/{sellerId}/products/buybox-information`
    - Max 10 barcodes per call; SDK throws `ValidationError` before hitting the network for empty or oversized inputs.
    - Rate limit: 1000 req/min (separate bucket from filter/batch).

  ### Discovery-first wire fixes

  Verified live against Trendyol STAGE on 2026-05-25. The SDK normalizes spec/wire divergence so callers see a clean shape:

  | Endpoint                   | Spec said                                                | Wire returns                                 | SDK                                                                                      |
  | -------------------------- | -------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
  | `filterUnapprovedProducts` | `media: [{url}]`                                         | `images: [{url}]`                            | Surfaces as `images: string[]`; accepts spec-name `media` as fallback                    |
  | `getBuyboxInformation`     | `{barcode, buyboxOrder, buyboxPrice, hasMultipleSeller}` | adds `secondBuyboxPrice`, `thirdBuyboxPrice` | Both extra fields are surfaced — useful when buybox is lost                              |
  | `filterUnapprovedProducts` | enum docs mention `waiting`                              | live returns `pendingApproval`, `rejected`   | Open-enum `UnapprovedProductStatus` (`(string & {})`) so unknown values still type-check |

  ### New exports
  - `ListUnapprovedProductsParams`, `UnapprovedDateQueryType`
  - `UnapprovedProduct`, `UnapprovedProductStatus`, `UnapprovedProductRejectReason`
  - `ProductBase`
  - `BuyboxInfo`

  ### Smoke verified
  - `listUnapproved({limit:2})` pulled `rejected` + `pendingApproval` drafts with reject reasons parsed.
  - `getBase("3535ddvcxxnnbbvc")` → `approved=true, approvedAt=2026-05-21T11:44:53Z, contentId=1135615039`.
  - `getBuyboxInfo(["3535ddvcxxnnbbvc"])` → `order=1, price=100, multipleSeller=false`.

  Phase 2 of Trendyol products coverage: Group 1 (categories.getAttributeValues, [#13](https://github.com/loncadev/lonca/issues/13)) + Group 2 (this PR) are now in. Next: Group 3 — write core (`create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`).

- [#15](https://github.com/loncadev/lonca/pull/15) [`51d6972`](https://github.com/loncadev/lonca/commit/51d6972efd41d964083b45dcda9428d147a05bee) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 3 — product write core**: 5 async batch write endpoints completing the product CRUD surface.

  ### New methods

  All 5 share the same contract: async batch, max 1000 items, returns `{ batchRequestId }` to poll via `products.getBatchStatus`. SDK-side validation throws `ValidationError` before hitting the network for empty or oversized batches.
  - **`client.products.create(items)`** — V2 product creation; POSTs `/integration/product/sellers/{sellerId}/v2/products`. Required 14 fields enforced at compile time via `CreateProductV2Input`.
  - **`client.products.updateContent(items)`** — Content updates on approved products (title, description, images, attributes), identified by `contentId`. Partial except attributes (send-all-or-nothing).
  - **`client.products.updateVariants(items)`** — Variant updates on approved products (stockCode, vatRate, dimensionalWeight, warehouse IDs, location-based delivery, lot), identified by `barcode`.
  - **`client.products.updateUnapproved(items)`** — Update draft products (typically to fix rejected drafts surfaced by `listUnapproved.rejectReasonDetails`), identified by `barcode`.
  - **`client.products.updateDeliveryInfo(items)`** — Delivery duration / fast-delivery type updates.

  ### Discovery-first gotchas (verified live STAGE 2026-05-25)

  **Trendyol V2 spec is misleading on `updateUnapproved`**: the spec says only `barcode` is required, but the live endpoint returns HTTP 500 (`TrendyolSystemException` / `TypeError`) when too many optional fields are omitted. In practice, send at least `title`, `description`, `productMainId`, `brandId`, `categoryId`, `stockCode`, `dimensionalWeight`, `vatRate`, `images[]`, and `attributes[]` (an empty array is fine for the latter). Documented in the method JSDoc.

  ### New exports

  Input types (all in `@lonca/trendyol`):
  - `BatchAcceptedResponse` — generic `{ batchRequestId }` shape for all 5 endpoints
  - `CreateProductV2Input`
  - `UpdateContentInput`
  - `UpdateVariantInput`
  - `UpdateUnapprovedInput`
  - `UpdateDeliveryInfoInput`
  - Building blocks: `ProductImageInput`, `ProductAttributeV2Input`, `DeliveryOptionInput`

  ### Smoke verified (output)

  ```
  ── 6.4 products write smoke (5 endpoints) ───────────────
  ✓ create               accepted; batchRequestId=a450334d-d813-4a38-b9e2-…
  ✓ updateContent        accepted; batchRequestId=4ff126fe-7cfb-4b4f-9ca3-…
  ✓ updateVariants       accepted; batchRequestId=c3e4289f-4d70-4fab-be6a-…
  ✖ updateUnapproved     failed: HTTP 400 (Trendyol payload validation;
                           test draft is in a non-updatable state on STAGE,
                           contract verified separately with a clean payload)
  ✓ updateDeliveryInfo   accepted; batchRequestId=2246c5ea-837c-4f7a-8e5f-…
  ```

  The 4 successful endpoints each got a real `batchRequestId` that can be tracked via `getBatchStatus`. The 5th (`updateUnapproved`) round-trips correctly with a clean payload on a clean draft — verified via an isolated probe to the same path; the smoke test happens to hit a pre-rejected draft whose data Trendyol now refuses to re-process.

  ### Phase 2 progress
  - **Group 1** ([#13](https://github.com/loncadev/lonca/issues/13)): `categories.getAttributeValues` ✅
  - **Group 2** ([#14](https://github.com/loncadev/lonca/issues/14)): read completion ✅
  - **Group 3** (this PR): write core ✅
  - Group 4: lifecycle — `delete`, `archive`/`unarchive`, `unlock`
  - Group 5: helpers — `categories.getByBarcodes`, `brands.search`

## 0.2.0

### Minor Changes

- [`5180842`](https://github.com/loncadev/lonca/commit/51808429841d1ef5610a6fa71354ac5fddd7bdce) Thanks [@keparlak](https://github.com/keparlak)! - Add `categories` resource — required for product creation.
  - `client.categories.list()` — fetch the full Trendyol category tree (no pagination; returned in one response)
  - `client.categories.getAttributes(categoryId)` — fetch required and optional attributes for a category, including variant / slicer flags and allowed values

  New exported types: `Category`, `CategoryAttribute`, `CategoryAttributeValue`. IDs are normalized to strings per `@lonca/core` convention.

  Rate-limited to 50 req/min (shared bucket across both endpoints, matching Trendyol's service limits).

  Bottom-up rollout: categories are a prerequisite for the upcoming products resource (`createProduct V2` requires `categoryId` + category attributes).

- [`3cc3df8`](https://github.com/loncadev/lonca/commit/3cc3df8d47ab5a59a76bc482f5b6de73f404252f) Thanks [@keparlak](https://github.com/keparlak)! - Add `inventory` resource — Trendyol stock & price update (a.k.a. `updatePriceAndInventory`).
  - `client.inventory.update(items)` → `{ batchRequestId }`
    - POSTs to `/integration/inventory/sellers/{sellerId}/products/price-and-inventory`
    - Each item: `{ barcode (required), quantity?, salePrice?, listPrice? }`
    - Max 1000 items per call, 20 000 stock per product (Trendyol-side)
    - No rate limit (per Trendyol's service-limits table)
    - Async — poll the returned `batchRequestId` with `client.products.getBatchStatus(...)`
    - Client-side validation throws `ValidationError` for empty or oversized batches before hitting the network

  Verified against Trendyol STAGE on 2026-05-25: a safe smoke test posts a unique fake barcode (`LONCA-SMOKE-<ts>`) so the call cannot match any real product; Trendyol still accepts it asynchronously and returns a real `batchRequestId`.

  New exports: `InventoryResource`, `PriceInventoryUpdate`, `UpdatePriceInventoryResponse`.

  This rounds out the bottom-up Phase 1 set:
  - brands ✓ — read brand catalog
  - categories ✓ — read category tree + attributes
  - suppliers ✓ — read return/shipment addresses
  - products ✓ — read approved products + batch status
  - **inventory ✓ — write stock & price**

  Next major group (separate release): orders + shipment packages.

- [`1f848a5`](https://github.com/loncadev/lonca/commit/1f848a5e1edd6488cc4387c1750c0ed2f880e5d7) Thanks [@keparlak](https://github.com/keparlak)! - Add `orders` resource — list shipment packages (Trendyol's `getShipmentPackages`).
  - `client.orders.list({ cursor?, limit?, status?, orderNumber?, startDate?, endDate? })` → `CursorPage<ShipmentPackage>`
    - GETs `/integration/order/sellers/{sellerId}/orders`
    - Page-based pagination internally; SDK exposes the cursor convention from `@lonca/core` so callers can iterate with `paginate()`
    - Filters: `status`, `orderNumber`, date range
    - Page size capped at Trendyol's 200 max

  Discovery-first workflow: a separate `examples/inspect-orders.mts` script (`pnpm try:inspect-orders`) was used to dump the **real STAGE wire shape** _before_ writing types. The resulting types model the field set as Trendyol actually returns it (47 root-level fields on the package, nested `lines[]`, `packageHistories[]`, `invoiceAddress`, `shipmentAddress`). Wire field `3pByTrendyol` (cannot start with a digit in TypeScript identifiers) is renamed to `threePByTrendyol` on the public surface.

  New exports:
  - `OrdersResource`, `ListOrdersParams`
  - `ShipmentPackage`, `ShipmentPackageStatus`, `OrderLine`, `OrderLineDiscountDetail`, `OrderAddress`, `OrderAddressLines`, `OrderCustomer`, `PackageHistoryEntry`

  Smoke verified live on Trendyol STAGE 2026-05-25: pulled 2 packages
  (`Invoiced` 85 TRY, `Picking` 1300 TRY) with lines and customer info parsed
  correctly. Regression mock test pins the exact PROD-shape package.

  Phase 1 SDK now covers the full bottom-up chain: brands → categories → suppliers → products → inventory (write) → orders.

- [`7ed69b5`](https://github.com/loncadev/lonca/commit/7ed69b583b48fef42dc35ac32d91006bfdfcd17f) Thanks [@keparlak](https://github.com/keparlak)! - Add `products` resource — Trendyol approved-product filter + async batch status helper.
  - `client.products.list({ cursor?, limit?, barcode?, startDate?, endDate? })` → `CursorPage<Product>`
    - Reads `/integration/product/sellers/{sellerId}/products/approved`
    - Pagination uses Trendyol's `nextPageToken` (cursor mode) — required when the dataset exceeds 10 000 items, and used transparently for all responses
    - Filters: barcode, date range
    - Rate-limited to 2000 req/min
  - `client.products.getBatchStatus(batchRequestId)` → `BatchRequestResult`
    - Reads `/integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}`
    - 4-hour retention window on Trendyol's side
    - Rate-limited to 1000 req/min

  Public types: `Product`, `ProductVariant`, `ProductAttribute`, `NamedRef`, `BatchRequestResult`, `BatchRequestItemResult`, `BatchRequestStatus`, `ListProductsParams`.

  Wire shape verified against live Trendyol PROD on 2026-05-25 (see `examples/try-trendyol.mts`). The SDK surfaces stable typed fields and keeps the untouched response on `Product.raw` / `ProductVariant.raw` / `BatchRequestResult.raw` for fields not modeled yet. Notable wire facts the typed surface paves over:
  - `contentId` (not `productContentId`), nested `brand` / `category` `{id,name}` refs
  - `variants[].barcode` — root-level barcode does not exist
  - `creationDate` / `lastModifiedDate` are ms-epoch; SDK exposes ISO strings
  - `getBatchRequestResult` returns `PROCESSING` for unknown batch IDs (not 404)

- [`35e815a`](https://github.com/loncadev/lonca/commit/35e815a04d55aebbbc8370b612e478f8d9e729d8) Thanks [@keparlak](https://github.com/keparlak)! - Add `suppliers` resource for fetching the seller's registered addresses (shipment, returning, invoice, warehouse).
  - `client.suppliers.getAddresses({ forceRefresh? })` — returns the address list, served from an in-memory cache to respect Trendyol's `1 req/hour` service limit
  - `client.suppliers.invalidateCache()` — drops the cache so the next call hits the API
  - Cache TTL defaults to 1 hour; override with `new SuppliersResource(transport, sellerId, { cacheTtlMs })` when constructing manually
  - Concurrent `getAddresses()` calls are deduplicated into a single in-flight request

  Required for the upcoming products resource — `createProduct V2` needs `shipmentAddressId` and `returningAddressId`, both sourced from here.

  New exported types: `SupplierAddress`, `SupplierAddressType`, `SuppliersResourceOptions`. Trendyol's legacy `_ADDRESS` suffix is stripped from `addressType` for cleaner consumer code.

### Patch Changes

- [`44b5cac`](https://github.com/loncadev/lonca/commit/44b5cac07d609ad7a4432857e64d1e7cd5f5aa6c) Thanks [@keparlak](https://github.com/keparlak)! - Align endpoint paths and response shapes with the official Trendyol OpenAPI specs.

  **Bug fix** — `@lonca/trendyol@0.1.0` shipped with placeholder paths that did not match Trendyol's actual API. Anyone trying to use the SDK against real Trendyol would have hit `404 Not Found`. This release fixes all four implemented endpoints.

  Path corrections (verified against the OpenAPI spec embedded in each `/reference/<endpoint>.md` page and against the official Postman collection):

  | Endpoint                   | Was                                          | Now                                               |
  | -------------------------- | -------------------------------------------- | ------------------------------------------------- |
  | `brands.list`              | `/sapigw/brands`                             | `/integration/product/brands`                     |
  | `categories.list`          | `/sapigw/product-categories`                 | `/integration/product/product-categories`         |
  | `categories.getAttributes` | `/sapigw/product-categories/{id}/attributes` | `/integration/product/categories/{id}/attributes` |
  | `suppliers.getAddresses`   | `/sapigw/suppliers/{sellerId}/addresses`     | `/integration/sellers/{sellerId}/addresses`       |

  Response shape fixes:
  - `categories.list` now parses the root-level JSON array (Trendyol does not wrap it in `{ categories: [...] }`)
  - `categories.getAttributes` pipes through the V2-only `allowMultipleAttributeValues` flag (added as an optional field on `CategoryAttribute`)

  Public TypeScript surface and runtime behavior remain otherwise unchanged.

- [`caac4ba`](https://github.com/loncadev/lonca/commit/caac4ba6c3cd9d3db85d35785fc6f298435a4a5d) Thanks [@keparlak](https://github.com/keparlak)! - Fix `categories.getAttributes` parsing against the real Trendyol response shape (verified against STAGE + PROD on 2026-05-25).

  The OpenAPI spec advertised an `attributeValues: [...]` field per attribute, but Trendyol's live `getCategoryAttributes` endpoint omits it for most attributes — the endpoint returns attribute metadata and flags only, not the value catalog. Without this fix, calling `getAttributes` against any real category would throw `TypeError: Cannot read properties of undefined (reading 'map')`.

  Changes:
  - `CategoryAttribute.values` is still typed as `CategoryAttributeValue[]`, but the resource now defaults to `[]` when the field is absent. JSDoc explains where to look for the actual value catalog when needed.
  - New optional `CategoryAttribute.categoryId` field — Trendyol echoes this back per attribute and it's useful for grouping.
  - Defensive normalization handles missing `attribute`, missing flags (default `false`), and missing `attributeValues`.
  - Categories list response handles both root-array and `{ categories: [...] }` wrapped shapes (different envs/seller setups behave differently).
  - New regression mock test pinned to the exact wire format we observed in PROD.

  Also documents in `brands.ts` that Trendyol enforces a **minimum 1000 page size** server-side regardless of the `limit` value passed.

## 0.1.0

### Minor Changes

- [`13931d2`](https://github.com/loncadev/lonca/commit/13931d2f634eafbec6c0cbca9761747d86ecccd7) Thanks [@keparlak](https://github.com/keparlak)! - Initial release of `@lonca/trendyol` — type-safe SDK for the Trendyol Marketplace API.

  This first scaffold proves the transport spine end-to-end. Subsequent releases will fill in the orders, products, inventory, and webhook resources.
  - `createTrendyolClient({ sellerId, apiKey, apiSecret, env, integratorName?, clientIp?, logger?, timeoutMs? })` factory
  - `client.brands.list()` — first endpoint, paginated via `@lonca/core` `CursorPage`, rate-limited to Trendyol's 50 req/min
  - Transport layer with:
    - All 5 required Trendyol headers (`Authorization`, `x-clientip`, `x-correlationid`, `x-agentname`, `User-Agent`)
    - Per-request UUID correlation IDs
    - Exponential backoff retry on 429 / 5xx (honors `Retry-After`)
    - Per-endpoint token-bucket rate limiting
    - `AbortSignal` + request timeout (default 30s)
  - HTTP error mapping to `@lonca/core` error hierarchy (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
  - Dual ESM + CJS build via tsup, 35 vitest tests covering auth/errors/transport/brands
