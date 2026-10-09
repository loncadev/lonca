# Probe snapshots

Committed structural baselines produced by [`scripts/probe/run.mts`](../scripts/probe/run.mts)
(`pnpm probe`). Each `<marketplace>.json` holds, per probe, the response **shape** — key sets
and JSON types — and never a value. Regenerate with `pnpm probe`, review the diff, commit.
Format and drift rules are documented in [`scripts/probe/README.md`](../scripts/probe/README.md).

| File               | Environment | Captured   | Result          | Wire baseline (`wire`) |
| ------------------ | ----------- | ---------- | --------------- | ---------------------- |
| `hepsiburada.json` | prod        | 2026-08-30 | 12 ok / 0 error | not yet — see below    |
| `trendyol.json`    | prod        | 2026-08-30 | 9 ok / 0 error  | not yet — see below    |

Both baselines were regenerated against **production** (read-only GETs) in #139, when the SDKs
were verified for 1.0.0; the earlier SIT (Hepsiburada) and stage-placeholder (Trendyol) captures
are only in git history.

## Notes

### Wire baseline pending

Wire capture (the per-probe `wire` list that [`pnpm drift`](../packages/drift/) compares with
`specs/`) was added after these files were captured, so neither snapshot has a `wire` field
yet. `pnpm probe:check` treats that as "no wire baseline yet" (a warning, not drift) and
`pnpm drift` exits 0 with a message. To record the first wire baseline, run against prod from a
checkout with a valid `.env` (`HB_ENV=prod`, `TY_ENV=prod`):

```bash
pnpm build && pnpm probe   # rewrites both files: shape (unchanged contract) + wire
pnpm drift                 # then review drift-output/report.md
```

Review the diff before committing — `wire` must contain only spec path templates or `{}`-redacted
paths, key names and JSON types.

### Trendyol stage is IP-allowlisted

Trendyol `stage` sits behind a Cloudflare IP allowlist: every request from an unlisted address
gets `403 text/html` (surfaced by the SDK at the time as `ValidationError` / `VALIDATION_FAILED`). That is
why the first Trendyol capture (2026-08-30, stage) recorded nine identical 403 errors and no
shapes, and why the baseline is taken from `prod` (every probe is a GET). `pnpm probe:check`
still prints a warning when a baseline has no successful probe, and flags an environment
mismatch (`stage` baseline vs `prod` run) as drift.

### Hepsiburada host discrepancy (roadmap 2.1a — RESOLVED by 1.7b)

**Resolved 2026-08-30**: `sdks/hepsiburada/src/transport.ts` now carries `mpfinance`,
`supplier-api`, `asktoseller` and `diskonto` service entries, `productUpdates` moved to
`mpop` under the `/ticket-api` base path, `questions.*` sends the required `merchantId`
header (paging with `page`/`size`), `accounting.listTransactions` sends the spec's
PascalCase `Offset`/`Limit` (plus the required date-range/identifier filters), and
`promotions.listDiscounts` sends the required `page`/`pagesize`. The rerouted read probes
now all answer 200 (the baseline above is 12 ok / 0 error). Remaining SIT quirks, not SDK
bugs: `promotions.listDiscounts` / `getLimits` answer a server-side 500
(`"Beklenmedik bir hata oluştu."`) and `getBudgets` resets the connection for the sandbox
merchant regardless of parameters (likely no self-campaign enrollment);
`suppliers.*` answers a route-level 404 `errorCode E4201` ("Tedarikçi bulunamadı") because
the sandbox merchant is not enrolled as a supplier; `promotions.listCategories` has
answered both 6 rows and an empty array within seconds on SIT, so its baseline shape is
`array` with no item shape.

The original evidence (pre-fix), kept for history — `pnpm probe:hosts`
(`scripts/probe/host-check.mts`) called each SDK read method as-is and then raw-GET the
same path on both hosts with the SDK's exact header set. SIT, 2026-08-30, status codes
only:

| Resource       | SDK call                                          | SDK result (via `oms-external-sit`) | Raw GET on spec host                                                                     | Spec file                    |
| -------------- | ------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| accounting     | `accounting.listTransactions({offset:0,limit:1})` | `NOT_FOUND` 404 (json)              | `mpfinance-external-sit` **400** (problem+json) with `Offset=0&Limit=1`                  | `mpfinance-external.json`    |
| suppliers      | `suppliers.getListingUpdateRequest(<uuid>)`       | `AUTH_FAILED` 401 (json)            | `supplier-api-external-sit` **404** (json) for a bogus id                                | `supplier-api-external.json` |
| questions      | `questions.list({offset:0,limit:1})`              | `AUTH_FAILED` 401 (json)            | `api-asktoseller-merchant-sit` **200** (json) with `page=0&size=1` + `merchantId` header | `asktoseller-merchant.json`  |
| promotions     | `promotions.listCategories()`                     | `AUTH_FAILED` 401 (json)            | `diskonto-external-sit` **200** (json)                                                   | `diskonto-external.json`     |
| promotions     | `promotions.listDiscounts()`                      | `AUTH_FAILED` 401 (json)            | `diskonto-external-sit` **500** (json) with `page=0&pagesize=1`                          | `diskonto-external.json`     |
| productUpdates | `productUpdates.getUpdateStatus(<uuid>)`          | `AUTH_FAILED` 401 (json)            | `mpop-sit/ticket-api` **200** (json)                                                     | `mpop-product-updates.json`  |

Reading:

- **The spec hosts serve these paths; `oms-external` does not.** `oms-external` answers 401 to
  every one of them (404 for `/transactions`), i.e. the credentials are fine for OMS but the
  route is not there, whereas the dedicated hosts either return data (200) or a
  route-specific error (400 bad parameters, 404 unknown id, 500 for `discounts` with a page
  size of 1).
- `accounting`: the spec expects `Offset`/`Limit` (capitalised, both required) on
  `mpfinance-external`; the SDK sends `offset`/`limit` to `oms-external`. Both host and
  parameter casing need to change.
- `questions`: the spec marks a `merchantId` header as required on `api-asktoseller-merchant`
  and pages with `page`/`size`; the SDK sends neither the header nor those parameter names.
- `productUpdates`: the spec base URL includes the `/ticket-api` prefix on `mpop`; the SDK's
  `mpop` base URL has no prefix, so the resource needs its own service entry (or a path prefix).
- `promotions` / `suppliers`: same paths, different host.

The SDK fix landed with roadmap item 1.7b (`fix(hepsiburada)` host-routing PR); this
directory records the evidence and the post-fix baseline.
