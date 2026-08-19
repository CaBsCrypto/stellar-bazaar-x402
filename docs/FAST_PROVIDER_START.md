# ⚡ Fast Provider Start · Monetize Any API in Under 3 Minutes

Monetize existing REST APIs, microservices, and MCP tools with deterministic on-chain payments using **Stellar Bazaar x402** and **Soroban smart contracts**.

---

## 🧭 Why Stellar Bazaar x402?

- **Zero-Custody Direct Payouts:** Funds settle directly from the buyer/agent wallet into your Stellar account (`G...`) in USDC. Neither Stellar Bazaar nor OpenZeppelin ever holds your funds.
- **Pay-Per-Call Microtransactions:** Accept sub-cent micro-payments (e.g. `0.001 USDC` ≈ $0.001) with sub-second finality on Stellar Testnet and Pubnet.
- **Automatic Agent Discovery:** Publishing a valid **ServiceCard** exposes your API to autonomous LLM agents via MCP (Model Context Protocol) and REST discovery endpoints.
- **11-Rule Deterministic Conformance:** Standardized verification guarantees client interoperability, SSRF safety, and exact price/settlement predictability.

---

## 🚀 3 Simple Steps to Monetize

```
┌───────────────────┐      ┌────────────────────────┐      ┌─────────────────────┐
│  1. Wrap Endpoint │ ---> │ 2. Define ServiceCard  │ ---> │ 3. Publish to Bazaar│
│ (x402 Middleware) │      │  (USDC Price + Wallet) │      │ (Web Form / REST)   │
└───────────────────┘      └────────────────────────┘      └─────────────────────┘
```

---

### Step 1: Wrap Your Endpoint with x402

Return an **HTTP 402 Payment Required** challenge when an unpaid request arrives, and verify/settle the payment signature via the x402 Facilitator.

#### Node.js / Express Example

```javascript
import express from "express";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { USDC_TESTNET_ADDRESS } from "@x402/stellar";

const app = express();
app.use(express.json());

const SELLER_WALLET = process.env.X402_SELLER_ADDRESS; // Your Stellar G... address
const FACILITATOR_API_KEY = process.env.STELLAR_X402_FACILITATOR_API_KEY;
const FACILITATOR_URL = "https://channels.openzeppelin.com/x402/testnet";

const facilitator = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({
    verify: { Authorization: `Bearer ${FACILITATOR_API_KEY}` },
    settle: { Authorization: `Bearer ${FACILITATOR_API_KEY}` },
  }),
});

app.get("/v1/weather/:city", async (req, res) => {
  const { city } = req.params;
  const resourceUrl = `${req.protocol}://${req.get("host")}/v1/weather/${encodeURIComponent(city)}`;

  const requirements = {
    scheme: "exact",
    network: "stellar:testnet",
    payTo: SELLER_WALLET,
    asset: USDC_TESTNET_ADDRESS,
    amount: "10000", // 0.0010000 USDC (7 decimals)
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true, resourceUrl, method: "GET" },
  };

  const signature = req.headers["payment-signature"];
  if (!signature) {
    const required = {
      x402Version: 2,
      error: "Payment required",
      resource: { url: resourceUrl, description: "Real-time weather data", mimeType: "application/json" },
      accepts: [requirements],
    };
    return res.status(402)
      .set("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required))
      .json(required);
  }

  // Verify and settle payment
  const payload = decodePaymentSignatureHeader(signature);
  const verified = await facilitator.verify(payload, requirements);
  if (!verified.isValid) {
    return res.status(402).json({ ok: false, error: verified.invalidMessage ?? "Invalid payment" });
  }

  const settled = await facilitator.settle(payload, requirements);
  if (!settled.success) {
    return res.status(402).json({ ok: false, error: settled.errorMessage ?? "Settlement failed" });
  }

  // Return your business logic with settlement receipt
  res.set("PAYMENT-RESPONSE", encodePaymentResponseHeader(settled)).json({
    ok: true,
    data: { city, temperatureC: 21.5, conditions: "Clear", uvIndex: 4 },
    payment: { transaction: settled.transaction, payer: settled.payer, amount: "0.001 USDC" },
  });
});

app.listen(4020, () => console.log("Provider API live on port 4020"));
```

---

### Step 2: Define your `bazaar-card.json`

```json
{
  "version": "bazaar.service-card/v0",
  "id": "fast-weather-oracle",
  "name": "Fast Weather Oracle",
  "description": "Deterministic weather conditions and climate risk score for global cities via x402 payment.",
  "kind": "http",
  "url": "http://127.0.0.1:4020",
  "routeTemplate": "/v1/weather/{city}",
  "input": [
    {
      "name": "city",
      "type": "string",
      "required": true
    }
  ],
  "network": "stellar:testnet",
  "payment": {
    "scheme": "exact",
    "asset": "USDC",
    "amount": "0.001",
    "destination": "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ"
  },
  "provider": {
    "name": "Fast Weather Provider"
  },
  "tags": [
    "weather",
    "oracle",
    "climate-risk",
    "fast-start"
  ]
}
```

---

### Step 3: Publish to Stellar Bazaar

#### Option A: Web Form
Visit **[/publish](https://stellar-bazaar-x402.vercel.app/publish)**, paste your JSON card, check real-time conformance checks, and click **Publish Service**.

#### Option B: Programmatic HTTP API
```bash
curl -X POST https://stellar-bazaar-x402.vercel.app/api/publisher/ingest \
  -H "Content-Type: application/json" \
  -H "X-Bazaar-Provider-Key: <YOUR_BAZAAR_PROVIDER_SECRET>" \
  -d @bazaar-card.json
```
