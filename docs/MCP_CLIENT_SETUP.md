# MCP Client Setup · Stellar Bazaar x402

> Nota en español: esta guía técnica está en inglés. Para la descripción general del proyecto en español, consulta [README.es.md](../README.es.md).

How to connect real MCP clients to the Streamable HTTP server at
`POST /api/mcp` (v0.4.0, 11 tools). Local URL:
`http://127.0.0.1:3000/api/mcp`; production:
`https://stellar-bazaar-x402.vercel.app/api/mcp`.

## (a) Raw HTTP (JSON-RPC 2.0)

The server uses `WebStandardStreamableHTTPServerTransport` with
`enableJsonResponse: true` (`app/api/mcp/route.ts:8-14`). Every `POST` needs:

- `Accept: application/json, text/event-stream`
- `Content-Type: application/json`

The SDK rejects requests whose `Accept` lacks both values with `406`
(`node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js:463-470`). The server is stateless (`sessionIdGenerator: undefined`), so no session IDs are needed.

**Initialize:**

```bash
curl -N -X POST http://127.0.0.1:3000/api/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0.0"}}}'
```

Response: `serverInfo.name` is `stellar-bazaar-discovery` (asserted by
`scripts/test-e2e-ecosystem.mjs:65-70`).

**One `tools/call` (e.g. `list_services`):**

```bash
curl -N -X POST http://127.0.0.1:3000/api/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_services","arguments":{}}}'
```

Result: `content[0].text` holds a JSON string (e.g. `{services: [...], pilots: [], partialResults: false, nextCursor: null}`), plus a typed `structuredContent` (`lib/mcp-onboarding-server.ts:31-44`). Tool errors come back as `isError: true` with the error envelope in `content[0].text` (e.g. `RESOURCE_NOT_FOUND`).

## (b) MCP Inspector / Claude Desktop via `mcp-remote`

For Streamable HTTP, proxy through `mcp-remote`:

```bash
npx -y mcp-remote http://127.0.0.1:3000/api/mcp
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "stellar-bazaar": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3000/api/mcp"]
    }
  }
}
```

## (c) Cursor / VS Code

`.cursor/mcp.json` or VS Code `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "stellar-bazaar": {
      "url": "http://127.0.0.1:3000/api/mcp"
    }
  }
}
```

(VS Code and Cursor speak Streamable HTTP natively; no proxy needed.)

## (d) The 11 tools and their input schemas

Registered in `lib/mcp-onboarding-server.ts` (`createOnboardingMcpServer`).

| Tool | Input schema | Needs `providerKey`? |
|---|---|---|
| `get_bazaar_capabilities` | `{}` | no |
| `list_services` | `{includePilots?: boolean}` | no |
| `search_services` | `{query: string (min 1), limit?: number (1-50), cursor?: string}` | no |
| `get_service` | `{id: string (min 1)}` | no |
| `list_workflow_bundles` | `{}` | no |
| `get_workflow_bundle` | `{id: string (min 1)}` | no |
| `validate_service_card` | `{card: Record<string, unknown>}` | no |
| `register_service` | `{card: Record, providerKey?: string}` | yes (prod mode) |
| `update_service` | `{id, card, providerKey?: string}` | yes (prod mode) |
| `delete_service` | `{id, providerKey?: string}` | yes (prod mode) |
| `list_my_services` | `{providerKey?: string}` | yes (prod mode) |

`providerKey` is the shared secret matching `BAZAAR_PROVIDER_SECRET`
(`lib/service-ingest.ts:54-60`). Without that env var the registry runs
dev-open and writes succeed without a key; with it set, missing/wrong keys
return `UNAUTHORIZED` (isError). Pagination: `search_services` returns
base64url cursors (`nextCursor`) and `partialResults` (PAGE_LIMIT_MAX = 50,
`lib/mcp-onboarding-server.ts:32-42`).

## (e) Agent SDK path

`lib/bazaar-agent-client.ts` wraps discovery + policy + paid execution:
`searchServicesREST`, `searchServicesMCP`, `validatePaymentPolicy`,
`executeService` (handles the 402 challenge and reads `PAYMENT-RESPONSE`
for the tx hash, `lib/bazaar-agent-client.ts:124-166`). Ready-made demo:
`examples/agent-autonomous-buyer.mjs` — run `npm run agent:quickstart`
(requires Node 22.18+ because the example imports
`../lib/bazaar-agent-client.ts` directly; also needs `X402_PAYER_SECRET`,
which it loads from `.env.local` or `.env.x402.local`).