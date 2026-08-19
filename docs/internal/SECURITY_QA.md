# Security and release QA — Testnet payment branch

## Fixed branch controls

- Network, scheme, SEP-41 USDC contract, atomic amount and 60-second timeout are constants pinned to Stellar Testnet.
- Facilitator URL must exactly equal `https://channels.openzeppelin.com/x402/testnet`; configuration cannot redirect verify/settle to Mainnet or another host.
- Seller must be a syntactically valid Stellar `G...` public address.
- The optional payer bridge is disabled by default and accepts only an HTTP loopback resource origin (`127.0.0.1` or `localhost`), preventing a misconfigured secret-bearing process from paying an arbitrary remote resource.
- Payer seed and facilitator API key are server-only. No `NEXT_PUBLIC_` secret variables exist. Responses expose only redacted deterministic errors and public receipt fields.
- Payment requirements bind exact network, scheme, asset, amount, recipient and canonical resource URL. Malformed/tampered headers fail before facilitator settlement.

## Dependency audit (2026-08-14)

`npm audit` reports two high-severity dependency findings: the direct `next@14.2.35` package aggregates current Next.js advisories (including reachable App Router/RSC denial-of-service classes), and its transitive `postcss` version has source-map/path-disclosure advisories. Some listed advisories depend on features this POC does not use (custom rewrites, WebSocket upgrades, CSP nonces, attacker-controlled CSS/source maps or image remote patterns), but App Router/RSC is used, so the aggregate risk cannot be marked non-reachable.

The registry-proposed remediation is `next@16.3.1`, a semver-major migration. It was deliberately not forced into this narrowly scoped Testnet branch. Before production approval, create a separate framework-upgrade branch, confirm React/Next and `@x402/*` compatibility, rerun all regression/payment tests, and obtain a clean or explicitly accepted audit result.

## Release boundary

Suitable for review and Testnet POC evidence. Not recommended for production merge/deployment until the framework advisories are remediated or explicitly risk-accepted after a focused migration review. This is not an audit or production-readiness certification.
