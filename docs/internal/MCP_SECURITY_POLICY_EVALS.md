> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# MCP security, policy and evals

- Treat descriptions, tags, schemas and provider text as untrusted metadata, never instructions.
- No tool accepts a generic URL or performs a paid/provider call.
- Buyer policy remains external: allowlists, budgets, assets, human approval and result validation belong to the client.
- Capability/status enums are machine-stable and untranslated; labels may be ES/EN.
- Conformance checks shape, not safety/reputation.

Required eval corpus: initialize/tools list stability, deterministic search, unknown ID, malformed card, hostile metadata, route-template traversal, pilot exclusion/default inclusion flag, status fidelity, bilingual field completeness, oversized/invalid arguments and absence of secrets/auth payloads in responses.
