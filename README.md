# Lonca

[![CI](https://github.com/loncadev/lonca/actions/workflows/ci.yml/badge.svg)](https://github.com/loncadev/lonca/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)
[![Node](https://img.shields.io/node/v/@lonca/core.svg)](https://nodejs.org/)

Open-source SDKs and tooling for Turkish e-commerce marketplaces.

> Type-safe TypeScript SDKs, curated OpenAPI specs, and integration utilities for Trendyol, Hepsiburada, n11, Amazon TR, Pazarama, Çiçeksepeti, and more.

> [!WARNING]
> 🚧 **Alpha** — APIs are not stable. Do not use in production. Minor versions may contain breaking changes until `1.0.0`.

## Table of contents

- [Vision](#vision)
- [Why?](#why)
- [Packages](#packages)
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

| Package              | Description                                                  | Status  |
| -------------------- | ------------------------------------------------------------ | ------- |
| `@lonca/core`        | Shared types, error hierarchy, retry / logger / rate-limiter | Planned |
| `@lonca/trendyol`    | Trendyol Marketplace API SDK                                 | Planned |
| `@lonca/hepsiburada` | Hepsiburada Marketplace API SDK                              | Planned |

Need an SDK for another marketplace? Open a [marketplace request](https://github.com/loncadev/lonca/issues/new?template=marketplace_request.yml).

## Development

Requirements:

- Node.js >= 20 (LTS) — pinned via `.nvmrc`
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
pnpm dev            # Parallel watch (once packages land)
```

Work on a single package:

```bash
pnpm --filter @lonca/trendyol test
```

## Contributing

Pull requests are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md). For larger changes, open a [Discussion](https://github.com/loncadev/lonca/discussions) first.

## Security

**Do not file public issues for security vulnerabilities.** Follow the disclosure process in [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
