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

## Paid execution & reconciliation runner

For verifiable on-chain Testnet execution with receipt reconciliation, use the reference agent runner:

```bash
# Dry-run (policy checks & 402 challenge inspection without spending):
npm run agent:paid-execution

# Paid Testnet settlement (requires local X402_PAYER_SECRET):
npm run agent:paid-execution -- --execute-payment
```

To test the complete 3-actor flow (Provider Service + Bazaar Discovery + Buyer Agent Settlement) in an isolated local loopback:

```bash
npm run test:three-actors:e2e
```

Keep keys outside prompts, MCP arguments, browser bundles and logs. The checked-in Python example performs discovery and 402 inspection only; it contains no payer fallback and submits no payment.
