# Provider onboarding / Onboarding de providers

## Boundary / Límite

The provider owns its endpoint, price, destination, terms, lifecycle and result delivery. Bazaar stores no wallet seeds, signs nothing, holds no buyer funds, and does not certify ownership, safety, reputation or availability.

## Current flow

1. Draft and validate locally at `/publish`; no browser credential is requested or transmitted.
2. Copy the generated ServiceCard manifest.
3. Submit it through an operator-reviewed channel outside the public browser UI.
4. An append-only server-to-server registration may be enabled only when all three server controls exist: `BAZAAR_ENABLE_REGISTRY_MUTATIONS=true`, `BAZAAR_PROVIDER_SECRET`, and durable Upstash Redis configuration.
5. Discovery exposes accepted metadata as untrusted data with a canonical deep hash.

There is no dev-open mode. MCP exposes no registry write tools. `GET /api/publisher/ingest`, `PUT /api/publisher/ingest/{id}`, and `DELETE /api/publisher/ingest/{id}` fail closed with `PROVIDER_OWNERSHIP_NOT_IMPLEMENTED` until per-provider credentials and atomic lifecycle semantics exist.

`POST /api/publisher/ingest` is operator-gated, append-only and atomic in Redis. It returns `503 SERVICE_NOT_CONFIGURED` unless explicitly enabled with durable storage; `401 UNAUTHORIZED` for a wrong server credential; `400 VALIDATION_FAILED`; or `409 CARD_EXISTS`. The shared operator secret is not a provider ownership credential.

Never place seeds, private keys, facilitator keys, payment authorization payloads or customer data in a ServiceCard.
