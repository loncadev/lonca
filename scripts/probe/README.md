# Contract probes

Read-only, deterministic probes that call the main read endpoints of each marketplace SDK
against a live account and reduce every response to its **structure** — the key set of each
object level and the JSON type(s) seen at each position. The structures are committed under
[`probe-snapshots/`](../../probe-snapshots/) and re-checked nightly by
[`.github/workflows/contract-probe.yml`](../../.github/workflows/contract-probe.yml); a
difference is the drift signal (roadmap Faz 2.3 / 2.4).

## Usage

```bash
pnpm probe                       # run every probe set that has credentials, write probe-snapshots/*.json
pnpm probe:check                 # run, compare with the committed snapshots, exit 1 on drift
pnpm probe -- --only trendyol    # one marketplace (repeatable)
pnpm probe:hosts                 # Hepsiburada host-discrepancy report (SIT only, see below)
```

Credentials are read from the environment; the root scripts load `.env` when it exists
(`tsx --env-file-if-exists=.env`). The variable names are the ones in
[`.env.example`](../../.env.example): `HB_MERCHANT_ID`, `HB_API_USER`, `HB_API_PASS`, `HB_ENV`,
`HB_INTEGRATOR_NAME` and `TY_SELLER_ID`, `TY_API_KEY`, `TY_API_SECRET`, `TY_ENV`,
`TY_INTEGRATOR_NAME`. A marketplace whose required variables are absent is **skipped**, not
failed (`--require-credentials` turns that into exit code 2 for CI).

| Flag                    | Effect                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `--check`               | Compare fresh shapes with `probe-snapshots/` instead of writing them.       |
| `--update`              | Write `probe-snapshots/` (the default when `--check` is absent).            |
| `--only <marketplace>`  | Restrict to `hepsiburada` or `trendyol`. Repeatable.                        |
| `--out-dir <dir>`       | Where fresh snapshots, timings and `report.md` go. Default `probe-output/`. |
| `--require-credentials` | Exit 2 when a selected marketplace has no credentials.                      |

Exit codes: `0` no drift, `1` drift detected (or no committed snapshot), `2` usage /
credentials / internal error.

## What is probed

Every probe is a single SDK read call with a small page size (10). No probe calls an
upload, create, update, delete or "test order" method.

| Hepsiburada                                      | Trendyol                                |
| ------------------------------------------------ | --------------------------------------- |
| `listings.list`                                  | `products.list`                         |
| `catalog.listProducts`                           | `orders.list`                           |
| `catalog.listProductsByStatus(MATCHED)`          | `categories.list`                       |
| `orders.list`                                    | `brands.list`                           |
| `categories.list`                                | `locations.getTurkeyCities`             |
| `categories.getAttributes` (first leaf category) | `questions.list`                        |
| `claims.list`                                    | `claims.list`                           |
| `questions.list`                                 | `finance.getSettlements(Sale, last 7d)` |
| `shipping.getCargoFirms`                         | `webhooks.list`                         |
| `shipping.listProfiles`                          |                                         |
| `accounting.listTransactions`                    |                                         |

Add a probe by appending `{ name, call }` to the registry in `probes/<marketplace>.mts`; the
name is the snapshot key, so keep it stable.

## Snapshot format

`probe-snapshots/<marketplace>.json` (2-space JSON, keys sorted, excluded from prettier):

```jsonc
{
  "$comment": "…",
  "marketplace": "hepsiburada",
  "env": "sit",
  "shapeOptions": { "maxDepth": 6, "maxKeys": 80 },
  "probes": {
    "orders.list": {
      "status": "ok", // ok | error | skipped
      "shape": {
        "types": ["object"],
        "keys": {
          "items": {
            "types": ["array"],
            "items": {
              "types": ["object"],
              "keys": { "orderNumber": { "types": ["string"] }, "…": {} },
            },
          },
          "totalCount": { "types": ["number"] },
        },
      },
    },
    "questions.list": {
      "status": "error",
      "httpStatus": 401,
      "errorName": "AuthError",
      "errorCode": "AUTH_FAILED",
    },
  },
}
```

- `types` is the sorted union of JSON types (`string | number | boolean | null | array | object`)
  observed at that position.
- Arrays are summarised by the union of their element shapes (`items`); element counts are not
  recorded. An empty array has no `items`.
- Depth is capped at 6 (`depthCapped: true` marks the cut) and keys at 80 per level
  (`droppedKeys: n`).
- Errors are recorded as `{ httpStatus, errorName, errorCode }` from `LoncaError` only — never
  the message or response body, which marketplaces routinely fill with echoed request data.
- Timings go to `probe-output/<marketplace>.timings.json`, not the snapshot, so a re-run with an
  unchanged contract is byte-identical.

**PII is handled structurally**: values never leave the process. A customer name becomes
`"customerName": { "types": ["string"] }`; an address becomes its key set. There is no
masking step to get wrong.

## Drift detection

`--check` compares the fresh shape of each probe with the committed one and reports:

- `added` / `removed` — a key exists on one side only;
- `type-changed` — the non-null type set differs (`string` → `number`, `object` → `array`);
- probe status changes (`ok` → `error`, HTTP status or `errorCode` changed);
- environment mismatch (`stage` baseline checked against `prod`).

Those block (exit 1). `nullability` (only the presence of `null` differs) is printed for
information but does not block — with a 10-row sample a nullable field is often `null` in one
run and populated in the next. Array element shapes are compared only when both sides saw at
least one element; an empty page is data churn, not drift.

Known limitation: a key that is only present on some rows (e.g. a cancellation field) can
appear or disappear with the sample. When that happens, `pnpm probe` and commit the widened
snapshot; the merged key set only grows. Finer-grained comparison against `specs/` is roadmap
Faz 4.

## Nightly workflow

`.github/workflows/contract-probe.yml` runs `pnpm probe:check --require-credentials` at 03:00
UTC (and on `workflow_dispatch`). On drift it uploads `probe-output/` as an artifact and opens
an issue titled **Contract drift detected** labelled `drift` — or comments on the open one, so
there is never more than one. It needs the ten `HB_*` / `TY_*` repository secrets listed above
and only runs in `loncadev/lonca`.

Note that Trendyol `stage` is behind an IP allowlist (Cloudflare 403 for unlisted addresses);
either allowlist the runner egress or point `TY_ENV` at `prod` — all probes are GETs.

## Host discrepancy report (`host-check.mts`)

Roadmap 2.1a. For the Hepsiburada resources the SDK routes via the `oms` host
(`accounting`, `suppliers`, `questions`, `promotions`, `productUpdates`) while the portal's
OpenAPI documents put them on dedicated hosts, the script calls the SDK method as-is and then
raw-GETs the same path on both the SDK host and the spec host with the SDK's exact header set.
It prints a Markdown table of status codes only and refuses to run when `HB_ENV` is not `sit`.
The findings are recorded in [`probe-snapshots/README.md`](../../probe-snapshots/README.md).
