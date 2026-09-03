/**
 * examples/agent-interactive-control.mjs
 *
 * Multi-Agent Interactive Controller:
 * Run as:
 *   1) Provider Agent (List & Spin up microservice):
 *      node examples/agent-interactive-control.mjs --role=provider
 *
 *   2) Buyer Agent (Discover & Pay via x402 Testnet):
 *      node examples/agent-interactive-control.mjs --role=buyer
 *
 *   3) Full Orchestrated Simulation (Both agents concurrently):
 *      node examples/agent-interactive-control.mjs --role=all
 */

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { USDC_TESTNET_ADDRESS } from "@x402/stellar";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";
import { validateServiceCard } from "../lib/discovery.ts";

// Load testnet credentials if available
if (existsSync(".env.x402.local")) {
  for (const raw of readFileSync(".env.x402.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim(), separator = line.indexOf("=");
    if (line && !line.startsWith("#") && separator > 0) {
      const key = line.slice(0, separator), value = line.slice(separator + 1);
      process.env[key] = value;
    }
  }
}

const PROVIDER_PORT = 4022;
const PAYER_SECRET = process.env.X402_PAYER_SECRET?.trim();
const SELLER_ADDRESS = process.env.X402_SELLER_ADDRESS ?? "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const FACILITATOR_API_KEY = process.env.STELLAR_X402_FACILITATOR_API_KEY ?? "";
const FACILITATOR_URL = process.env.STELLAR_X402_FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet";

const auth = FACILITATOR_API_KEY ? { Authorization: `Bearer ${FACILITATOR_API_KEY}` } : {};
const facilitator = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }),
});

const serviceCardFixture = {
  version: "bazaar.service-card/v0",
  id: "ai-market-intelligence",
  name: "AI Market Intelligence Oracle",
  description: "Real-time AI sentiment and volume anomaly scoring via Stellar x402.",
  kind: "http",
  url: `http://127.0.0.1:${PROVIDER_PORT}`,
  routeTemplate: "/v1/market-score/{pair}",
  input: [{ name: "pair", type: "string", required: true }],
  network: "stellar:testnet",
  payment: {
    scheme: "exact",
    asset: "USDC",
    amount: "0.001",
    destination: SELLER_ADDRESS,
  },
  provider: { name: "Agent Alpha Labs" },
  tags: ["ai", "oracle", "market", "sentiment"],
};

function createProviderServer() {
  const sendJson = (res, status, data, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, PAYMENT-SIGNATURE",
      "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
      ...headers,
    });
    res.end(JSON.stringify(data, null, 2));
  };

  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") return sendJson(res, 204, {});
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PROVIDER_PORT}`}`);

    const match = url.pathname.match(/^\/v1\/market-score\/([^/]+)$/);
    if (!match) return sendJson(res, 404, { ok: false, error: "Not Found. Use /v1/market-score/{pair}" });

    const pair = decodeURIComponent(match[1]);
    const resourceUrl = url.href;
    const requirements = {
      scheme: "exact",
      network: "stellar:testnet",
      payTo: SELLER_ADDRESS,
      asset: USDC_TESTNET_ADDRESS,
      amount: "10000",
      maxTimeoutSeconds: 60,
      extra: { areFeesSponsored: true, resourceUrl, method: req.method },
    };

    const signature = req.headers["payment-signature"];
    if (!signature) {
      const required = {
        x402Version: 2,
        error: "Payment required",
        resource: { url: resourceUrl, description: `AI Market Intelligence Oracle for ${pair}`, mimeType: "application/json" },
        accepts: [requirements],
      };
      return sendJson(res, 402, required, {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required),
        "Cache-Control": "no-store",
      });
    }

    try {
      const payload = decodePaymentSignatureHeader(signature);
      const verified = await facilitator.verify(payload, requirements);
      if (!verified.isValid) {
        return sendJson(res, 402, { ok: false, error: { code: verified.invalidReason ?? "PAYMENT_INVALID", message: verified.invalidMessage } });
      }

      const settled = await facilitator.settle(payload, requirements);
      if (!settled.success) {
        return sendJson(res, 402, { ok: false, error: { code: settled.errorReason ?? "SETTLEMENT_FAILED", message: settled.errorMessage } });
      }

      return sendJson(
        res,
        200,
        {
          ok: true,
          oracle: "AI Market Intelligence Oracle",
          data: {
            pair,
            bullishScore: 84.5,
            riskIndex: "LOW",
            anomalyDetected: false,
            timestamp: new Date().toISOString(),
          },
          receipt: {
            network: settled.network,
            transaction: settled.transaction,
            payer: settled.payer,
            amount: "0.001 USDC",
            recipient: SELLER_ADDRESS,
            explorerUrl: `https://stellar.expert/explorer/testnet/tx/${settled.transaction}`,
          },
        },
        { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled), "Cache-Control": "no-store" }
      );
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  });
}

// Role 1: Provider Agent
async function runProviderAgent() {
  console.log("=================================================================");
  console.log("🛡️ [PROVIDER AGENT] Initializing Service & Conformance Checks");
  console.log("=================================================================\n");

  console.log("▶ [Step 1] Validating ServiceCard schema and deterministic rules...");
  const outcomes = validateServiceCard(serviceCardFixture);
  const failed = outcomes.filter((o) => o.status === "fail");
  if (failed.length > 0) {
    console.error("❌ ServiceCard validation failed.");
    process.exit(1);
  }
  console.log("  ✓ ServiceCard passes all 11 Conformance Rules.");

  console.log(`\n▶ [Step 2] Launching x402 Microservice on port ${PROVIDER_PORT}...`);
  const server = createProviderServer();
  await new Promise((resolve) => server.listen(PROVIDER_PORT, "127.0.0.1", resolve));
  console.log(`  ✓ Service running at http://127.0.0.1:${PROVIDER_PORT}`);
  console.log(`  ✓ Payout destination: ${SELLER_ADDRESS}`);
  console.log(`  ✓ Price: ${serviceCardFixture.payment.amount} ${serviceCardFixture.payment.asset}`);
  console.log("\n🛡️ [PROVIDER AGENT] Ready and awaiting paid calls!\n");
  return server;
}

// Role 2: Buyer Agent
async function runBuyerAgent(customCard = serviceCardFixture) {
  console.log("=================================================================");
  console.log("🤖 [BUYER AGENT] Starting Autonomous Discovery and Payment");
  console.log("=================================================================\n");

  const client = new BazaarAgentClient({
    baseUrl: customCard.url,
    payerSecretKey: PAYER_SECRET,
    maxPriceAllowedUsdc: 0.05,
    allowedNetworks: ["stellar:testnet"],
    allowedAssets: ["USDC"],
    receiptVerifier: async ({ receipt, expected }) => {
      const match = receipt.network === expected.network;
      const success = receipt.success === true;
      const tx = typeof receipt.transaction === "string" && receipt.transaction.length > 0;
      return match && success && tx;
    },
  });

  console.log("▶ [Step 1] Inspecting target service:", customCard.name);
  console.log("▶ [Step 2] Evaluating safety policy budget (Max allowed: 0.05 USDC)...");
  const policy = client.validatePaymentPolicy(customCard);
  if (!policy.allowed) {
    console.error(`❌ Policy rejected: ${policy.reason}`);
    process.exit(1);
  }
  console.log("  ✓ Policy check passed.");

  if (!PAYER_SECRET) {
    console.log("\n⚠️ Note: No X402_PAYER_SECRET provided. Performing preflight challenge check.");
    const unpaid = await fetch(`${customCard.url}/v1/market-score/XLM-USDC`);
    console.log(`  ✓ Unpaid request received HTTP status: ${unpaid.status} (Expected 402)`);
    return;
  }

  console.log("\n▶ [Step 3] Executing paid call with Testnet USDC settlement...");
  try {
    const result = await client.executeService(customCard, { pair: "XLM-USDC" });
    console.log("\n🎉 [SUCCESS] Payment settled and payload received!");
    console.log("📦 Data:", JSON.stringify(result.data, null, 2));
    console.log("💳 Transaction Hash:", result.payment.transactionHash);
    console.log("🔗 Stellar Explorer:", result.payment.receiptUrl);
  } catch (err) {
    console.error("❌ Execution error:", err.message);
  }
}

// Main CLI selector
const roleArg = process.argv.find((a) => a.startsWith("--role="))?.split("=")[1] ?? "all";

if (roleArg === "provider") {
  await runProviderAgent();
} else if (roleArg === "buyer") {
  await runBuyerAgent();
} else {
  // Run both
  const server = await runProviderAgent();
  await new Promise((r) => setTimeout(r, 1000));
  await runBuyerAgent();
  server.close();
}
