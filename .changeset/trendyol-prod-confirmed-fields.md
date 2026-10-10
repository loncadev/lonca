---
'@lonca/trendyol': minor
---

Map the fields Trendyol actually sends for locations, supplier addresses and category attributes, checked against the docs and the prod wire baseline (2026-10-10). Fields the SDK used to read but that neither the docs nor prod ever carry stay on the public types, now `@deprecated` (no type was removed or narrowed).

- `Neighborhood.postCode` (new): the neighborhood's postal code, present on prod neighborhood rows (not in the docs). `Neighborhood.code` is deprecated (neighborhood rows have no code; it always equals `id`) and `Neighborhood.districtCode` is deprecated (always `undefined`).
- `District.cityCode` is deprecated: district rows carry no city reference, so it was always `undefined`. `District.code` keeps reading the wire `code`.
- `SupplierAddress` gains `fullAddress`, `country`, `cityCode` and `districtId` (documented and present on prod). `SupplierAddress.name` and `fullName` are deprecated (Trendyol sends neither; use `fullAddress`).
- `suppliers.getAddresses()` now upper-cases `addressType` before matching, so the documented `Shipment` / `Invoice` / `Returning` values map to `SHIPMENT` / `INVOICE` / `RETURNING`. Before, mixed-case values fell back to `SHIPMENT`.
- `CategoryAttribute.values` is deprecated and always `[]`: `getAttributes` has no inline value list (no `attributeValues` in the docs or on prod). Use `categories.getAttributeValues(categoryId, attributeId)`.
