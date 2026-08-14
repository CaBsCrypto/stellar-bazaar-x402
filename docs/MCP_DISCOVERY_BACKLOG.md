# MCP discovery backlog — separate branch

Target branch: `feat/mcp-discovery-readonly`, after the Testnet payment branch is reviewed. This is an issue-quality backlog, not an active runtime claim or mock MCP configuration.

## P0 — real read-only Streamable MCP endpoint

- `search_services`: deterministic filters, cursor pagination, partial-result signaling, and explainable ranking evidence.
- `get_service`, `list_services`, and `validate_service_card` over the canonical HTTP discovery model.
- `get_bazaar_capabilities` plus a capability card that distinguishes implemented, experimental, and unavailable behavior.
- One deterministic error envelope: stable code, human-readable message, retryability, and field/rule details.
- Treat every catalog field, URL, route template, price, policy declaration, and provider statement as untrusted data. Validate shape and route safety; never certify the provider.
- Agent onboarding docs for transport, versions, pagination, examples, limits, and truthful paid-call status. Paid-call tooling remains unavailable until separately proven.

## P1 — agent policy and evaluation

- Policy fields: network, asset, scheme, price, destination, timeout/expiry, method, route/input definition, data handling, terms URL, and provider-declared constraints.
- Strict malformed/untrusted `routeTemplate` rejection and soft-drop behavior with per-rule outcomes.
- External evaluation corpus for natural-language retrieval, filters, cursor stability, malformed cards, hostile metadata, unsupported capabilities, and deterministic errors.
- Conformance fixtures and evidence without trending, purchase-count, popularity, reputation, or safety claims.

## Later developer adoption kit

On a different branch, prepare a provider quickstart, three sample service cards, pilot intake template, 75-second demo script, and an accurate claim matrix. No external posting or marketing before explicit authorization and verified Testnet evidence.

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
