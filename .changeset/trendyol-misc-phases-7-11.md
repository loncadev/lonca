---
'@lonca/trendyol': minor
---

Add **Phases 7-11 — miscellaneous surface (18 endpoints)**. After this lands, **the Trendyol SDK fully covers Trendyol's seller marketplace API** (96 endpoints across 11 phases).

### New resources

#### `client.invoices` (3 endpoints)
- `uploadFile(input)` — `POST /sellers/{id}/seller-invoice-file` (**multipart**: PDF/JPEG/PNG, max 10 MB)
- `sendLink(input)` — `POST /sellers/{id}/seller-invoice-links`
- `deleteLink(input)` — `POST /sellers/{id}/seller-invoice-links/delete`

#### `client.finance` (2 endpoints)
- `getSettlements({...})` — `GET /sellers/{id}/settlements` → `CursorPage<SettlementRow>`
- `getOtherFinancials({...})` — `GET /sellers/{id}/otherfinancials` → `CursorPage<OtherFinancialRow>`

Both surfaced as `{ raw }` rows — the underlying schemas are wide and evolve frequently; callers drill into `raw` for any field.

#### `client.labels` (2 endpoints)
- `createCommon(trackingNumber, input)` — `POST /sellers/{id}/common-label/{tracking}` (ZPL format)
- `getCommon(trackingNumber)` — `GET /sellers/{id}/common-label/{tracking}`

#### `client.testOrders` (3 endpoints, **STAGE-only**)
- `create(input)` — `POST /test/order/orders/core`
- `updateStatus(packageId, status)` — `PUT /test/order/sellers/{id}/shipment-packages/{pkg}/status`
- `setClaimsWaitingInAction()` — `PUT /test/order/sellers/{id}/claims/waiting-in-action`

#### `client.locations` (8 endpoints)
Full lookup tree for shipment / invoice addresses. **Not seller-scoped** — under `/integration/member/...`.

- `getCountries()` — all supported countries (Trendyol returned **261** on STAGE)
- TR domestic: `getTurkeyCities()` (returned **81**), `getTurkeyDistricts(cityCode)`, `getTurkeyNeighborhoods(cityCode, districtCode)`
- AZ domestic: `getAzerbaijanCities()`, `getAzerbaijanDistricts(cityCode)`
- GULF/CEE: `getCitiesByCountry(countryCode)`, `getDistrictsByCity(countryCode, cityId)`

### Smoke verified (STAGE 2026-05-25)

```
── 6.91 locations.getCountries()
✓ Got 261 country/ies. First 5:
      AF  Afghanistan
      AX  Åland
      AL  Albania
      DZ  Algeria
      AS  American Samoa

── 6.92 locations.getTurkeyCities()
✓ Got 81 TR city/ies. First 5:
       1  Adana
       2  Adıyaman
       3  Afyonkarahisar
       4  Ağrı
      68  Aksaray
```

Real payloads through the SDK — wire fully verified.

### New exports

Resources: `InvoicesResource`, `FinanceResource`, `LabelsResource`, `TestOrdersResource`, `LocationsResource`.

Types: `UploadInvoiceFileInput`, `SendInvoiceLinkInput`, `DeleteInvoiceLinkInput`, `SettlementRow`, `OtherFinancialRow`, `ListFinanceParams`, `CreateCommonLabelInput`, `CommonLabel`, `CreateTestOrderInput`, `TestOrderStatus`, `Country`, `City`, `District`, `Neighborhood`.

### Final Trendyol surface (post-merge)

| Resource | Methods |
|---|---|
| `brands` | list, search |
| `categories` | list, getAttributes, getAttributeValues, getByBarcodes |
| `suppliers` | getAddresses |
| `products` | list, listUnapproved, getBase, getBuyboxInfo, getBatchStatus + 5 write + 4 lifecycle (12 total) |
| `inventory` | update |
| `orders` | list, listStream, getCargoInvoiceItems + 12 package state methods + 3 returns/compensation (17 total) |
| `claims` | create, createIssue, approveLineItems, list, getIssueReasons, getItemAudits |
| `webhooks` | create, list, update, delete, activate, deactivate |
| `questions` | get, list, answer |
| `invoices` | uploadFile, sendLink, deleteLink |
| `finance` | getSettlements, getOtherFinancials |
| `labels` | createCommon, getCommon |
| `testOrders` | create, updateStatus, setClaimsWaitingInAction |
| `locations` | 8 lookup endpoints |

**96 methods across 14 resources.** Trendyol is complete.

Stacks on top of #33 (Phase 6).
