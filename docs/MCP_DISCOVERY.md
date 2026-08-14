# MCP discovery — active read-only surface

Bazaar exposes a real, stateless Streamable HTTP MCP endpoint at `POST /api/mcp`, implemented with `@modelcontextprotocol/sdk@1.30.0`. `GET /api/mcp` returns a public health/capability summary.

Capability version: `bazaar.mcp-capabilities/v1`. Server version: `0.1.0`.

## Tools

- `get_bazaar_capabilities`: exact implemented/unavailable capability card.
- `list_services`: local service cards plus the external Quote contract record.
- `search_services`: deterministic `lexical-v1` search; never an AI, reputation or safety claim.
- `get_service`: lookup by machine-stable ID.
- `validate_service_card`: shape conformance only; never provider certification.

The endpoint is strictly read-only. It has no paid-call tool, payer, signing, authorization, wallet, settlement, custody or provider-result delivery. The standalone Quote provider documents an MCP-shaped tool name, but it does **not** publish an MCP transport; Bazaar reports that field as `transportPublished:false`.

## Deterministic errors

Unknown IDs return an MCP tool result with `isError:true` and the serialized envelope `{ code:"RESOURCE_NOT_FOUND", message, retryable:false, stage:"discover" }`. Schema-invalid inputs use the SDK's MCP `-32602` validation error. No service metadata is executed as instructions.

## Minimal client exchange

Send JSON-RPC 2.0 `initialize`, then `tools/list` or `tools/call` to `/api/mcp` with `Accept: application/json, text/event-stream`. Stateless requests do not require a session ID.
