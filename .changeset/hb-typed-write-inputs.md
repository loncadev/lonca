---
'@lonca/hepsiburada': minor
---

Typed field hints for the remaining passthrough write inputs (Faz 1.6). All 17 `Record<string, unknown>` input aliases now carry spec-sourced field hints intersected with `Record<string, unknown>` — common fields autocomplete while undocumented ones still pass through (non-breaking).

- **Catalog** (`mpop-catalog.json`): `PreMatchActionInput` and `CheckProductStatusInput` are now `MerchantSkuGroup[] | MerchantSkuGroup` — the spec takes an array of `{ merchant, merchantSkuList }` groups (new exported `MerchantSkuGroup` type); plain objects still pass through.
- **Orders** (`oms-external.json`): `LaborCostInput` (`unitLaborCost`), `InvoiceLinkInput` (`invoiceLink`, `serialNumber`, `rowNumber`, `arrangementDate`, `invoices` — new exported `InvoiceLinkItem` type), `ParcelInfoInput` (`totalDesi`, `totalParcel`), `WarehouseInput` (`shippingAddressLabel`).
- **Promotions** (`diskonto-external.json`): `CreateTlDiscountInput`, `CreatePercentDiscountInput`, `CreateXyDiscountInput` (name/date/condition/budget/discount fields per campaign type), `CancelDiscountInput` (`campaignId`).
- **Questions** (`asktoseller-merchant.json`): `CreateQuestionInput` (`issueCount`), `AnswerQuestionInput` (`Answer`, `Files` — the endpoint is `multipart/form-data` per spec), `RejectQuestionInput` (`rejectReason`, `rejectConversationId`).
- **Suppliers** (`supplier-api-external.json`): `OpenPurchaseOrderSearchInput`, `SupplierListingSearchInput`, `ListingUpdateRequestSearchInput`, `CreateListingUpdateRequestInput` — full filter/offer field sets, with new exported `PurchaseOrderType`, `PurchaseOrderLineRef`, and `CreateListingUpdateRequestItem` types and open unions for spec enums (`currencyCode`, `listingType`, `status`, `purchaseOrderTypes`).

No runtime changes — types and JSDoc only. No inputs remain passthrough-only: every one of the 17 had a curated spec definition.
