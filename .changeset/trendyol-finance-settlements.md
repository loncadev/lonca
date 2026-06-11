---
'@lonca/trendyol': minor
---

Fix `finance.getSettlements` / `getOtherFinancials` failing against the live API.
Trendyol's CHE finance endpoints **require** a `transactionType` (they return a
bare 500 without one) and only accept a page **size of 500 or 1000** (`400 "Size
değeri 500 ya da 1000 olmalı"`), but the SDK left `transactionType` optional and
sent `size=50`/capped at 200 — so both calls failed.

The SDK now throws a clear `ValidationError` when `transactionType` is missing and
clamps `limit` to 500/1000 (default 500). Verified live: `getSettlements({
transactionType: 'Sale', startDate, endDate })` → 116 transactions.
