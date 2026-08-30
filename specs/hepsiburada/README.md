# Hepsiburada OpenAPI collection

Per-service OpenAPI 3.0.3 documents for the Hepsiburada Marketplace APIs, generated from the
API definitions published on the [Hepsiburada developer portal](https://developers.hepsiburada.com).

## Provenance and licence

- **Source**: the "API definitions" of seven portal products (`siparis-olusturma-entegrasyonu`,
  `katalog-urun-entegrasyonu`, `urun-guncelleme-entegrasyonu`, `tedarikci-entegrasyonu`,
  `muhasebe-entegrasyonu`, `saticiya-sor-entegrasyonu`, `satici-promosyonu-entegrasyonu`),
  exported as one record per operation while the `@lonca/hepsiburada` SDK was being built
  ("Phase 2b", [#46](https://github.com/loncadev/lonca/pull/46)).
- **Captured**: 2026-05-31 (export timestamp). The portal's own per-operation `updatedAt`
  values range from 2026-05-04 to 2026-05-12 and are preserved as `x-lonca-portal-updated-at`.
- **Copyright**: the API definitions are © Hepsiburada (D-Market Elektronik Hizmetler ve
  Ticaret A.Ş.). They are redistributed here **unchanged** — apart from the structural
  normalisation listed below — for interoperability with the published API, and they are
  **not** covered by this repository's MIT licence. If you represent Hepsiburada and want any
  of these files removed or corrected, open an issue and they will be taken down promptly.
- The raw export is deliberately not tracked in git (`hb-phase2b-*.json` is git-ignored);
  only this curated form is.

## Files

| File                         | Portal product                   | Server (sandbox, as published)                         | Paths | Ops | Schemas | Auth         |
| ---------------------------- | -------------------------------- | ------------------------------------------------------ | ----: | --: | ------: | ------------ |
| `oms-external.json`          | `siparis-olusturma-entegrasyonu` | `https://oms-external-sit.hepsiburada.com`             |    27 |  28 |      55 | Basic        |
| `mpop-catalog.json`          | `katalog-urun-entegrasyonu`      | `https://mpop-sit.hepsiburada.com/product`             |    14 |  14 |      28 | Basic        |
| `mpop-product-updates.json`  | `urun-guncelleme-entegrasyonu`   | `https://mpop-sit.hepsiburada.com/ticket-api`          |     3 |   3 |       8 | Bearer (JWT) |
| `supplier-api-external.json` | `tedarikci-entegrasyonu`         | `https://supplier-api-external-sit.hepsiburada.com`    |     5 |   5 |      25 | Basic        |
| `mpfinance-external.json`    | `muhasebe-entegrasyonu`          | `https://mpfinance-external-sit.hepsiburada.com`       |     2 |   2 |       0 | Basic        |
| `asktoseller-merchant.json`  | `saticiya-sor-entegrasyonu`      | `https://api-asktoseller-merchant-sit.hepsiburada.com` |     5 |   6 |      16 | Basic        |
| `diskonto-external.json`     | `satici-promosyonu-entegrasyonu` | `https://diskonto-external-sit.hepsiburada.com`        |     9 |   9 |      16 | Basic        |
| `manifest.json`              | —                                | index of the files above                               |       |     |         |              |

67 operations in total. Production hosts are not published in the portal definitions; the SDK
uses the same host names without the `-sit` suffix (see `sdks/hepsiburada/src/transport.ts`).

## What was kept and what was changed

Each portal record is `{ data, parameters, requestBody, responses, components, linkedGuide }`.
The generator keeps the operation content verbatim and only changes structure:

**Kept as published**: `summary`/`title`, `description` (Turkish, some Markdown/HTML),
`operationId`, `tags`, `deprecated`, `parameters` (with `schema`), `requestBody` content
types and schemas, all documented `responses` with their schemas, and every schema in
`components.schemas` that an operation references (transitively — in practice every schema
the portal ships per product is referenced, so nothing was pruned).

**Structural normalisation** (portal record → OpenAPI object):

- `responses` array → map keyed by status code; `content` arrays → maps keyed by media type.
- `null`-valued fields (`example`, `description`, `bearerFormat`, ...) are omitted — the
  portal never populated an `example`.
- The portal's per-operation `security` entry (`{type: http, scheme: basic|bearer, in: query}`)
  becomes a `components.securitySchemes` entry (`basicAuth` / `bearerAuth`) referenced from the
  operation; the meaningless `in`/`name` fields of an `http` scheme are dropped.
- `servers[0].url` is **derived** from the portal's cURL code sample (the definitions carry no
  `servers` block); it is the sandbox (SIT) host.
- `x-lonca-source` (product/category slugs, capture date) and `x-lonca-portal-updated-at`
  are added.

**Left out**: portal record identifiers (`id`, `companyId`, `categoryId`, `productId`,
`versionId`), the generated `codeExamples` (cURL/JS/Python/PHP/C#/Go/Java boilerplate per
operation — derivable from the spec), `linkedGuide` (always `null` in the export), and the
abbreviated `data.parameters`/`data.responses` duplicates of the full top-level fields.
Nothing else non-OpenAPI (portal HTML, navigation) was present in the export.

## Validation

- Every file parses, every `$ref` resolves inside the same file, every `{param}` in a path
  template is declared as an `in: path` parameter, every operation has at least one response
  (`scripts/specs/split-hepsiburada.mjs` refuses to write a file with a dangling `$ref`).
- `redocly lint --extends=minimal` (Redocly CLI 2.x): **valid**, 47 warnings. The `recommended`
  ruleset additionally flags things that come straight from the upstream definition and are
  kept on purpose:
  - `operation-operationId-url-safe` (20 ops in `supplier-api-external`, `asktoseller-merchant`,
    `diskonto-external`): the portal uses Turkish titles such as `"Sepet İndirimi İptali"` as
    `operationId`. Code generators will need to rename these.
  - `no-enum-type-mismatch` (2 params of `GET /api/categories/get-all-categories`): declared
    `type: boolean` with `enum: ["true", "false", ""]`.
  - `operation-4xx-response` (24 ops document only a `200`), `tag-description` (portal tags have
    no description), `info-license` (omitted on purpose; see licence above).

## SDK coverage (`@lonca/hepsiburada`)

Generated by `node scripts/specs/coverage-hepsiburada.mjs` against `sdks/hepsiburada/src/resources`.
Matching is by method + path (case-insensitive, path parameters collapsed, spec path prefixed
with its server base path).

| SDK resource      | SDK service      | Spec file                    | Spec host                                      | SDK ops matched / spec ops                        |
| ----------------- | ---------------- | ---------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `accounting`      | `oms`            | `mpfinance-external.json`    | `mpfinance-external-sit.hepsiburada.com`       | 1 / 2                                             |
| `catalog`         | `mpop`           | `mpop-catalog.json`          | `mpop-sit.hepsiburada.com/product`             | 11 / 14                                           |
| `categories`      | `mpop`           | `mpop-catalog.json`          | `mpop-sit.hepsiburada.com/product`             | 3 / 14                                            |
| `claims`          | `oms+claim-stub` | _none_                       | —                                              | 0 / — (6 SDK ops without a spec)                  |
| `listings`        | `listing`        | _none_                       | —                                              | 0 / — (18 SDK ops without a spec)                 |
| `orders`          | `oms`            | `oms-external.json`          | `oms-external-sit.hepsiburada.com`             | 28 / 28                                           |
| `product-updates` | `oms`            | `mpop-product-updates.json`  | `mpop-sit.hepsiburada.com/ticket-api`          | 3 / 3 (3 matched by path only, base path differs) |
| `promotions`      | `oms`            | `diskonto-external.json`     | `diskonto-external-sit.hepsiburada.com`        | 9 / 9                                             |
| `questions`       | `oms`            | `asktoseller-merchant.json`  | `api-asktoseller-merchant-sit.hepsiburada.com` | 6 / 6                                             |
| `shipping`        | `shipping`       | _none_                       | —                                              | 0 / — (4 SDK ops without a spec)                  |
| `suppliers`       | `oms`            | `supplier-api-external.json` | `supplier-api-external-sit.hepsiburada.com`    | 5 / 5                                             |
| `test-orders`     | `oms-stub`       | _none_                       | —                                              | 0 / — (1 SDK ops without a spec)                  |

Spec operations implemented by the SDK: **66 / 67**.

### Spec operations not implemented by the SDK

| Spec file                 | Operation                             | Summary                                                          |
| ------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `mpfinance-external.json` | `GET /orders/merchantid/{merchantId}` | Performans Servisi — per-order/per-product financial performance |

(Not to be confused with the `oms-external` operation of the same path, which `orders.list()`
implements.)

### SDK operations without a spec

The developer portal does not publish an API definition for these services; the SDK methods
were built from the portal's prose guides and live probing. They are the first candidates for
`x-lonca-observed` definitions once the portal publishes them or a capture becomes available.

| SDK resource  | SDK service         | Operations                                                                                                                                                                                                                             |
| ------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listings`    | `listing`           | `GET /listings/merchantid/{}`, `GET /buybox-orders/merchantid/{}`, `GET /commissions/merchantid/{}`, the five `*-uploads` POST/GET pairs, `sku/{}/activate`, `sku/{}/deactivate`, `sku/{}/merchantsku/{}` (POST/DELETE), `bulk-unlock` |
| `claims`      | `oms`, `claim-stub` | `GET /claims/merchantid/{}`, `GET /claims/merchantid/{}/status/{}`, `POST /claims/number/{}/accept`, `.../reject`, `.../preapprovalconfirm`, `POST /claims/merchant/{}/create`                                                         |
| `shipping`    | `shipping`          | `GET /cargofirms/{}`, `GET /profiles/{}`, `POST /profile/createbymerchantid`, `PUT /profile/updatebymerchantid`                                                                                                                        |
| `test-orders` | `oms-stub`          | `POST /orders/merchantid/{}`                                                                                                                                                                                                           |

The export's inventory listed one more portal product, `talep-entegrasyonu` (claims), with a
single operation (`POST /claims/merchant/{merchantid}/create`), but its full definition was not
part of the capture, so there is no `claims` file yet.

### Host discrepancy worth knowing

The SDK routes `accounting`, `suppliers`, `questions`, `promotions` and `product-updates`
through its `oms` service (`oms-external[-sit].hepsiburada.com`), whereas the portal's code
samples target dedicated hosts (`mpfinance-external`, `supplier-api-external`,
`api-asktoseller-merchant`, `diskonto-external`) and, for product updates,
`mpop[-sit].hepsiburada.com/ticket-api`. The paths match; whether `oms-external` proxies these
routes has not been verified as part of this collection.

## Regenerating

```bash
# split a fresh portal export into specs/hepsiburada/*.json (+ manifest.json)
node scripts/specs/split-hepsiburada.mjs path/to/hb-phase2b-full.json --captured-at 2026-05-31

# exit 1 if the tracked files no longer match the export (drift check)
node scripts/specs/split-hepsiburada.mjs path/to/hb-phase2b-full.json --captured-at 2026-05-31 --check

# SDK coverage table (Markdown; add --json for machine-readable output)
node scripts/specs/coverage-hepsiburada.mjs

# optional structural lint (no local install needed)
pnpm --package=@redocly/cli@2 dlx redocly lint --extends=minimal specs/hepsiburada/*.json
```

Both scripts are plain Node (>= 18) with no dependencies. Output is deterministic (sorted
paths, canonical method order, sorted schema names, 2-space JSON) so a regeneration from an
unchanged export produces no diff; `specs/**/*.json` is excluded from prettier to keep it that
way.
