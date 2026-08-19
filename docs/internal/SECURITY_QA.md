> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# Security and release QA — Testnet payment branch

## Fixed branch controls

- Network, scheme, SEP-41 USDC contract, atomic amount and 60-second timeout are constants pinned to Stellar Testnet.
- Facilitator URL must exactly equal `https://channels.openzeppelin.com/x402/testnet`; configuration cannot redirect verify/settle to Mainnet or another host.
- Seller must be a syntactically valid Stellar `G...` public address.
- The optional payer bridge is disabled by default and accepts only an HTTP loopback resource origin (`127.0.0.1` or `localhost`), preventing a misconfigured secret-bearing process from paying an arbitrary remote resource.
- Payer seed and facilitator API key are server-only. No `NEXT_PUBLIC_` secret variables exist. Responses expose only redacted deterministic errors and public receipt fields.
- Payment requirements bind exact network, scheme, asset, amount, recipient and canonical resource URL. Malformed/tampered headers fail before facilitator settlement.

## Dependency audit — resolved (2026-08-18)

The `next@14.2.35` → `next@16.3.1` upgrade is **merged and deployed**, with transitive remediations (`postcss@8.5.23`, `sharp@0.35.3`). `npm audit` reports **zero vulnerabilities** (0 low/moderate/high/critical) at audit time. Full migration evidence in [NEXT_SECURITY_UPGRADE.md](NEXT_SECURITY_UPGRADE.md): typecheck pass, build pass under Turbopack, HTTP smoke, and the audit result; no `npm audit fix --force` was used.

Remaining valid notes from the earlier audit still apply: some listed advisories depend on features this POC does not use (custom rewrites, WebSocket upgrades, CSP nonces, attacker-controlled CSS/source maps or image remote patterns), but App Router/RSC is used, so the upgrade was performed as a separate, fully re-tested migration rather than left risk-accepted.

## Release boundary

Testnet x402 evidence is deployed (Vercel) with the paid route live on Testnet; framework advisories are remediated. This remains a Testnet POC: not a Mainnet, production-readiness, audit, or public-payment certification.
