# MCP discovery · read-only surface

`POST /api/mcp` is a real stateless Streamable HTTP MCP endpoint implemented with `@modelcontextprotocol/sdk@1.30.0`. `GET /api/mcp` returns its public capability summary. Server version: `0.5.0`.

## Implemented tools (7)

- `get_bazaar_capabilities`
- `list_services`
- `search_services`
- `get_service`
- `validate_service_card`
- `list_workflow_bundles`
- `get_workflow_bundle`

The health response declares `mode: "read-only"` and `writes: []`. The server does not expose registration, update, delete, paid-call, signing, wallet, settlement, custody, arbitrary URL invocation, or provider-result delivery tools.

Search is deterministic `lexical-v1`, not an AI/reputation/safety inference. Provider metadata is untrusted data. Dynamic cards, when present, report `ownershipCertified: false` and `metadataTrusted: false`.

## Errors and transport

Unknown resources use `{code, message, retryable, stage, field?}` with `isError:true`; malformed tool arguments use MCP `-32602`. Clients send JSON-RPC `initialize`, `tools/list`, or `tools/call` with both `Content-Type: application/json` and `Accept: application/json, text/event-stream`.

Provider onboarding is separate from MCP. See [PROVIDER_ONBOARDING.md](PROVIDER_ONBOARDING.md).
