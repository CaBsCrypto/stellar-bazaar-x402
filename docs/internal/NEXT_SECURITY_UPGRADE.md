> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# Next.js security upgrade evidence

Branch: `feat/next-security-upgrade`, isolated from `origin/main`.

## Versions

| Package | Before | After |
| --- | --- | --- |
| Next.js | `14.2.35` resolved from `^14.2.31` | `16.3.1` exact |
| React / React DOM | `18.3.1` | unchanged |
| PostCSS (Next transitive) | vulnerable `<=8.5.22` | `8.5.23` |
| Sharp (Next optional/transitive) | vulnerable `<0.35.0` | `0.35.3` |

No patched Next 14 release exists in the registry beyond `14.2.35`. Next `15.5.23` was evaluated first, but `npm audit` still reported three high-severity findings through Next/PostCSS/Sharp, so it was not retained. No `npm audit fix --force` was used.

## Targeted migration

- Updated the dynamic resource page to await the Promise-based `params` contract required by current App Router.
- Accepted Next-generated TypeScript configuration updates: automatic JSX runtime and `.next/dev/types` include.
- No route, catalog, discovery, payment, wallet, environment or product behavior was added.

## Evidence

- `npm run typecheck`: pass.
- `npm run build`: pass under Next `16.3.1` with Turbopack.
- Independent HTTP smoke: landing, resource detail, publisher, discovery resources/search, conformance malformed JSON, and reference quote valid/invalid paths pass.
- `npm audit --json`: zero vulnerabilities at audit time (0 low/moderate/high/critical).

## Sequencing

Merge this security upgrade before the x402 Testnet PR. Then rebase the x402 branch onto the upgraded main, resolve the already-known App Router `params` migration once, reinstall the combined dependency graph, and rerun x402 build/typecheck, non-payment protocol smoke, secret scan and one previously approved Testnet validation only if the integration evidence cannot be established without spending again.
