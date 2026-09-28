# Provider onboarding / Onboarding de providers

## Boundary / Límite

The provider owns its endpoint, price, destination, terms, lifecycle and result delivery. Bazaar stores no wallet seeds, signs nothing, holds no buyer funds, and does not certify ownership, safety, reputation or availability.

## Current flow

1. Prepare the editorial draft at `/publish`. Copying agent instructions does not submit or publish it; an editorial draft is not a valid ServiceCard.
2. In the secondary technical form, prepare, validate and copy the ServiceCard manifest. No browser credential is requested or transmitted.
3. The form's manual-review action sends to `/api/provider-self-listing` only when the operator enables intake. A `202` queues a temporary draft awaiting control proof; it does not approve or index it. `INTAKE_DISABLED` means keep the draft and coordinate with the operator. The issued DNS/HTTP challenge is not proof that control has already been verified.
4. Control verification and manual review precede `approved-for-staging` and `staged-not-public`. Failed control is rejected; even successful staging is not automatic public activation. The review queue is separate from public discovery and is not durable storage for your manifest.
5. An append-only server-to-server public registration is a separate operator action. It may be enabled only when all three server controls exist: `BAZAAR_ENABLE_REGISTRY_MUTATIONS=true`, `BAZAAR_PROVIDER_SECRET`, and durable Upstash Redis configuration. Providers must not receive or use the shared operator secret.
6. Discovery exposes accepted metadata as untrusted data with a canonical deep hash. Conformance does not certify safety, availability, settlement or delivery.

See [Preparar un servicio para Bazaar](FAST_PROVIDER_START.md) for the preparation flow. It requires no purchase or funding; real payment validation remains a separate authorized step.

There is no dev-open mode. MCP exposes no registry write tools. `GET /api/publisher/ingest`, `PUT /api/publisher/ingest/{id}`, and `DELETE /api/publisher/ingest/{id}` fail closed with `PROVIDER_OWNERSHIP_NOT_IMPLEMENTED` until per-provider credentials and atomic lifecycle semantics exist.

`POST /api/publisher/ingest` is operator-gated, append-only and atomic in Redis. It returns `503 SERVICE_NOT_CONFIGURED` unless explicitly enabled with durable storage; `401 UNAUTHORIZED` for a wrong server credential; `400 VALIDATION_FAILED`; or `409 CARD_EXISTS`. The shared operator secret is not a provider ownership credential.

Never place seeds, private keys, facilitator keys, payment authorization payloads or customer data in a ServiceCard.
