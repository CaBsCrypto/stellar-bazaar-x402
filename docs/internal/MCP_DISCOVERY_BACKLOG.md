> **INTERNAL** — historical/aspirational document. Not user-facing; see docs/MCP_DISCOVERY.md and docs/PROVIDER_ONBOARDING.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver docs/MCP_DISCOVERY.md y docs/PROVIDER_ONBOARDING.md para las guías actuales.

# MCP discovery backlog — separate branch

Target branch: `feat/mcp-discovery-readonly`. This is an issue-quality backlog, not an active runtime claim or mock MCP configuration.

## Implemented (2026-08-18, branch `chore/evidence-deploy-housekeeping`)

- `search_services`: opaque cursor pagination (`limit` 1–50, `cursor`, `nextCursor`, `partialResults`) with deterministic `INVALID_CURSOR` envelope for malformed cursors.
- `list_services`: now returns `partialResults: false` and `nextCursor: null` for shape consistency.
- Deterministic error envelope across tools: `{ code, message, retryable, stage, field? }` (e.g. `RESOURCE_NOT_FOUND`, `INVALID_CURSOR`).
- Hostile-corpus coverage in `scripts/test-mcp-onboarding.mjs`: route traversal, internal HTTP URL, pubnet, negative amount, secret-prefixed destination — all rejected by conformance rules.

## Implemented (2026-08-18, branch `feat/product-onboarding-mcp`)

- **Provider registry via MCP (server v0.4.0, 11 tools):** `register_service`, `update_service`, `delete_service`, `list_my_services` with shared-secret auth (`providerKey` tool argument, sha256 hash stored, never raw). Deterministic registry envelopes `UNAUTHORIZED`, `CARD_EXISTS`, `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `STORAGE_ERROR`.
- **Dynamic cards visible in MCP read tools:** `list_services`, `search_services` and `get_service` now merge provider-registered cards (registry writes target Upstash Redis, **provisioned 2026-08-19**; legacy `KV_REST_API_*` env names also supported by `lib/dynamic-registry.ts`).
- **Zod shape schema** (`lib/service-card-schema.ts`): closes shape gaps (id slug, name, tags, input[]), feeding `failedRules` per-field.
- **HTTP parity:** `POST/PUT/DELETE/GET /api/publisher/ingest` with `X-Bazaar-Provider-Key`, 401/409/404/503 envelopes, `revision` tracking.
- **Human UI:** `/publish` now registers for real (success panel, `failedRules`, own-card delete).

## Completed — Upstash Redis persistence (2026-08-19)

- Provisioned via Upstash console (free tier, 500K commands/mo), envs `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` set on Vercel Production + Preview and in `.env.local`.
- Verified: registry survives a production redeploy and is consistent across serverless instances (`storage: "upstash"` in register responses).

## Completed — P0 items delivered (2026-08-18)

The real read-only Streamable MCP endpoint is live at `POST /api/mcp`: `search_services` (deterministic filters, cursor pagination, partial-result signaling, explainable ranking evidence), `get_service`/`list_services`/`validate_service_card` over the canonical HTTP discovery model, `get_bazaar_capabilities` with a capability card (`bazaar.capabilities/v1`), one deterministic error envelope (`{ code, message, retryable, stage, field? }`), untrusted-metadata handling, and agent onboarding docs. Paid-call tooling remains unavailable until separately proven. See [MCP_DISCOVERY.md](MCP_DISCOVERY.md).

## P1 — agent policy and evaluation

- Policy fields: network, asset, scheme, price, destination, timeout/expiry, method, route/input definition, data handling, terms URL, and provider-declared constraints.
- Strict malformed/untrusted `routeTemplate` rejection and soft-drop behavior with per-rule outcomes.
- External evaluation corpus for natural-language retrieval, filters, cursor stability, malformed cards, hostile metadata, unsupported capabilities, and deterministic errors.
- Conformance fixtures and evidence without trending, purchase-count, popularity, reputation, or safety claims.

## Later developer adoption kit

On a different branch, prepare a provider quickstart, three sample service cards, pilot intake template, 75-second demo script, and an accurate claim matrix. No external posting or marketing before explicit authorization and verified Testnet evidence. The provider quickstart now has a live foundation in `docs/PROVIDER_ONBOARDING.md` (register/update/delete/list via HTTP and MCP).

The later landing/catalogue mockup must be fully bilingual: Spanish-first with complete English equivalents for every service category and user-facing label. Service cards should support localized `title`, `description`, `tags`, and `category` values for `es` and `en`, plus UI locale selection. Machine-stable IDs and metadata remain unchanged; protocol enum values are never translated.

## Bilingual catalogue scope

Bazaar should catalogue broadly useful Web2 and AI services/capabilities that can be paid through Stellar, not only Web3 services. It indexes callable capabilities—not hireable agent profiles, human jobs, freelancer tasks, or social profiles.

Initial bilingual category fixtures for the later mockup branch:

- Web Intelligence / Inteligencia Web
- Creative Studio / Estudio Creativo
- Growth & Marketing / Crecimiento y Marketing
- Developer Tools / Herramientas de Desarrollo
- Research & Data / Investigación y Datos
- Agent Safety / Seguridad de Agentes
- Stellar & DeFi / Stellar y DeFi

Every mockup fixture must be visibly labelled as fixture/demo data. The service-card model should distinguish synchronous results from asynchronous jobs. Async cards declare lifecycle, price, input and output schemas, and structured `jobId`, `status`, and result-artifact fields. Discovery may describe and validate this model; Bazaar does not provide escrow, custody, wallet signing, or financial guarantees for job execution.
