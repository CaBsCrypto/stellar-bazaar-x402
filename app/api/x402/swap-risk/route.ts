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
import { calculateSwapRisk, type SwapSide } from "@/lib/swap-risk";
import { getFacilitatorClient } from "@/lib/x402-facilitator";
import {
  X402_MAX_TIMEOUT_SECONDS,
  X402_NETWORK,
  X402_QUOTE_AMOUNT,
  X402_SCHEME,
  X402_USDC_CONTRACT,
  requireServerX402Config,
} from "@/lib/x402-config";

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
  const pair = (req.nextUrl.searchParams.get("pair") ?? "").toUpperCase();
  const amount = Number(req.nextUrl.searchParams.get("amount"));
  const side = req.nextUrl.searchParams.get("side") as SwapSide;

  try {
    calculateSwapRisk(pair, amount, side);
  } catch {
    return structured("INVALID_QUOTE_INPUT", "Parámetros inválidos; no se solicita pago.", 400);
  }

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

  const resourceUrl = `${req.nextUrl.origin}${req.nextUrl.pathname}?pair=${encodeURIComponent(pair)}&amount=${amount}&side=${side}`;
  const resource: ResourceInfo = {
    url: resourceUrl,
    description: "Deterministic read-only Swap Risk Quote; informational only.",
    mimeType: "application/json",
  };
  const requirements: PaymentRequirements = {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    payTo: seller,
    asset: X402_USDC_CONTRACT,
    amount: X402_QUOTE_AMOUNT,
    maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
    extra: {
      areFeesSponsored: true,
      resourceUrl,
      method: "GET",
      route: req.nextUrl.pathname,
      inputHash: Buffer.from(`${pair}|${amount}|${side}`).toString("base64url"),
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
  if (
    accepted.scheme !== requirements.scheme ||
    accepted.network !== requirements.network ||
    accepted.payTo !== requirements.payTo ||
    accepted.asset !== requirements.asset ||
    accepted.amount !== requirements.amount ||
    accepted.extra?.resourceUrl !== resourceUrl
  ) {
    return structured(
      "PAYMENT_REQUIREMENTS_MISMATCH",
      "La firma no coincide con ruta, asset, monto o destinatario.",
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

  return NextResponse.json(
    {
      ok: true,
      result: calculateSwapRisk(pair, amount, side),
      payment: {
        network: settled.network,
        transaction: settled.transaction,
        payer: settled.payer,
        amount: X402_QUOTE_AMOUNT,
        asset: X402_USDC_CONTRACT,
        recipient: seller,
        facilitator: "OpenZeppelin hosted Testnet",
      },
    },
    {
      headers: {
        "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled),
        "Cache-Control": "no-store",
      },
    },
  );
}
