# Lonca SDKs — API Reference

Type-safe TypeScript SDKs for Turkish e-commerce marketplaces. Each SDK is independently versioned on npm; this site is the generated API reference for every public export across all three packages.

## Packages

### [`@lonca/core`](modules/_lonca_core.html)

Shared primitives — error hierarchy, retry with exponential backoff, token-bucket rate limiter, structured logger, cursor pagination helpers. Peer dependency for the SDK packages.

[npm](https://www.npmjs.com/package/@lonca/core) · [source](https://github.com/loncadev/lonca/tree/main/packages/core)

### [`@lonca/trendyol`](modules/_lonca_trendyol.html)

Trendyol Marketplace SDK — 14 resources, ~70 methods covering brands, categories, products, listings, orders, packages, shipments, claims, questions, finance, invoices, labels, suppliers, webhooks, and webhook event parsing.

[npm](https://www.npmjs.com/package/@lonca/trendyol) · [source](https://github.com/loncadev/lonca/tree/main/sdks/trendyol) · [README](https://github.com/loncadev/lonca/blob/main/sdks/trendyol/README.md)

### [`@lonca/hepsiburada`](modules/_lonca_hepsiburada.html)

Hepsiburada Marketplace SDK — full coverage of every operation documented on [developers.hepsiburada.com](https://developers.hepsiburada.com). 12 resources / 95 methods + webhook event parser. Live-verified against SIT.

[npm](https://www.npmjs.com/package/@lonca/hepsiburada) · [source](https://github.com/loncadev/lonca/tree/main/sdks/hepsiburada) · [README](https://github.com/loncadev/lonca/blob/main/sdks/hepsiburada/README.md)

## Where to start

- **First time?** Read each SDK's README on GitHub for end-to-end flows and a per-resource cheat sheet. This reference site is the exhaustive method-by-method API surface.
- **Building an integration?** Pin your dependency to a minor version (e.g. `"@lonca/hepsiburada": "~0.6.0"`) — the `0.x` line ships breaking type changes when live observation reveals stricter contracts.
- **Need a feature?** Open a [marketplace request](https://github.com/loncadev/lonca/issues/new/choose) on GitHub.

## License

MIT — see [LICENSE](https://github.com/loncadev/lonca/blob/main/LICENSE).
