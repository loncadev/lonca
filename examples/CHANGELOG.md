# @lonca/examples

## 0.0.10

### Patch Changes

- Updated dependencies [[`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe), [`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe), [`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe)]:
  - @lonca/core@0.3.0
  - @lonca/hepsiburada@0.9.0
  - @lonca/trendyol@0.10.0

## 0.0.9

### Patch Changes

- Updated dependencies [[`67cc6b4`](https://github.com/loncadev/lonca/commit/67cc6b45998f8dfd81576f99293bf490e02bc70a)]:
  - @lonca/trendyol@0.9.0

## 0.0.8

### Patch Changes

- Updated dependencies [[`082cb9c`](https://github.com/loncadev/lonca/commit/082cb9cd1dadefb0351844ee0e2fb781d36ddaf4)]:
  - @lonca/core@0.2.0
  - @lonca/hepsiburada@0.8.0
  - @lonca/trendyol@0.8.0

## 0.0.7

### Patch Changes

- Updated dependencies [[`bfb18b5`](https://github.com/loncadev/lonca/commit/bfb18b56f4e38c7593e0f0184779d327b80e67dc)]:
  - @lonca/hepsiburada@0.7.0
  - @lonca/trendyol@0.7.0

## 0.0.6

### Patch Changes

- [#51](https://github.com/loncadev/lonca/pull/51) [`1efd1c5`](https://github.com/loncadev/lonca/commit/1efd1c50fdf0d044b11e264b7e178989fe9f40a3) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2d — webhook event parser + casing regression tests + live smoke script

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

- Updated dependencies [[`1efd1c5`](https://github.com/loncadev/lonca/commit/1efd1c50fdf0d044b11e264b7e178989fe9f40a3)]:
  - @lonca/hepsiburada@0.6.0

## 0.0.5

### Patch Changes

- Updated dependencies [[`68e9ce2`](https://github.com/loncadev/lonca/commit/68e9ce26733ca1a107b791f6e7aa75d6310c3362)]:
  - @lonca/trendyol@0.6.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`26dc975`](https://github.com/loncadev/lonca/commit/26dc975b96dda78032965f246ca146329e4622fe), [`90810f8`](https://github.com/loncadev/lonca/commit/90810f8210ea1cb0de57c2671b09551835282e89), [`b18538e`](https://github.com/loncadev/lonca/commit/b18538e8d5805be142cdfcf51690938a38628580), [`86c27d8`](https://github.com/loncadev/lonca/commit/86c27d8b82d6e0b6b493a67f0afcbd2ee789c8af), [`b6d50fe`](https://github.com/loncadev/lonca/commit/b6d50fe3817322072c81e7b545e2a709c40b1887)]:
  - @lonca/trendyol@0.5.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`04c4fbd`](https://github.com/loncadev/lonca/commit/04c4fbd1282c5fa3282e839e3dc980bb7668ec69), [`bfaf03c`](https://github.com/loncadev/lonca/commit/bfaf03ce2aa5e1b704aca479e736205fb737c540), [`248a4da`](https://github.com/loncadev/lonca/commit/248a4da507aed465bb3db5be37ee4d786c976203), [`f944ca1`](https://github.com/loncadev/lonca/commit/f944ca1a436b0750cb380b248dbb01a018714ad5), [`fc211b5`](https://github.com/loncadev/lonca/commit/fc211b5eaf8ab9b9d4a5c22cd8c68f6522fd1676)]:
  - @lonca/trendyol@0.4.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`d04de5a`](https://github.com/loncadev/lonca/commit/d04de5a2043361f2f6896a380403a0456dfa076e), [`b404f79`](https://github.com/loncadev/lonca/commit/b404f795f843cd81a94c8bef628c7375d96c4ebd), [`356cba1`](https://github.com/loncadev/lonca/commit/356cba16ce1a5b8a626ced819fb93895c83d8ec0), [`8540fb6`](https://github.com/loncadev/lonca/commit/8540fb6272899438c63d4855be7c55e5f5510cd8), [`51d6972`](https://github.com/loncadev/lonca/commit/51d6972efd41d964083b45dcda9428d147a05bee)]:
  - @lonca/trendyol@0.3.0

## 0.0.1

### Patch Changes

- Updated dependencies [[`44b5cac`](https://github.com/loncadev/lonca/commit/44b5cac07d609ad7a4432857e64d1e7cd5f5aa6c), [`caac4ba`](https://github.com/loncadev/lonca/commit/caac4ba6c3cd9d3db85d35785fc6f298435a4a5d), [`5180842`](https://github.com/loncadev/lonca/commit/51808429841d1ef5610a6fa71354ac5fddd7bdce), [`3cc3df8`](https://github.com/loncadev/lonca/commit/3cc3df8d47ab5a59a76bc482f5b6de73f404252f), [`1f848a5`](https://github.com/loncadev/lonca/commit/1f848a5e1edd6488cc4387c1750c0ed2f880e5d7), [`7ed69b5`](https://github.com/loncadev/lonca/commit/7ed69b583b48fef42dc35ac32d91006bfdfcd17f), [`35e815a`](https://github.com/loncadev/lonca/commit/35e815a04d55aebbbc8370b612e478f8d9e729d8)]:
  - @lonca/trendyol@0.2.0
