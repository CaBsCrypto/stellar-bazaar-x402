# Agent quickstart / Inicio rápido de agentes

## Read-only MCP discovery

Connect to `POST /api/mcp`, initialize with protocol `2025-11-25`, then use the seven read-only tools documented in [MCP_DISCOVERY.md](MCP_DISCOVERY.md). The endpoint never writes, signs, pays or executes providers.

```typescript
import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

const client = new BazaarAgentClient({
  baseUrl: "http://127.0.0.1:3000",
  maxPriceAllowedUsdc: 0.05,
  allowedNetworks: ["stellar:testnet"],
  allowedAssets: ["USDC"],
});

const cards = await client.searchServicesMCP("riesgo swap");
const decision = client.validatePaymentPolicy(cards[0]);
```

## Paid execution boundary

Paid dynamic execution is disabled by default. To call `executeService`, the host must provide a Testnet-only payer from ignored server-side storage and a `receiptVerifier`. That verifier must independently reconcile receipt network, asset, exact amount and destination against the selected ServiceCard. Never accept a transaction hash or provider response body alone as proof of settlement.

Keep keys outside prompts, MCP arguments, browser bundles and logs. The checked-in Python example performs discovery and 402 inspection only; it contains no payer fallback and submits no payment.
