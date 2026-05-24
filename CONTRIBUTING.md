# Contributing to Lonca

Thanks for considering a contribution. Lonca is a community-maintained project and every kind of contribution helps — bug reports, documentation, new marketplace SDKs, performance improvements.

## Understand the context first

Before opening a PR:

- Does your change come from **real usage pain**, or from speculation? Lonca follows an authentic pain-validation principle — instead of designing for a scenario you haven't experienced, open an issue or Discussion and let's talk it through.
- For large changes (new package, breaking change, architecture) **open an issue or Discussion before the PR**.

## Requirements

- Node.js >= 20 (LTS)
- pnpm >= 10 ([Corepack](https://nodejs.org/api/corepack.html) recommended)
- Git >= 2.40

## Setup

```bash
git clone https://github.com/loncadev/lonca.git
cd lonca
pnpm install
```

## Development workflow

```bash
pnpm typecheck    # TypeScript
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm test         # Vitest
pnpm build        # Build via Turborepo
```

Work on a single package:

```bash
pnpm --filter @lonca/trendyol test
pnpm --filter @lonca/core build
```

## Pull Request flow

1. Fork the repo and create a feature branch (`git checkout -b fix/trendyol-rate-limit`).
2. Make the change, add or update tests.
3. **Add a changeset** (required for bug fixes, features, and breaking changes):
   ```bash
   pnpm changeset
   ```
   Pick how each affected package should be bumped (patch / minor / major) and write a short summary. Docs, refactors, and chores do not need a changeset.
4. Make sure `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` pass locally.
5. Open the PR and fill in the template.

## Commit and PR titles

We loosely follow Conventional Commits — not enforced, but consistent titles help readability:

```
feat(trendyol): add inventory bulk update endpoint
fix(core): retry should not consume body on 429
docs: clarify pnpm catalog usage
```

## Proposing a new marketplace SDK

To add an SDK for a new marketplace (n11, Çiçeksepeti, Pazarama, ePttAVM, …):

1. Open an issue using the `🏬 New marketplace SDK request` template. Fill in the pain-validation section honestly.
2. Once a maintainer approves, start work under `sdks/<marketplace>`.
3. Reuse `@lonca/core` primitives (Money, Pagination, error hierarchy, retry, logger) — do not duplicate.
4. At minimum cover the following endpoint groups: Orders + Products + Inventory.

## Code style

- Prettier + ESLint run in CI — please don't override the configs, keep the repo standard.
- TypeScript `strict` mode. Use `any` only as a last resort and document why.
- Public API surfaces should have TSDoc comments.

## License

By contributing you agree your contribution is licensed under the MIT License.
