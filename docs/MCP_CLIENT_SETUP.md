# MCP Client Setup · Stellar Bazaar x402

Connect to the real read-only Streamable HTTP server at `POST /api/mcp` (v0.5.0, 7 tools). Local URL: `http://127.0.0.1:3000/api/mcp`.

Every POST needs:

- `Accept: application/json, text/event-stream`
- `Content-Type: application/json`

```bash
curl -N -X POST http://127.0.0.1:3000/api/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0.0"}}}'
```

For Claude Desktop, use `mcp-remote`; Cursor and VS Code can use the URL directly. Verify `tools/list` before relying on any capability. The expected tool set is documented in [MCP_DISCOVERY.md](MCP_DISCOVERY.md); it contains no writes or payments.

`BazaarAgentClient` supports discovery and policy checks. `executeService` is fail-closed unless the host supplies a server-only payer and an independent `receiptVerifier` that reconciles network, asset, amount and destination. A transaction hash or provider response body alone is insufficient.
