---
'@lonca/trendyol': minor
---

Add **Group 3 — product write core**: 5 async batch write endpoints completing the product CRUD surface.

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

- **Group 1** (#13): `categories.getAttributeValues` ✅
- **Group 2** (#14): read completion ✅
- **Group 3** (this PR): write core ✅
- Group 4: lifecycle — `delete`, `archive`/`unarchive`, `unlock`
- Group 5: helpers — `categories.getByBarcodes`, `brands.search`
