# @lonca/hepsiburada

## 0.1.0

### Minor Changes

- [#40](https://github.com/loncadev/lonca/pull/40) [`ded94fa`](https://github.com/loncadev/lonca/commit/ded94fa2a3c879cdd74bb1cc46650f7199bfaab6) Thanks [@keparlak](https://github.com/keparlak)! - Initial release — `@lonca/hepsiburada` 0.1.0 with **Listings (Phase 1a)** surface.

  ### What's in 0.1.0

  New top-level package + `createHepsiburadaClient({ merchantId, username, password, env, integratorName })` factory. Multi-service base URL resolution: each resource tags which Hepsiburada service it talks to (`listing` / `oms` / `shipping` / `claim-stub` / `oms-stub`), and the transport picks the matching `*-external[-sit]` hostname per environment.

  `client.listings` — 18 typed endpoints from the official OpenAPI spec at `developers.hepsiburada.com/api/v1/public/docs/hepsiburada/listeleme/v1/openapi`:

  | Method                                                           | Path                                                  |
  | ---------------------------------------------------------------- | ----------------------------------------------------- |
  | `list({offset, limit, ...})`                                     | `GET /listings/merchantid/{id}`                       |
  | `getBuyboxOrder(skuList?)`                                       | `GET /buybox-orders/merchantid/{id}`                  |
  | `getCommissions(skuList?)`                                       | `GET /commissions/merchantid/{id}`                    |
  | `activate(hbSku)` / `deactivate(hbSku)`                          | `POST /listings/.../sku/{sku}/{activate\|deactivate}` |
  | `updateSingle(hbSku, mSku, {...})`                               | `POST /listings/.../sku/{sku}/merchantsku/{mSku}`     |
  | `deleteSingle(hbSku, mSku)`                                      | `DELETE /listings/.../sku/{sku}/merchantsku/{mSku}`   |
  | `bulkUnlock({hbSkuList})`                                        | `POST /listings/.../bulk-unlock`                      |
  | `uploadInventory/Stock/Price/ShippingInfo/AdditionalInfo(items)` | `POST /listings/.../{kind}-uploads`                   |
  | `getInventoryUpload/StockUpload/...`                             | `GET /listings/.../{kind}-uploads/id/{id}`            |

  All five bulk uploads return `{ id }` synchronously; poll the matching `get*Upload(id)` to read the outcome (status + per-row errors + price validations for price uploads). Hepsiburada retains upload results for 24+ hours.

  ### Robustness
  - Retry with exponential backoff on 429 (`Retry-After` honored) and 5xx
  - Per-resource `TokenBucketRateLimiter` (default 600 req/min on listings — Hepsiburada doesn't publish per-endpoint limits)
  - Structured errors via `@lonca/core` — auth/rate-limit/not-found/validation/server/network/timeout
  - Client-side validation: empty / >1000-item bulk uploads, `list({offset≥0, limit≥1})`, empty `bulkUnlock` — all throw `ValidationError` before hitting the wire
  - `User-Agent` built automatically as `{merchantId} - {integratorName}` (Hepsiburada rejects requests without one)
  - `AbortSignal` support throughout

  ### Test coverage

  41/41 mock tests pin the documented paths, query keys (hyphenated `salable-listings`/`notsalable-listings`), raw-array body envelopes (Hepsiburada uses bare arrays for bulk uploads, not `{items:[...]}`), error normalization, and every `ValidationError` edge.

  ### Not in 0.1.0 (gaps)

  Only 5 of Hepsiburada's 20 published API products have machine-readable OpenAPI specs today. The other 15 (catalog + product creation/update, orders, fulfilment, suppliers, e-invoice, tickets, etc.) are doc-only on the developer portal. Plan:
  - **0.2.0 — Phase 1b** — Shipping (4 endpoints), Claims read+create (6), Test-order utility (1) → small additions, all spec-backed
  - **0.3.0+** — Catalog / product / order / supplier surfaces, which need either Hepsiburada to publish the missing specs or sandbox credentials for discovery-first probing (the same wire-verify pattern that built `@lonca/trendyol`)

  See [`sdks/hepsiburada/README.md`](./sdks/hepsiburada/README.md) for the full surface + an end-to-end bulk-price-update walkthrough.
