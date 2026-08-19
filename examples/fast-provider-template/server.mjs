/**
 * examples/fast-provider-template/server.mjs
 *
 * Fast, lightweight microservice protected by x402 Testnet Facilitator.
 * Accepts deterministic micro-payments in USDC directly to the provider wallet.
 */

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { USDC_TESTNET_ADDRESS } from "@x402/stellar";

const PORT = Number(process.env.PORT ?? 4020);
const SELLER_ADDRESS = process.env.X402_SELLER_ADDRESS ?? "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ";
const FACILITATOR_API_KEY = process.env.STELLAR_X402_FACILITATOR_API_KEY ?? "";
const FACILITATOR_URL = process.env.STELLAR_X402_FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet";
const QUOTE_AMOUNT = "10000"; // 0.0010000 USDC (7 decimals)

const auth = FACILITATOR_API_KEY ? { Authorization: `Bearer ${FACILITATOR_API_KEY}` } : {};
const facilitator = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }),
});

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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1:4020"}`);

  // Route: /v1/weather/:city
  const match = url.pathname.match(/^\/v1\/weather\/([^/]+)$/);
  if (!match) {
    return sendJson(res, 404, { ok: false, error: "Not Found. Use /v1/weather/{city}" });
  }

  const city = decodeURIComponent(match[1]);
  const resourceUrl = url.href;

  const requirements = {
    scheme: "exact",
    network: "stellar:testnet",
    payTo: SELLER_ADDRESS,
    asset: USDC_TESTNET_ADDRESS,
    amount: QUOTE_AMOUNT,
    maxTimeoutSeconds: 60,
    extra: {
      areFeesSponsored: true,
      resourceUrl,
      method: req.method,
    },
  };

  const signature = req.headers["payment-signature"];
  if (!signature) {
    const required = {
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: resourceUrl,
        description: `Deterministic Weather & Climate Risk Oracle for ${city}`,
        mimeType: "application/json",
      },
      accepts: [requirements],
    };

    return sendJson(res, 402, required, {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required),
      "Cache-Control": "no-store",
    });
  }

  try {
    const payload = decodePaymentSignatureHeader(signature);

    // Verify payment signature
    const verified = await facilitator.verify(payload, requirements);
    if (!verified.isValid) {
      return sendJson(res, 402, {
        ok: false,
        error: { code: verified.invalidReason ?? "PAYMENT_INVALID", message: verified.invalidMessage ?? "Invalid payment signature" },
      });
    }

    // Settle on-chain
    const settled = await facilitator.settle(payload, requirements);
    if (!settled.success) {
      return sendJson(res, 402, {
        ok: false,
        error: { code: settled.errorReason ?? "SETTLEMENT_FAILED", message: settled.errorMessage ?? "Settlement rejected by facilitator" },
      });
    }

    // Deterministic Weather payload response
    const mockTemperatures = { "san-francisco": 18.2, london: 14.5, "buenos-aires": 22.0, tokyo: 26.3 };
    const temp = mockTemperatures[city.toLowerCase()] ?? 20.0;

    return sendJson(
      res,
      200,
      {
        ok: true,
        oracle: "Fast Weather Oracle",
        data: {
          city,
          temperatureCelsius: temp,
          humidityPercent: 62,
          windKmh: 14.8,
          climateRiskScore: 12,
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
      {
        "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled),
        "Cache-Control": "no-store",
      }
    );
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`⚡ Fast Provider Template running at http://127.0.0.1:${PORT}`);
  console.log(`💳 Non-custodial payouts directed to: ${SELLER_ADDRESS}`);
  console.log(`📋 Endpoint route: GET http://127.0.0.1:${PORT}/v1/weather/{city}`);
});
