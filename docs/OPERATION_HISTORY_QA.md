# Operation history — local validation, 2026-09-06

Branch: `codex/agent-operation-history`, based on `1324f82`. Local implementation only; no payment, remote configuration, publication or deployment.

## Implemented behavior

- Preserve complete provider Service Cards through REST/MCP ranking and list/get conversion, including origin, destination, input definitions and delivery contract.
- Resolve buyer requests against the provider origin; reject cross-origin and dot-segment path substitutions. Provider template requires its own explicit seller address.
- Private owner-scoped agent journal using distinct hashed read/write credentials and durable Redis atomic append; no memory fallback in deployed code.
- SDK opt-in automatic reporting, with result storage controlled by buyer policy. Errors retain unknown payment/delivery status. Journal errors never retry payments.
- ES/EN `/history` and authenticated read-only MCP tool. Human inspection does not gate agent purchases.

## Evidence

- `npm run test:provider-card`: preservation, returned-object isolation, ranking, request origin and hostile path inputs pass.
- `npm run test:history`: auth, owner isolation, least privilege, conflict, idempotency, result retrieval, positive HTTP POST/GET, absent storage, sensitive content, UI rendering and SDK no-repay behavior pass.
- Store tests use a shared fake Redis command boundary across recreated clients; they do not validate real Redis service availability or run Lua in Redis.
- `npm run typecheck` and `npm run build`: pass (Next 16.3.1).
- Local HTTP 200: root, `/catalogo`, `/publish`, `/history`, discovery resources/search. History API correctly returns 503 while unconfigured; MCP returns an error envelope with no private data.
- MCP onboarding suite (8 read tools, no writes) and WebMCP HTTP regression suite pass. Native browser interoperability is not verified.
- Redacted scan: zero current Stellar seed matches, zero exact local-secret matches in tracked source/build. Previously documented historical commit remains reported; no history rewritten.
- Independent review found a dot-segment URL issue, fixed and regression-tested before the final build.

## Release limitations

The journal is an authenticated agent report, not independently verified settlement evidence. Historic transfers are not backfilled. Current SDK integration covers completed executions and interruptions; other clients must integrate the API. Metadata, agent identity labels and results remain untrusted.

Before deployment, provision owner hashes and Redis, validate actual storage concurrency/recovery, agree retention/deletion policy and review native-browser behavior. Current cap is 1000 immutable records per owner, read latest 20 by default (100 maximum); no full-pagination UI yet. Private results are optional and size-limited.

`npm audit --omit=dev` reports four affected dependency packages: three high and one moderate. Installed paths: `@stellar/stellar-sdk@14.4.2 -> toml@3.0.0`; MCP SDK -> AJV -> `fast-uri@3.1.5`; MCP SDK -> Express/body-parser -> `qs@6.15.3`. No dependency changes were made in this branch. Reachability and compatible remediation remain open; this report does not assert a clean security release gate.
