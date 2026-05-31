---
'@lonca/hepsiburada': minor
'@lonca/examples': patch
---

feat(hepsiburada): Phase 2d — webhook event parser + casing regression tests + live smoke script

No new resources or endpoints. Three quality-of-life additions on top of
the 0.5.0 surface:

**Webhook event helper** (`parseHepsiburadaWebhookEvent`)

Hepsiburada uses endpoint-per-event webhooks (different from Trendyol's
body-discriminated single-endpoint model). The SDK now ships:

- `parseHepsiburadaWebhookEvent(event, rawBody)` — validates the event
  name + JSON body, throws `ValidationError` on bad input, returns a
  typed `{ event, body, raw }` envelope.
- `OrderWebhookEvent` / `ClaimWebhookEvent` / `HepsiburadaWebhookEvent`
  union types for compile-time switch exhaustiveness.
- `ORDER_WEBHOOK_EVENTS` / `CLAIM_WEBHOOK_EVENTS` /
  `HEPSIBURADA_WEBHOOK_EVENTS` runtime arrays for route registration.

Covers all 12 documented events: 8 order events (`createOrder`,
`createPackages`, `orderCancel`, `unpack`, `intransit`, `deliver`,
`undeliver`, `changeShippingAddressOrder`) and 4 claim events
(`awaitingAction`, `awaitingPreApproval`, `disputedClaimResult`,
`packageFromClaimResult`). Per-event body shapes are typed as
`Record<string, unknown>` — Hepsiburada documents fields in HTML tables;
the SDK keeps body loose and exposes the raw payload via `.raw`.

**Casing regression tests**

The Phase 2c discovery that listing-external is case-sensitive while
oms-external is case-insensitive lives in `__tests__/casing-regression.ts`
now. The tests pin the exact path string each resource emits so a future
refactor can't unintentionally flip casing back and silently break a
production integration.

**Live smoke script** (`examples/try-hepsiburada.mts`)

Read-only walkthrough that hits one endpoint per resource against the
configured `HB_ENV` (default `sit`). Reports `✓ 200`, `🔒 401/403` (path
recognized, scope missing — production should work), and `✖ unexpected`
per call. Mirrors the existing `pnpm try:trendyol` flow.

Wire up: `pnpm try:hepsiburada` + new `@lonca/hepsiburada` workspace dep
in `@lonca/examples`.

Verification:
- 180 mock tests pass (36 new: 22 webhook + 14 casing regression).
- typecheck + ESM/CJS/DTS build + prettier all green.
- Live SIT smoke run against sandbox merchant returns expected
  shape (200 for in-scope endpoints, 401 for out-of-scope, no behaviour
  regressions vs 0.5.0).
