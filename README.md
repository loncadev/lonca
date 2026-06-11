<p align="center">
  <img src="https://raw.githubusercontent.com/loncadev/.github/main/brand/logomark.svg" alt="Lonca" height="48">
</p>

# Lonca

[![CI](https://github.com/loncadev/lonca/actions/workflows/ci.yml/badge.svg)](https://github.com/loncadev/lonca/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@lonca/core.svg?label=%40lonca%2Fcore)](https://www.npmjs.com/package/@lonca/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/@lonca/core.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

Open-source SDKs and tooling for Turkish e-commerce marketplaces.

> Type-safe TypeScript SDKs, curated OpenAPI specs, and integration utilities for Trendyol, Hepsiburada, n11, Amazon TR, Pazarama, Çiçeksepeti, and more.

> [!IMPORTANT]
> **Unofficial & independent.** Lonca is a community-maintained project. It is **not** an official SDK and is not affiliated with, endorsed by, or supported by Trendyol, Hepsiburada, or any other marketplace named here. All product names, logos, and trademarks are the property of their respective owners.

> [!WARNING]
> 🚧 **Alpha** — APIs are not stable. Do not use in production. Minor versions may contain breaking changes until `1.0.0`.

## Table of contents

- [Vision](#vision)
- [Why?](#why)
- [Packages](#packages)
- [Quick start](#quick-start)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Vision

Three-stage roadmap:

1. **SDK + OpenAPI Spec Collection** — Type-safe TypeScript SDKs and curated OpenAPI specs for Turkish marketplaces (current stage)
2. **API Drift Detection** — A monitoring layer that proactively detects breaking changes in marketplace APIs
3. **Unified Marketplace API Gateway** — A Plaid-style abstraction that puts every marketplace behind a single API

## Why?

Turkish e-commerce marketplace APIs are fragmented, under-documented, and constantly shifting. Every e-commerce developer ends up rewriting the same integration code from scratch. Existing solutions are either closed-source vendor-locked (IdeaSoft, T-Soft) or simply don't support Turkish marketplaces (Zapier, Make, n8n).

Lonca aims to fill this gap with a community-maintained open standard.

## Packages

| Package              | Description                                                                         | Status                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@lonca/core`        | Shared types, error hierarchy, retry / logger / rate-limiter                        | [![npm](https://img.shields.io/npm/v/@lonca/core.svg)](https://www.npmjs.com/package/@lonca/core)               |
| `@lonca/trendyol`    | Trendyol Marketplace SDK — full surface (14 resources, ~70 methods, webhook helper) | [![npm](https://img.shields.io/npm/v/@lonca/trendyol.svg)](https://www.npmjs.com/package/@lonca/trendyol)       |
| `@lonca/hepsiburada` | Hepsiburada Marketplace SDK — full dev-portal coverage (12 resources, 95 methods)   | [![npm](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada) |

📚 **Docs & API reference**: [loncadev.github.io/lonca](https://loncadev.github.io/lonca) — guides, end-to-end flows, and full TypeDoc API reference. Built with [Astro Starlight](https://starlight.astro.build), regenerated on each push to `main`.

Need an SDK for another marketplace? Open a [marketplace request](https://github.com/loncadev/lonca/issues/new?template=marketplace_request.yml).

## Quick start

### Trendyol (live)

```bash
pnpm add @lonca/trendyol @lonca/core
```

```ts
import { createTrendyolClient } from '@lonca/trendyol';
import { paginate } from '@lonca/core';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TRENDYOL_API_KEY!,
  apiSecret: process.env.TRENDYOL_API_SECRET!,
  env: 'prod', // or 'stage'
});

// Iterate every product page-by-page.
for await (const product of paginate((p) => client.products.list(p))) {
  for (const variant of product.variants) {
    console.log(variant.barcode, product.title);
  }
}
```

See [`sdks/trendyol/README.md`](./sdks/trendyol/README.md) for the full surface (brands · categories · suppliers · products read+write+lifecycle · inventory · orders read+write+split+cargo+ops+returns · claims · webhooks + `parseWebhookEvent` · questions · invoices · finance · labels · testOrders · locations) and end-to-end walkthroughs for product creation, webhook handling, returns/claims, and settlement reconciliation.

### Shared primitives

```bash
pnpm add @lonca/core
```

```ts
import { money, paginate, retry, RateLimitError, TokenBucketRateLimiter } from '@lonca/core';

const price = money(12550, 'TRY'); // 125.50 TRY (integer minor units)
const limiter = new TokenBucketRateLimiter({ capacity: 50, intervalMs: 60_000 });

await retry(
  async () => {
    await limiter.acquire();
    // ...call a marketplace API
  },
  { maxAttempts: 5 },
);
```

See [`packages/core/README.md`](./packages/core/README.md) for the full surface.

## Development

Requirements:

- Node.js >= 22 (active LTS) — pinned to `24` via `.nvmrc`
- pnpm >= 10 ([Corepack](https://nodejs.org/api/corepack.html) recommended)

```bash
git clone https://github.com/loncadev/lonca.git
cd lonca
pnpm install
```

Common commands:

```bash
pnpm typecheck      # TypeScript
pnpm lint           # ESLint
pnpm format         # Prettier (write)
pnpm test           # Vitest
pnpm build          # Build all packages via Turborepo
pnpm dev            # Parallel watch across packages
```

Work on a single package:

```bash
pnpm --filter @lonca/core test
```

## Contributing

Pull requests are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md). For larger changes, open a [Discussion](https://github.com/loncadev/lonca/discussions) first.

## Security

**Do not file public issues for security vulnerabilities.** Follow the disclosure process in [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
