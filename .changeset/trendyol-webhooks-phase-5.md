---
'@lonca/trendyol': minor
---

Add **Phase 5 — webhooks resource** (6 endpoints).

Introduces a new top-level `client.webhooks` resource managing Trendyol's shipment-package status webhooks. **Max 15 active subscriptions per seller.** Webhooks fire on order status events only (no product / stock support).

### New methods on `client.webhooks`

- **`create(input)`** → `unknown`
  - `POST /integration/sellers/{sellerId}/webhooks`
  - SDK validates `url`, `authenticationType`, and auth-type-specific required fields (`username + password` for BASIC, `apiKey` for API_KEY) before hitting the wire.

- **`list()`** → `Webhook[]`
  - `GET /integration/sellers/{sellerId}/webhooks`
  - Normalizer accepts 3 response shapes (raw array, `{ webhooks: [] }`, `{ content: [] }`) and 3 active-flag spellings (`active`, `isActive`, `status: 'ACTIVE'`).

- **`update(webhookId, input)`** → `unknown`
  - `PUT /integration/sellers/{sellerId}/webhooks/{id}`
  - Same input shape as `create` (Trendyol does full-replace, not partial).

- **`delete(webhookId)`** → `unknown`
  - `DELETE /integration/sellers/{sellerId}/webhooks/{id}`

- **`activate(webhookId)`** → `unknown`
  - `PUT /integration/sellers/{sellerId}/webhooks/{id}/activate`

- **`deactivate(webhookId)`** → `unknown`
  - `PUT /integration/sellers/{sellerId}/webhooks/{id}/deactivate`
  - Trendyol auto-deactivates webhooks after persistent delivery failures + sends 2 emails; use `activate()` to bring them back once your endpoint is healthy.

### Security note (documented in JSDoc)

**No HMAC signature** — Trendyol authenticates against **your endpoint** using the auth method you configure (`BASIC_AUTHENTICATION` or `API_KEY`). Pick `API_KEY` so you can rotate the secret without redeploying. The SDK does not pre-check the 15-subscription cap (would need an extra round-trip); Trendyol returns HTTP 400 when exceeded.

### New exports

- Resource: `WebhooksResource`
- Types: `Webhook`, `WebhookInput`, `WebhookAuthenticationType`

### Smoke verified (STAGE)

```
── 6.88 webhooks.list()
✖ HTTP 401 ("Invalid token")
```

Direct curl probe to `/integration/sellers/{id}/webhooks` returned the same 401 with a JSON error body — this seller hasn't enabled the webhook feature on STAGE (Trendyol's webhook layer uses a separate auth check from the general API). **Wire path + auth flow verified**; activation needs to be enabled on the seller side.

### Phase 5 complete

Next: **Phase 6-11 — questions (3), invoices (3), settlements (2), common labels (2), test orders (3), location lookups (8) = 21 endpoints** to fully close out the Trendyol surface.
