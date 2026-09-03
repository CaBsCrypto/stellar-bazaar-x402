import { NextRequest, NextResponse } from "next/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import {
  SettleError,
  VerifyError,
  type PaymentRequirements,
  type ResourceInfo,
} from "@x402/core/types";
import { getFacilitatorClient } from "@/lib/x402-facilitator";
import {
  X402_MAX_TIMEOUT_SECONDS,
  X402_NETWORK,
  X402_SCHEME,
  X402_USDC_CONTRACT,
  requireServerX402Config,
} from "@/lib/x402-config";
import { canonicalResultSha256 } from "@/lib/delivery-result";
import { paymentRequirementMismatches } from "@/lib/x402-requirements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const structured = (code: string, message: string, status: number) =>
  NextResponse.json(
    { ok: false, error: { code, message, retryable: status >= 500, stage: "payment" } },
    { status },
  );

const safeFacilitatorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return "Respuesta desconocida del facilitador.";
  return error.message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")
    .slice(0, 240);
};

export async function GET(req: NextRequest) {
  const pair = (req.nextUrl.searchParams.get("pair") ?? "XLM/USDC").toUpperCase();
  const depth = Number(req.nextUrl.searchParams.get("depth") ?? 5);

  let seller: string;
  try {
    seller = requireServerX402Config().seller;
  } catch {
    return structured(
      "X402_SERVER_NOT_CONFIGURED",
      "Falta configuración server-only de facilitator/seller Testnet.",
      503,
    );
  }

  const resourceUrl = `${req.nextUrl.origin}/api/x402/market-window`;
  const resource: ResourceInfo = {
    url: resourceUrl,
    description: "Devuelve un paquete acotado de observaciones y profundidad de mercado DEX en Stellar.",
    mimeType: "application/json",
  };

  const requirements: PaymentRequirements = {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    payTo: seller,
    asset: X402_USDC_CONTRACT,
    amount: "20000", // 0.002 USDC (7 decimales)
    maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
    extra: {
      areFeesSponsored: true,
      resourceUrl,
      method: "GET",
      route: req.nextUrl.pathname,
      inputHash: Buffer.from(`${pair}|${depth}`).toString("base64url"),
    },
  };

  const signature = req.headers.get("payment-signature");
  if (!signature) {
    const required = { x402Version: 2, error: "Payment required", resource, accepts: [requirements] };
    return NextResponse.json(required, {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required),
        "Cache-Control": "no-store",
      },
    });
  }

  let payload;
  try {
    payload = decodePaymentSignatureHeader(signature);
  } catch {
    return structured("MALFORMED_PAYMENT_SIGNATURE", "PAYMENT-SIGNATURE inválida.", 402);
  }

  const accepted = payload.accepted;
  if (!accepted || typeof accepted !== "object") {
    return structured("MALFORMED_PAYMENT_SIGNATURE", "PAYMENT-SIGNATURE no contiene requirements aceptados.", 402);
  }

  const mismatches = paymentRequirementMismatches(accepted, {
    scheme: requirements.scheme,
    network: requirements.network,
    payTo: requirements.payTo,
    asset: requirements.asset,
    amount: requirements.amount,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    resourceUrl,
    method: "GET",
    route: req.nextUrl.pathname,
    inputHash: String(requirements.extra?.inputHash),
  });
  if (mismatches.length > 0) {
    return structured(
      "PAYMENT_REQUIREMENTS_MISMATCH",
      `La firma no coincide con el contrato fijado (${mismatches.join(", ")}).`,
      402,
    );
  }

  const facilitator = getFacilitatorClient();
  let verified;
  try {
    verified = await facilitator.verify(payload, requirements);
  } catch (error) {
    if (error instanceof VerifyError) {
      return structured(
        error.invalidReason ?? "VERIFY_REJECTED",
        error.invalidMessage ?? "El facilitador rechazó la verificación.",
        402,
      );
    }
    return structured(
      "VERIFY_TRANSPORT_ERROR",
      `No se pudo completar la verificación: ${safeFacilitatorMessage(error)}`,
      502,
    );
  }
  if (!verified.isValid) {
    return structured(
      verified.invalidReason ?? "PAYMENT_INVALID",
      verified.invalidMessage ?? "Pago inválido.",
      402,
    );
  }

  let settled;
  try {
    settled = await facilitator.settle(payload, requirements);
  } catch (error) {
    if (error instanceof SettleError) {
      return structured(
        error.errorReason ?? "SETTLEMENT_REJECTED",
        error.errorMessage ?? "El facilitador rechazó el settlement.",
        402,
      );
    }
    return structured(
      "SETTLEMENT_TRANSPORT_ERROR",
      `No se pudo completar el settlement: ${safeFacilitatorMessage(error)}`,
      502,
    );
  }
  if (!settled.success) {
    return structured(
      settled.errorReason ?? "SETTLEMENT_FAILED",
      settled.errorMessage ?? "Settlement rechazado.",
      402,
    );
  }

  const result = {
    pair,
    depth,
    spreadBps: 12,
    midPrice: 0.1245,
    orderbook: {
      bids: [
        { price: 0.1244, amount: 25000 },
        { price: 0.1242, amount: 48000 },
        { price: 0.1240, amount: 100000 },
      ].slice(0, depth),
      asks: [
        { price: 0.1246, amount: 30000 },
        { price: 0.1248, amount: 55000 },
        { price: 0.1250, amount: 120000 },
      ].slice(0, depth),
    },
    volatility24h: "3.4%",
    timestamp: new Date().toISOString(),
  };

  const resultHash = canonicalResultSha256(result);
  const responseHeader = encodePaymentResponseHeader(settled);

  return NextResponse.json(
    {
      ok: true,
      serviceId: "market-window-mcp",
      result,
      delivery: {
        status: "delivered",
        resultAvailable: true,
        resultHash: {
          algorithm: "sha-256",
          scope: "body.result",
          value: resultHash,
        },
        message: "Stellar DEX market depth window delivered successfully via x402.",
      },
      payment: {
        network: settled.network,
        transaction: settled.transaction,
        payer: settled.payer,
        recipient: seller,
        amount: "0.002 USDC",
      },
    },
    {
      status: 200,
      headers: {
        "PAYMENT-RESPONSE": responseHeader,
        "Cache-Control": "no-store",
      },
    },
  );
}
