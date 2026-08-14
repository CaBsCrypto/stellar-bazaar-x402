# MCP agent onboarding / Integración de agentes MCP

Endpoint: `POST /api/mcp` · Streamable HTTP · stateless · server `stellar-bazaar-discovery@0.2.0`.

This endpoint is implemented and tested read-only. It discovers and validates cards; it does not sign, pay, hold keys, invoke provider URLs, or deliver paid results.

## Client configuration

```json
{
  "name": "stellar-bazaar-discovery",
  "transport": "streamable-http",
  "url": "https://stellar-bazaar-x402.vercel.app/api/mcp"
}
```

Use that production URL only after this branch is reviewed, merged and deployed. Before deployment, replace it with the branch preview or local `http://127.0.0.1:3000/api/mcp`.

Initialize with MCP protocol version `2025-11-25`, then call `tools/list`. Available tools: `get_bazaar_capabilities`, `list_services`, `search_services`, `get_service`, and `validate_service_card`.

Agents must inspect `availability`, `execution.status`, `payment.status`, and `endpointVerified` before taking any action. `fixture-only`, `pilot-not-indexed`, `provider-unverified`, or `payment-not-active` must never be treated as callable/paid availability.

Errors are deterministic: unknown IDs return `RESOURCE_NOT_FOUND` with `isError:true`; invalid tool arguments use MCP `-32602`.
