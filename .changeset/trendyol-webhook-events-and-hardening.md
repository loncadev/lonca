---
'@lonca/trendyol': minor
---

Add typed webhook event payloads + harden settlement / label types + extend smoke coverage.

### New: typed inbound webhook events

Trendyol POSTs shipment-package status events to your endpoint using the same body shape as `getShipmentPackages` (per the official "Webhook Model" doc). The SDK now ships a top-level helper for parsing that JSON into typed `ShipmentPackage[]`:

```ts
import express from 'express';
import { parseWebhookEvent } from '@lonca/trendyol';

const app = express();
app.post('/trendyol/webhook', express.json(), (req, res) => {
  const event = parseWebhookEvent(req.body);
  for (const pkg of event.packages) {
    // pkg is the same typed ShipmentPackage you get from orders.list()
    await myQueue.enqueue({ packageId: pkg.id, status: pkg.status });
  }
  res.sendStatus(200);
});
```

`parseWebhookEvent` accepts either a parsed object or a raw JSON string, throws `ValidationError` for malformed bodies, and reuses the SDK's existing package normalizer.

New exports:
- `parseWebhookEvent(rawBody)` — the helper
- `normalizeShipmentPackage(rawNode)` — re-usable single-package normalizer
- `WebhookEvent`, `WebhookEventStatus` (open enum: `CREATED`, `PICKING`, `INVOICED`, …, `VERIFIED`), `PackageCreatedBy` (`order-creation` / `cancel` / `split` / `transfer`)

### Hardened types (replace `{ raw }`-only shapes)

Both `finance.getSettlements()` and `finance.getOtherFinancials()` return the same `FinancialTransaction` wire shape per Trendyol's spec. SDK now surfaces the documented fields directly:

```ts
// Before (0.5.0): page.items[0].raw.transactionType
// After  (0.5.1): page.items[0].transactionType
```

Fields covered: `id`, `transactionDate` (ISO), `transactionType`, `barcode`, `receiptId`, `description`, `debt`, `credit`, `paymentPeriod`, `commissionRate`, `commissionAmount`, `commissionInvoiceSerialNumber`, `sellerRevenue`, `orderNumber`, `paymentOrderId`, `paymentDate` (ISO), `sellerId`, `storeId`, `storeName`, `storeAddress`, `country`. `raw` is still preserved for any fields Trendyol adds later.

`labels.getCommon()` now returns `{ labels: [{ label, format }], raw }` instead of `{ raw }` only — extracts Trendyol's documented `{ data: [{ label, format }] }` envelope.

`SettlementRow` and `OtherFinancialRow` are kept as `@deprecated` aliases for `FinancialTransaction` so existing 0.5.0 code continues to type-check.

New exports: `FinancialTransaction`, `CommonLabelEntry`.

### Smoke coverage extended

4 endpoints that were never live-tested in earlier phases now have safe smoke sections:
- `finance.getSettlements` / `getOtherFinancials` (read-only)
- `labels.getCommon` with fake tracking number (wire-verify only)
- `claims.getItemAudits` with fake id (wire-verify only)

Result on STAGE 2026-05-26: finance returns 401 (feature-gated for this seller), labels returns 500 (wire reaches handler with fake tracking), claims-audits returns 404 (path verified). All four prove the SDK constructs the correct URL + headers.

### Test count

246 → 258 mock tests (+12: 11 new webhook-event parse tests + revised finance/label assertions for the hardened shapes).
