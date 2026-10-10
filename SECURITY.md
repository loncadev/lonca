# Security Policy

Lonca SDKs connect to marketplace APIs using credentials (API keys, tokens, secrets). Security vulnerabilities must be reported responsibly.

## Supported versions

Security fixes are published for the **latest released minor version** of each package (`@lonca/core`, `@lonca/trendyol`, `@lonca/hepsiburada`).

| Version                       | Supported |
| ----------------------------- | --------- |
| Latest `1.x` minor            | ✅        |
| Older `1.x` minors, any `0.x` | ❌        |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report vulnerabilities via GitHub's private vulnerability reporting (only the maintainers can see the report):

👉 [github.com/loncadev/lonca/security/advisories/new](https://github.com/loncadev/lonca/security/advisories/new)

This is the only reporting channel. Lonca has no project e-mail address.

Please include:

- Affected package(s) and version
- Impact of the vulnerability (information disclosure, RCE, credential leak, etc.)
- Reproduction steps (minimal repro)
- Whether you want a coordinated disclosure with a CVE / GHSA

## Response timeline

- **Within 24 hours** — acknowledgment of receipt
- **Within 7 days** — assessment of validity
- **Within 30 days** — fix or mitigation published (critical issues faster)

## In scope

- API credential leakage (logs, error messages, telemetry, etc.)
- Vulnerabilities in data sent to / received from marketplace APIs
- Prototype pollution, ReDoS, dependency vulnerabilities
- Supply chain issues (changeset PRs, npm publish flow)

## Out of scope

- Versions explicitly marked as unsupported
- Vulnerabilities in the marketplace's own API (contact the marketplace directly)
- Issues caused by misuse in production environments

Thank you — responsible disclosure strengthens the whole ecosystem.
