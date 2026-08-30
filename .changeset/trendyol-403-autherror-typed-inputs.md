---
'@lonca/trendyol': minor
---

Map non-JSON 401/403 responses to `AuthError`, and add typed hints to
`CreateVideoInput` and `testOrders.updateStatus`.

- A `401`/`403` whose body is not JSON — e.g. the Cloudflare block page served
  when the stage IP allowlist rejects the caller — now maps to `AuthError`
  ("Trendyol rejected the request before it reached the API (HTTP 403,
  non-JSON body) — check IP allowlisting / credentials / User-Agent") instead
  of `ValidationError` (`VALIDATION_FAILED`). The raw HTML/text body is never
  attached to the error: `error.data` carries only a `{ bodyKind, bodyLength }`
  hint. JSON 401/403 bodies keep their existing mapping.
- `CreateVideoInput` is now a typed hint per the seller video API doc
  (`title`, `description`, `videoUrl`, `productContentIds`,
  `videoContentType` — new `VideoContentType` open union) while keeping the
  `Record<string, unknown>` passthrough, so existing call sites compile
  unchanged.
- `testOrders.updateStatus(packageId, status, { lines?, params? })` — the
  test-order status doc shows a `{ lines, params, status }` body; pass the new
  optional third argument (`UpdateTestOrderStatusOptions`, with
  `TestOrderStatusLine` rows) to send it. Called with two arguments the body
  stays `{ status }` exactly as before. `TestOrderStatus` gains the documented
  `'AtCollectionPoint'` value.
