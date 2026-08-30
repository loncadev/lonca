---
'@lonca/trendyol': minor
---

The last eleven `Promise<unknown>` methods now return a typed result. Where Trendyol
documents a response body the SDK surfaces it as a small typed interface (every one
of them extends `MutationResult`, so `.raw` is still the untouched body and the
documented field is optional); where the docs show a bare `200 OK` the method
returns `MutationResult` (`{ raw: unknown }`) from `@lonca/core`:

- `webhooks.create` → `CreateWebhookResult` (`{ id?: string }`, documented `{ id }`)
- `webhooks.update` / `delete` / `activate` / `deactivate` → `MutationResult`
- `questions.answer` → `AnswerQuestionResult` (`{ answerId?: number }`, documented `{ answerId }`)
- `videos.create` → `CreateVideoResult` (`{ videoId?: string }`, documented `{ videoId }`)
- `labels.createCommon` → `MutationResult`
- `testOrders.create` → `CreateTestOrderResult` (`{ orderNumber?: string }`, documented `{ orderNumber }`)
- `testOrders.updateStatus` / `setClaimsWaitingInAction` → `MutationResult`

`testOrders.setClaimsWaitingInAction` also accepts an optional
`{ shipmentPackageId }` body (`SetClaimsWaitingInActionInput`), which is what
Trendyol's test-order status doc shows for that endpoint; omitted, the call is
unchanged.

Migration is one line — `unknown` already forced a cast, so
`(await x) as T` → `(await x).raw` (or read the documented field directly:
`(await client.webhooks.create(...)).id`).
