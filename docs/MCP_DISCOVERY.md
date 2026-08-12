# MCP discovery surface (MVP contract)

Bazaar currently exposes discovery over HTTP with shapes designed to map directly to an MCP server later. It does **not** expose an active paid-call tool.

## Search tool

Proposed MCP tool: `search_service_cards`.

- Input: `{ query: string, kind?: "http" | "mcp", scheme?: "exact" | "upto", asset?: string }`
- Local HTTP equivalent: `GET /api/discovery/search?query=riesgo+swap&kind=http`
- Output: `{ ok, query, ranking, results[], nextCursor, partialResults }`
- Every result contains the service card, numeric score, and human-readable ranking reasons.

Ranking `lexical-v1` is deterministic—not an AI claim. Exact token weights are name 5, tag 3, kind 2, description 1, plus a small documented Spanish alias table.

## List tool

Proposed MCP tool: `list_service_cards` maps to `GET /api/discovery/resources` and accepts structured filters `kind`, `scheme`, `asset`, `network`, and `maxPrice`.

## Errors

Errors use `{ code, message, retryable, stage }`. Current deterministic codes:

- `INVALID_QUERY`: missing natural-language query; HTTP 400; not retryable without changing input.
- Future reserved codes: `INVALID_FILTER`, `RESOURCE_NOT_FOUND`, `PARTIAL_RESULTS`.

An eventual `call_paid_service` tool remains future work and must not sign, pay, or call without explicit client-side authorization and a live x402 integration.
