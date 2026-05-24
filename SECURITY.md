# Security Policy

Lonca SDKs connect to marketplace APIs using credentials (API keys, tokens, secrets). Security vulnerabilities must be reported responsibly.

## Supported versions

Lonca has not reached `1.0.0` yet (alpha). Security fixes are only published for the **latest released minor version**. This policy will tighten once Lonca reaches a stable release.

| Version              | Supported |
| -------------------- | --------- |
| Latest `0.x` minor   | ✅        |
| Older `0.x` versions | ❌        |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report vulnerabilities via GitHub's private security advisory mechanism:

👉 [github.com/loncadev/lonca/security/advisories/new](https://github.com/loncadev/lonca/security/advisories/new)

Alternatively, email **security@lonca.dev** (will be active once domain is provisioned).

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
