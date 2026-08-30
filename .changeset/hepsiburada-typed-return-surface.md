---
'@lonca/hepsiburada': minor
---

No method returns `Promise<unknown>` any more. The 29 remaining return types are now modelled from the developer-portal specs (`specs/hepsiburada/*.json`), or resolve to the shared `MutationResult` (`{ raw }`) envelope from `@lonca/core` when the API documents no body worth typing (bare string, `204`, `{ success }` only, or no published spec):

- `orders.createPackages` → `PackageReceipt` (`{ packageNumber?, barcode?, raw }` — the spec's `CreateDeliveryResponse`).
- `orders.splitPackage` / `unpackPackage` / `markPackageInTransit` / `markPackageDelivered` / `markPackageUndelivered` / `cancelLineItem` / `updateLineItemCargoCompany` / `updateLineItemLaborCost` / `updatePackageCargoCompany` / `sendInvoiceLink` / `updateParcelInfo` / `updatePackageWarehouse` → `MutationResult`.
- `promotions.createTlDiscount` / `createPercentDiscount` / `createXyDiscount` → `DiscountReceipt` (`{ success?, campaignId?, raw }`); `promotions.cancelDiscount` → `MutationResult`.
- `questions.create` / `answer` / `reject` → `MutationResult` (`create`'s documented `number[]` body is on `raw`).
- `shipping.createProfile` / `updateProfile` and `testOrders.create` → `MutationResult` (no portal response schema).
- `suppliers.searchOpenPurchaseOrders` → `SupplierSearchResult<OpenPurchaseOrder>`, `searchSupplierListings` → `SupplierSearchResult<SupplierListing>`, `searchListingUpdateRequests` → `SupplierSearchResult<ListingUpdateRequestSummary>` (`{ totalCount?, items, message?, errorCode?, raw }`, unwrapped from the supplier API's `{ data, message, errorCode }` envelope); `getListingUpdateRequest` → `ListingUpdateRequestDetail` (`requestItems[]` with per-field approval statuses); `createListingUpdateRequest` → `ListingUpdateRequestReceipt` (`{ id?, raw }`).

Migration is one line per call site — `unknown` already forced a cast, so `(await x) as T` becomes `(await x).raw`, or read the typed fields directly.

`categories.list` is now `OffsetPage`-aligned: `CatalogPage<T>` extends `OffsetPage<T>` (`items`, `totalCount`, `limit`, `offset`, `pageCount`), so it plugs straight into `paginateOffset`, and `ListCategoriesParams` accepts `offset` / `limit` as an alias of `page` / `size` (`offset` must be a multiple of `limit` — the API pages by number). The Spring fields it exposed before (`data`, `totalElements`, `totalPages`, `number`, `numberOfElements`, `first`, `last`, `success`, `code`, `message`) are still returned but **deprecated** and will be removed in a later minor: migrate `.data` → `.items`, `.totalElements` → `.totalCount`, `.totalPages` → `.pageCount`.

`CatalogProduct.id` is now optional (`id?: string`) instead of an `''` placeholder — `catalog.listProductsByStatus` rows carry no id on the wire. Guard with `if (product.id)` wherever the empty string was relied on.
