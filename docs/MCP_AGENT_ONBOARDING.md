# MCP agent onboarding / Integración de agentes MCP

Endpoint: `POST /api/mcp` · Streamable HTTP · stateless · server `stellar-bazaar-discovery@0.4.0`.

This endpoint is implemented and tested. It discovers and validates cards and supports provider registry writes (`register_service`, `update_service`, `delete_service`, `list_my_services`). It does **not** sign, pay, hold keys, invoke provider URLs, or deliver paid results.

## Client configuration

```json
{
  "name": "stellar-bazaar-discovery",
  "transport": "streamable-http",
  "url": "https://stellar-bazaar-x402.vercel.app/api/mcp"
}
```

Use that production URL only after this branch is reviewed, merged and deployed. Before deployment, replace it with the branch preview or local `http://127.0.0.1:3000/api/mcp`.

Initialize with MCP protocol version `2025-11-25`, then call `tools/list`. Available tools (11): `get_bazaar_capabilities`, `list_services`, `search_services`, `get_service`, `validate_service_card`, `list_workflow_bundles`, `get_workflow_bundle`, and registry writes `register_service`, `update_service`, `delete_service`, `list_my_services`.

Agents must inspect `availability`, `execution.status`, `payment.status`, and `endpointVerified` before taking any action. `fixture-only`, `pilot-not-indexed`, `provider-unverified`, or `payment-not-active` must never be treated as callable/paid availability.

## Registry writes (provider-owned)

Write tools require `providerKey` (the `BAZAAR_PROVIDER_SECRET` shared secret) as a tool argument. See [PROVIDER_ONBOARDING.md](PROVIDER_ONBOARDING.md) for the full flow, error codes and examples. Deterministic registry errors: `UNAUTHORIZED`, `CARD_EXISTS`, `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `STORAGE_ERROR`.

Errors are deterministic: unknown IDs return `RESOURCE_NOT_FOUND` with `isError:true`; invalid tool arguments use MCP `-32602`.