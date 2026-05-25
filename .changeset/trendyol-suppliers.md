---
'@lonca/trendyol': minor
---

Add `suppliers` resource for fetching the seller's registered addresses (shipment, returning, invoice, warehouse).

- `client.suppliers.getAddresses({ forceRefresh? })` — returns the address list, served from an in-memory cache to respect Trendyol's `1 req/hour` service limit
- `client.suppliers.invalidateCache()` — drops the cache so the next call hits the API
- Cache TTL defaults to 1 hour; override with `new SuppliersResource(transport, sellerId, { cacheTtlMs })` when constructing manually
- Concurrent `getAddresses()` calls are deduplicated into a single in-flight request

Required for the upcoming products resource — `createProduct V2` needs `shipmentAddressId` and `returningAddressId`, both sourced from here.

New exported types: `SupplierAddress`, `SupplierAddressType`, `SuppliersResourceOptions`. Trendyol's legacy `_ADDRESS` suffix is stripped from `addressType` for cleaner consumer code.
