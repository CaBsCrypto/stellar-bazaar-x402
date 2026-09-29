# Provider onboarding / Onboarding de providers

For agents without this repository, use the standalone public guide: https://bazaar.browns.studio/PROVIDER_ONBOARDING.md (source: `public/PROVIDER_ONBOARDING.md`). No account or signup is required to prepare a review packet.

## Boundary / Límite

The provider owns its endpoint, price, destination, terms, lifecycle and result delivery. Bazaar stores no wallet seeds, signs nothing, holds no buyer funds, and does not certify ownership, safety, reputation or availability.

## Current flow

1. Prepare the editorial draft at `/publish`. Copying agent instructions does not submit or publish it; an editorial draft is not a valid ServiceCard.
2. In the secondary technical form, prepare, validate and copy the ServiceCard manifest. No administrative or wallet credential is requested. For a local review, generate and privately save a submission UUID and token before the first request.
3. The form sends the frozen card to `/api/provider-self-listing` with that UUID and a Bearer submission token, only in the enabled local pilot. A `202` preserves a draft awaiting control proof in the configured file store; it does not approve or index it. `INTAKE_DISABLED` means keep the draft and coordinate with the operator. An issued DNS/HTTP challenge is not proof of control.
4. Control verification and manual review precede `approved-for-staging` and `staged-not-public`. Successful staging is not public activation. GET `/api/provider-self-listing/{submissionId}` requires the same private Bearer token; keep it out of URLs. The current local pilot persists across processes, but is not approved for cloud deployment. The proof expires after 24 hours; records are retained. Use the [operator procedure](PROVIDER_REVIEW_PILOT.md) for verification, review, guarded activation and recovery. Public intake remains disabled; do not invent a public operator contact channel.
5. An append-only server-to-server public registration is a separate operator action. It may be enabled only when all three server controls exist: `BAZAAR_ENABLE_REGISTRY_MUTATIONS=true`, `BAZAAR_PROVIDER_SECRET`, and durable Upstash Redis configuration. Providers must not receive or use the shared operator secret.
6. Discovery exposes accepted metadata as untrusted data with a canonical deep hash. Conformance does not certify safety, availability, settlement or delivery.

See [Preparar un servicio para Bazaar](FAST_PROVIDER_START.md) for the preparation flow. It requires no purchase or funding; real payment validation remains a separate authorized step.

There is no dev-open mode. MCP exposes no registry write tools. `GET /api/publisher/ingest`, `PUT /api/publisher/ingest/{id}`, and `DELETE /api/publisher/ingest/{id}` fail closed with `PROVIDER_OWNERSHIP_NOT_IMPLEMENTED` until per-provider credentials and atomic lifecycle semantics exist.

`POST /api/publisher/ingest` is operator-gated, append-only and atomic in Redis. It returns `503 SERVICE_NOT_CONFIGURED` unless explicitly enabled with durable storage; `401 UNAUTHORIZED` for a wrong server credential; `400 VALIDATION_FAILED`; or `409 CARD_EXISTS`. The shared operator secret is not a provider ownership credential.

Never place seeds, private keys, facilitator keys, payment authorization payloads or customer data in a ServiceCard.
