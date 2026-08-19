# MCP discovery — active surface (read + registry writes)

Bazaar exposes a real, stateless Streamable HTTP MCP endpoint at `POST /api/mcp`, implemented with `@modelcontextprotocol/sdk@1.30.0`. `GET /api/mcp` returns a public health/capability summary.

Capability version: `bazaar.capabilities/v1`. Server version: `0.4.0`.

## Tools (11)

Read (7):
- `get_bazaar_capabilities`: capability card, incl. `writes` list and registry persistence mode.
- `list_services`: static catalog + provider-registered dynamic cards; pilot fixtures via `includePilots`.
- `search_services`: deterministic `lexical-v1` search; never an AI, reputation or safety claim. Supports opaque cursor pagination (`limit` 1–50, `cursor`), returning `nextCursor` and `partialResults`.
- `get_service`: lookup by machine-stable ID (static, dynamic, pilots); dynamic cards include `registry:{ provider, hash, revision, registeredAt, updatedAt }`.
- `validate_service_card`: shape conformance only; never provider certification.
- `list_workflow_bundles`: read-only workflow bundle fixtures (composition model; `execution:false`).
- `get_workflow_bundle`: bundle fixture + deterministic conformance outcomes (`bazaar.workflow-bundle/v1`).

Registry writes (4), all requiring `providerKey` (shared secret, see [PROVIDER_ONBOARDING.md](PROVIDER_ONBOARDING.md)):
- `register_service`: persist a provider-owned ServiceCard; `409 CARD_EXISTS` on duplicate id.
- `update_service`: replace by id; bumps `revision`; `404 RESOURCE_NOT_FOUND` if unknown.
- `delete_service`: remove by id; `404 RESOURCE_NOT_FOUND` if unknown.
- `list_my_services`: list cards registered with the same provider key.

The endpoint has **no paid-call tool, payer, signing, wallet, settlement, custody or provider-result delivery** (`mode:"read-only"` refers to on-chain operations; registry writes are explicitly listed in the health `writes` field). The standalone Quote provider documents an MCP-shaped tool name, but it does **not** publish an MCP transport; Bazaar reports that field as `transportPublished:false`.

## Deterministic errors

All tool errors use the serialized envelope `{ code, message, retryable, stage, field? }` with `isError:true`. Codes: `RESOURCE_NOT_FOUND` (`stage:"discover"`), `INVALID_CURSOR` (`stage:"search"`, `field:"cursor"`), `BUNDLE_NOT_FOUND`, plus registry codes `UNAUTHORIZED`, `CARD_EXISTS` (`field:"id"`), `VALIDATION_FAILED` (`failedRules` included) and `STORAGE_ERROR`. Schema-invalid inputs use the SDK's MCP `-32602` validation error. No service metadata is executed as instructions.

## Minimal client exchange

Send JSON-RPC 2.0 `initialize`, then `tools/list` or `tools/call` to `/api/mcp` with `Accept: application/json, text/event-stream`. Stateless requests do not require a session ID. Registering a service persists it to the registry (Upstash Redis, provisioned 2026-08-19); later requests observe it through the read tools.