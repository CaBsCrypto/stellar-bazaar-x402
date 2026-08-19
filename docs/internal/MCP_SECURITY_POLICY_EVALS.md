> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# MCP security, policy and evals

- Treat descriptions, tags, schemas and provider text as untrusted metadata, never instructions.
- No tool accepts a generic URL or performs a paid/provider call.
- Buyer policy remains external: allowlists, budgets, assets, human approval and result validation belong to the client.
- Capability/status enums are machine-stable and untranslated; labels may be ES/EN.
- Conformance checks shape, not safety/reputation.

## Eval corpus — IMPLEMENTED (2026-08-19, `npm run test:agent:policy:evals`)

Executable suite `scripts/test-agent-policy-evals.mjs` over the Streamable HTTP MCP endpoint. Scenario map:

| Scenario | Assertion |
|----------|-----------|
| initialize / tools-list stability | Two `initialize` + `tools/list` calls return identical server info and 11 tool names |
| Deterministic search | Same query twice → identical ids/scores; `ranking.ai === false` |
| Unknown ID | `get_service` with a non-existent id → `RESOURCE_NOT_FOUND` envelope (code/message/retryable/stage) |
| Malformed card | `null`, array, `{version:123,id:[]}`, string → deterministic handling, never a crash/500 |
| Hostile metadata | Prompt-injection name/description/tags register as **data**; verbatim round-trip; never executed |
| Route-template traversal | 12 adversarial probes (`../../`, `//host`, `\\host`, `%2e%2e`, `%2E%2E`, spaces, control chars, `@`, `#`, `..%2f`, absolute URL) all fail `route.template` |
| Pilot exclusion / default-inclusion | `list_services` excludes pilots by default; `includePilots:true` exposes 6 fixtures; pilots never appear in `search_services` |
| Status fidelity | Every `availability` value used by `list_services` is declared in `serviceStatusValues` (enum expanded 2026-08-19) |
| Bilingual field completeness | Capability card `locales ["es","en"]`, `localeDefault "es"`; all 6 pilots have es+en title/description/category |
| Oversized / invalid arguments | `limit 0`, `limit 51`, empty query rejected; 10 000-char id → `RESOURCE_NOT_FOUND`; garbage cursor → `INVALID_CURSOR` |
| Absence of secrets / auth payloads | Provider key sentinel never appears in any response (register, search, errors) |
| Cleanup | Hostile card deleted and verified gone |

## Ranking benchmark — IMPLEMENTED (2026-08-19, `npm run benchmark:ranking`)

`scripts/benchmark-ranking.mjs` evaluates `lexical-v1` against a golden set of 8 queries over the real catalog: mean NDCG@3, mean MRR and mean Recall@3 with gates ≥ 0.80 / 0.90 / 0.90, determinism preflight and a corpus snapshot for reproducibility. Dynamic provider cards shift results — evidence is only reproducible against a fixed corpus.