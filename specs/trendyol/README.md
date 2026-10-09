# Trendyol OpenAPI collection

Per-service OpenAPI 3.0.3 documents for the Trendyol Marketplace (seller integration) API, built
from the documentation published on the [Trendyol developer portal](https://developers.trendyol.com)
(TR-domestic edition).

## Provenance and licence

- **Source**: the portal is a ReadMe site. Every page of its "API Reference" section embeds
  the OpenAPI 3.0.3 document of the page's **API definition**, filtered down to that page's
  operation (visible in each page's Markdown rendering, `<page>.md`, under `# OpenAPI
definition`). [`scripts/specs/fetch-trendyol.mjs`](../../scripts/specs/fetch-trendyol.mjs)
  reads the portal's machine-readable index (`/llms.txt`), downloads all 93 reference pages
  and the 97 TR guide pages, and writes one capture file;
  [`scripts/specs/build-trendyol.mjs`](../../scripts/specs/build-trendyol.mjs) merges the
  pages of each definition back into one document. So this is **not** a hand transcription:
  apart from the additions listed below, operations, parameters, bodies, responses and
  schemas are Trendyol's own published definitions, byte-for-byte.
- **Captured**: 2026-10-09. The portal's per-page `updatedAt` values range from 2026-01-27 to
  2026-08-25 and are preserved per operation as `x-lonca-portal-updated-at`; every operation
  also carries `x-lonca-doc-url`, the reference page it came from.
- **One definition is compiled by hand**: the video API (`video.json`) is documented only as a
  prose guide, with no reference page. It is written out in
  [`scripts/specs/trendyol/source.mjs`](../../scripts/specs/trendyol/source.mjs) field by field
  from [that guide](https://developers.trendyol.com/docs/seller-integration-video-api) (tables,
  example request and response), and nothing in it comes from the SDK.
- **Copyright**: the API definitions are © Trendyol (DSM Grup Danışmanlık İletişim ve Satış
  Ticaret A.Ş.). They are redistributed here for interoperability with the published API, with
  only the normalisation and the additions described below. They are **not** covered by this
  repository's MIT licence. If you represent Trendyol and want any of these files removed or
  corrected, open an issue and they will be taken down promptly. The scripts, this README and
  `manifest.json` are Lonca's own work (MIT).
- The capture file (`trendyol-reference-capture*.json`, about 1.3 MB) is git-ignored, the same
  way as the Hepsiburada export. Unlike that export, anyone can re-create it with
  `pnpm specs:trendyol:fetch`. The fetch reads only the public documentation site. It calls no
  Trendyol API and needs no credentials.

### Why the hand-maintained input is a `.mjs` module

The only hand-written input is `scripts/specs/trendyol/source.mjs`: the definition-to-file map,
the `User-Agent` header, the video definition and the probe-to-schema map. It is plain
JavaScript, not YAML or JSON, for these reasons:

- the repo has no YAML parser and the build scripts stay dependency-free;
- comments can explain every non-obvious choice, such as where a type came from;
- eslint and prettier check it like the rest of `scripts/`;
- reviewers see ordinary diffs.

## Files

Trendyol groups its reference pages into **API definitions** (the `info.title` of each page's
embedded document, and the `## API Reference: …` headings of `llms.txt`). Each definition is
one file here, named with a short English slug of the definition title. The slugs are listed in
`SERVICES` in `source.mjs`. Every service is served from the same host, so a definition cannot
be named after its host as on Hepsiburada. A portal definition with no file mapping fails the
build, so a new group can never be silently dropped.

| File                             | Portal API definition                                       | Base path (`servers[0]`)   | Paths | Ops | Schemas | Observed props |
| -------------------------------- | ----------------------------------------------------------- | -------------------------- | ----: | --: | ------: | -------------: |
| `cargo-invoice.json`             | Trendyol Yurtiçi Kargo Faturası Detayları Entegrasyonu      | `/integration/finance/che` |     1 |   1 |       3 |              0 |
| `common-label.json`              | Trendyol Marketplace - Ortak Etiket Barkod Entegrasyonu     | `/integration`             |     1 |   2 |       2 |              0 |
| `current-account-statement.json` | Trendyol Yurtiçi Cari Hesap Ekstresi Entegrasyonu           | `/integration/finance/che` |     3 |   3 |       7 |              1 |
| `customer-questions.json`        | Trendyol Pazaryeri - Müşteri Soruları Entegrasyonu          | `/integration`             |     3 |   3 |       4 |              1 |
| `export-center.json`             | Trendyol İhracat Merkezi (AutoFT) Entegrasyonu              | `/integration/ecgw`        |    12 |  13 |      12 |              0 |
| `invoice.json`                   | Fatura Entegrasyonu (Invoice Integration)                   | `/integration`             |     3 |   3 |       3 |              0 |
| `marketplace.json`               | Trendyol Marketplace Entegrasyonu (orders, claims, address) | `/integration`             |    34 |  34 |       4 |             64 |
| `product.json`                   | Trendyol Marketplace - Ürün Entegrasyonu API                | `/integration`             |    23 |  23 |      62 |              8 |
| `seller-info.json`               | Trendyol Marketplace - Satıcı Bilgileri Entegrasyonu        | `/integration`             |     1 |   1 |       2 |              0 |
| `test-order.json`                | Trendyol Test Sipariş API'si (stage only)                   | `/integration`             |     3 |   3 |       0 |              0 |
| `trendyol-express.json`          | Trendyol Express Entegrasyonu                               | `/integration`             |     1 |   1 |       3 |              0 |
| `video.json`                     | _guide_: Video Oluşturma / Listeleme Servisi                | `/integration/video`       |     1 |   2 |       4 |              0 |
| `webhook.json`                   | Trendyol Webhook API'si                                     | `/integration/webhook`     |     4 |   6 |       0 |              2 |
| `manifest.json`                  | index of the files above (generated)                        |                            |       |     |         |                |

There are **95 operations** in total: 93 come from reference pages and 2 come from the video
guide. Servers are given exactly as each definition publishes them: production
`https://apigw.trendyol.com/…` and stage `https://stageapigw.trendyol.com/…`. The AutoFT
definition lists stage first, and the test-order API is stage-only. For `video.json` the guide
gives only the production URL, so the stage server is derived from the portal's
[environment page](https://developers.trendyol.com/docs/3-canl%C4%B1-test-ortam-bilgileri),
which says so in its `description`.

## What was kept and what was changed

**Kept as published**: `info` (title, description, version, contact) and the upstream
extension keys `x-owner-team` and `x-domain-key`. Also `servers`, `security`, `tags` and all
operation fields (`tags`, `summary`, `description`, `operationId`, `parameters`, `requestBody`,
`responses`, `security`, `x-module-key`, examples), plus every `components` entry
(`schemas`, `parameters`, `responses`, `securitySchemes`). Authentication is HTTP Basic
(`apiKey:apiSecret`) as each definition declares it. Some definitions also publish an
`apiKeyAuth` alternative, and it is kept.

**Structural normalisation**:

- The per-page documents of one definition are merged back together: paths, the union of
  `tags`, and the union of `components`. The build fails if two pages disagree on a shared
  schema, tag, `info`, `servers` or `security`. In this capture none do.
- ReadMe's rendering switch `x-readme` (`proxy-enabled`) is dropped.
- Paths are sorted, methods use canonical order, tags and component names are sorted, and the
  output is 2-space `JSON.stringify`.

**Lonca additions** (all `x-lonca-*` or clearly documented):

- `info.x-lonca-source` (definition, page count, capture date, latest page `updatedAt`,
  generator), and per operation `x-lonca-doc-url` and `x-lonca-portal-updated-at`.
- **`User-Agent` header**: the portal's
  [Authorization guide](https://developers.trendyol.com/docs/2-authorization) makes it
  mandatory on every request (requests without it get 403). The value is
  `"{sellerId} - {IntegratorName}"`, or `"{sellerId} - SelfIntegration"` if you wrote the
  integration yourself; the integrator name is alphanumeric, at most 30 characters. No
  reference page declares this header, so the build adds `components.parameters.UserAgent`
  (with `x-lonca-doc-url`) and references it from every operation.
- **`x-lonca-observed`**: properties seen in **production** responses that are missing from
  the reference schema. The source is the committed contract-probe baseline
  [`probe-snapshots/trendyol.json`](../../probe-snapshots/trendyol.json), env `prod`, which
  stores key sets and JSON types only and never values. For the 7 read probes whose SDK
  result keeps the untouched wire object (`raw`), the build walks that shape against the
  documented 200 schema. Each missing key becomes a property typed from the observed JSON
  type, with `nullable` when `null` was seen. Keys seen only as `null` get no type. The
  property carries `x-lonca-observed: true`. If the same key appears in the example payload
  of that operation's prose guide, it also gets `x-lonca-guide-example: <guide url>`. That
  means it is documented by example, just not in the reference schema.
- **`x-lonca-observed-types`** is set on a documented property when the observed JSON types
  don't fit its documented type. The documented type itself is left unchanged.
- `info.x-lonca-observed-source` names the snapshot on every file that received observations.

Observation totals:

- 76 properties added: 64 in `marketplace.json`, 8 in `product.json`, 2 in `webhook.json`,
  and 1 each in `customer-questions.json` and `current-account-statement.json`.
- 69 of those 76 appear in a guide's example payload, which shows how thin some reference
  schemas are compared with their guides. For example, `ShipmentPackage` has no
  `packageHistories`, `orderDate` or the line-level price breakdown.
- 7 properties are not documented anywhere:
  - `FinancialTransaction.currency`
  - TR city `code`
  - `ApprovedVariant.dimensionalWeight`, `.locationBasedDelivery` and
    `.specialConsumptionTax`
  - webhook `countryCodes` and `storeFrontCode`
- 4 type mismatches:
  - `ShipmentPackage.shipmentNumber` and `.cargoTrackingNumber` are documented as `string`
    but observed as `number`.
  - `ShipmentPackage.taxNumber` and the claim item's `orderOutboundPackageId` are documented
    as non-nullable but observed as `null`.
- No **operation** is `x-lonca-observed`: every endpoint the SDK calls is documented by
  Trendyol.

The probes for `brands.list` and `categories.list` return SDK-normalised objects with no
`raw`, so they cannot be compared field by field. Write endpoints are never probed.

## Validation

- The build refuses to write a file with a dangling or external `$ref`, a path template
  `{param}` that is not declared `in: path`, or an operation without responses.
- `@apidevtools/swagger-cli@4.0.4 validate`: all 13 documents **valid**.
- `redocly lint --extends=minimal` (Redocly CLI 2.62.1): **0 errors**, 24 warnings. Every
  warning comes from the upstream definitions:
  - `no-ambiguous-paths` (15): for example `…/shipment-packages/{packageId}` next to
    `…/shipment-packages/manual-return-by-tracking-number/{cargoTrackingNumber}`.
  - `no-invalid-media-type-examples` (5): published examples that contradict their own
    schema (`cargoTrackingNumber`, `executorUser`, and test-order `microRegion`).
  - `operation-operationId-url-safe` (3): `getTürkeyCities`, `getTürkeyDistricts` and
    `getTürkeyNeighborhoods`.
  - `no-schema-type-mismatch` (1): a Trendyol Express `type: object` with `items`.

  Under `recommended`, the `operationId` and type-mismatch findings become errors (4). The
  remaining findings are `info-license` (omitted on purpose; see licence above) and
  `operation-4xx-response`. They are kept as published.

## SDK coverage (`@lonca/trendyol`)

Generated by `node scripts/specs/coverage-trendyol.mjs` against `sdks/trendyol/src/resources`.
Matching is by method + path, with path parameters and template expressions collapsed and the
spec path prefixed with its server base path. Private path and request helpers in the SDK
(`packagePath`, `webhookPath`, `submitWrite`, `queryPage`, `cities`, …) are expanded first.

| SDK resource    | Spec file                        | Base path                  | SDK ops matched / spec ops |
| --------------- | -------------------------------- | -------------------------- | -------------------------- |
| `brands`        | `product.json`                   | `/integration`             | 2 / 23                     |
| `categories`    | `product.json`                   | `/integration`             | 3 / 23                     |
| `categories`    | `export-center.json`             | `/integration/ecgw`        | 1 / 13                     |
| `claims`        | `marketplace.json`               | `/integration`             | 6 / 34                     |
| `export-center` | `export-center.json`             | `/integration/ecgw`        | 12 / 13                    |
| `finance`       | `current-account-statement.json` | `/integration/finance/che` | 2 / 3                      |
| `inventory`     | `product.json`                   | `/integration`             | 1 / 23                     |
| `invoices`      | `invoice.json`                   | `/integration`             | 3 / 3                      |
| `labels`        | `common-label.json`              | `/integration`             | 2 / 2                      |
| `locations`     | `marketplace.json`               | `/integration`             | 8 / 34                     |
| `orders`        | `marketplace.json`               | `/integration`             | 19 / 34                    |
| `orders`        | `cargo-invoice.json`             | `/integration/finance/che` | 1 / 1                      |
| `orders`        | `trendyol-express.json`          | `/integration`             | 1 / 1                      |
| `products`      | `product.json`                   | `/integration`             | 14 / 23                    |
| `questions`     | `customer-questions.json`        | `/integration`             | 3 / 3                      |
| `suppliers`     | `seller-info.json`               | `/integration`             | 1 / 1                      |
| `test-orders`   | `test-order.json`                | `/integration`             | 3 / 3                      |
| `videos`        | `video.json`                     | `/integration/video`       | 2 / 2                      |
| `webhooks`      | `webhook.json`                   | `/integration/webhook`     | 6 / 6                      |

- **SDK operations with a spec: 90 / 90.** Every HTTP call the SDK makes is described,
  including the corrected webhook path `/integration/webhook/sellers/{sellerId}/webhooks`.
- **Spec operations implemented by the SDK: 90 / 95.**

### Spec operations not implemented by the SDK

| Spec file                        | Operation                                                                                  | operationId                         |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| `current-account-statement.json` | `GET /sellers/{sellerId}/payment-order`                                                    | `getPaymentOrders`                  |
| `marketplace.json`               | `PUT /order/sellers/{sellerId}/shipment-packages/{packageId}/alternative-delivery-digital` | `processAlternativeDeliveryDigital` |
| `product.json`                   | `GET /product/lookup/cargo-providers`                                                      | `getCargoProviders`                 |
| `product.json`                   | `POST /product/sellers/{sellerId}/brands`                                                  | `createBrand`                       |
| `product.json`                   | `GET /product/sellers/{sellerId}/products/{contentId}/update-audits`                       | `getUpdateAudits`                   |

### SDK ↔ documentation discrepancies found while compiling

Coverage only matches method + path. Comparing request and response shapes is out of scope
for the script, but compiling `video.json` surfaced two SDK issues worth a follow-up:

- **`videos.list()`**: the guide documents the response as `{ meta, data: [...] }`. The SDK
  reads rows from a bare array, `content` or `items`, so on the documented shape it returns
  `[]`.
- **`SellerIntegrationStatus`**: the SDK type lists `WAITING | IN_PROGRESS | COMPLETED |
FAILED`. The guide documents `IN_PROGRESS | SUCCESS | FAILED`.

## Known gaps

- **TR-domestic edition only.** The English (`/v2.0/`) and international (`/v3.0/`) editions
  of the portal are not captured.
- **Endpoints documented only in guides, and not called by the SDK, are not compiled**:
  - stage IP whitelist management (`/product/sellers/{id}/ip-whitelists`)
  - stage customer-question creation (`POST /qna/sellers/{id}/questions`)
  - warranty documents (`/sellers/{id}/warranty-documents`)
  - EU product-label common labels (`/sellers/{id}/common-labels/{ctn}/with-product-labels`)
  - the legacy V1 product endpoints (`/product/sellers/{id}/products` POST/PUT, and
    `/product/product-categories/{id}/attributes`)
  - `…/v2/orders`, which the `getShipmentPackages` guide mentions
  - the `manual-deliver` URLs in the alternative-delivery guide

  The reference section documents the current equivalents of the last two.

- **Observations cover 7 read endpoints only.** No write endpoint and no other read endpoint
  is cross-checked against production. Observed property types are JSON types, so a
  `number` is never narrowed to `integer`. The snapshot depth cap (6) means deeply nested
  objects are described only down to that level.
- **Upstream quirks are kept, not fixed**. For example:
  - Path parameter names differ between definitions (`{Id}`, `{CityCode}`,
    `{claimItemsId}`).
  - The test-order API takes `sellerID` as a header.
  - Some published examples contradict their schemas (see Validation).

## Regenerating

```bash
# 1. capture the portal (writes trendyol-reference-capture.json, git-ignored)
pnpm specs:trendyol:fetch          # = node scripts/specs/fetch-trendyol.mjs --out trendyol-reference-capture.json

# 2. build specs/trendyol/*.json + manifest.json (capturedAt = the capture's fetch date)
pnpm specs:trendyol:build          # = node scripts/specs/build-trendyol.mjs trendyol-reference-capture.json

# drift check: exit 1 if the tracked files no longer match the capture. Without
# --captured-at it reuses the committed manifest date, so a fresh capture + --check
# reports only content changes on the portal (or in source.mjs / the probe snapshot).
pnpm specs:trendyol:check

# SDK coverage table (Markdown; add --json for machine-readable output)
pnpm specs:trendyol:coverage

# optional structural lint (no local install needed)
pnpm --package=@redocly/cli@2 dlx redocly lint --extends=minimal specs/trendyol/[!m]*.json
```

Build options: `--out DIR`, `--captured-at YYYY-MM-DD`, `--probe FILE`, and `--no-probe` to
skip the observation pass. If a captured guide page is newer than the version a hand-compiled
definition was checked against (`compiledAgainst` in `source.mjs`), the build prints a
warning. All three scripts are plain Node (>= 22 for the fetch, which uses global `fetch`) with
no dependencies. Output is deterministic, so rebuilding from an unchanged capture produces no
diff. `specs/**/*.json` is excluded from prettier to keep it that way.
