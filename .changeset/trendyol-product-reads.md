---
'@lonca/trendyol': minor
---

Add **Group 2 — product reads**: 3 endpoints rounding out the read surface ahead of the upcoming write APIs.

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

| Endpoint | Spec said | Wire returns | SDK |
|---|---|---|---|
| `filterUnapprovedProducts` | `media: [{url}]` | `images: [{url}]` | Surfaces as `images: string[]`; accepts spec-name `media` as fallback |
| `getBuyboxInformation` | `{barcode, buyboxOrder, buyboxPrice, hasMultipleSeller}` | adds `secondBuyboxPrice`, `thirdBuyboxPrice` | Both extra fields are surfaced — useful when buybox is lost |
| `filterUnapprovedProducts` | enum docs mention `waiting` | live returns `pendingApproval`, `rejected` | Open-enum `UnapprovedProductStatus` (`(string & {})`) so unknown values still type-check |

### New exports

- `ListUnapprovedProductsParams`, `UnapprovedDateQueryType`
- `UnapprovedProduct`, `UnapprovedProductStatus`, `UnapprovedProductRejectReason`
- `ProductBase`
- `BuyboxInfo`

### Smoke verified

- `listUnapproved({limit:2})` pulled `rejected` + `pendingApproval` drafts with reject reasons parsed.
- `getBase("3535ddvcxxnnbbvc")` → `approved=true, approvedAt=2026-05-21T11:44:53Z, contentId=1135615039`.
- `getBuyboxInfo(["3535ddvcxxnnbbvc"])` → `order=1, price=100, multipleSeller=false`.

Phase 2 of Trendyol products coverage: Group 1 (categories.getAttributeValues, #13) + Group 2 (this PR) are now in. Next: Group 3 — write core (`create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`).
