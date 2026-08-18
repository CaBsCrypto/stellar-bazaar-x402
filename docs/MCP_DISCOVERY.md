# MCP discovery — active read-only surface

Bazaar exposes a real, stateless Streamable HTTP MCP endpoint at `POST /api/mcp`, implemented with `@modelcontextprotocol/sdk@1.30.0`. `GET /api/mcp` returns a public health/capability summary.

Capability version: `bazaar.mcp-capabilities/v1`. Server version: `0.3.0`.

## Tools

- `get_bazaar_capabilities`: exact implemented/unavailable capability card.
- `list_services`: local service cards plus the external Quote contract record.
- `search_services`: deterministic `lexical-v1` search; never an AI, reputation or safety claim. Supports opaque cursor pagination (`limit` 1–50, `cursor`), returning `nextCursor` and `partialResults`.
- `get_service`: lookup by machine-stable ID.
- `validate_service_card`: shape conformance only; never provider certification.
- `list_workflow_bundles`: read-only workflow bundle fixtures (composition model; `execution:false`).
- `get_workflow_bundle`: bundle fixture + deterministic conformance outcomes (`bazaar.workflow-bundle/v1`).

The endpoint is strictly read-only. It has no paid-call tool, payer, signing, authorization, wallet, settlement, custody or provider-result delivery. The standalone Quote provider documents an MCP-shaped tool name, but it does **not** publish an MCP transport; Bazaar reports that field as `transportPublished:false`.

## Deterministic errors

All tool errors use the serialized envelope `{ code, message, retryable, stage, field? }` with `isError:true`. Unknown IDs return `RESOURCE_NOT_FOUND` (`stage:"discover"`, `retryable:false`); malformed pagination cursors return `INVALID_CURSOR` (`stage:"search"`, `retryable:true`, `field:"cursor"`). Schema-invalid inputs use the SDK's MCP `-32602` validation error. No service metadata is executed as instructions.

## Minimal client exchange

Send JSON-RPC 2.0 `initialize`, then `tools/list` or `tools/call` to `/api/mcp` with `Accept: application/json, text/event-stream`. Stateless requests do not require a session ID.
