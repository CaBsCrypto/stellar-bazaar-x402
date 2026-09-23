import { TESTNET_ASSETS, xlmPilotEnabled } from "./payment-options.ts";
import { FilePaymentJournal } from "./pilot-payment-store.ts";
import { settlePilotOnce } from "./pilot-settlement.ts";

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
import { calculateSwapRisk, type SwapSide } from "./swap-risk.ts";
import { getFacilitatorClient } from "./x402-facilitator.ts";
import {
  X402_MAX_TIMEOUT_SECONDS,
  X402_NETWORK,
  X402_QUOTE_AMOUNT,
  X402_SCHEME,
  X402_USDC_CONTRACT,
  requireServerX402Config,
} from "./x402-config.ts";
import { canonicalResultSha256 } from "./delivery-result.ts";
import { paymentRequirementMismatches } from "./x402-requirements.ts";

export const dynamic = "force-dynamic";


const structured = (code: string, message: string, status: number) =>
  Response.json(
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

export async function handleSandboxPayment(req: Request, deps = {
  config:requireServerX402Config, facilitator:getFacilitatorClient,
  pilot:xlmPilotEnabled, directory:()=>process.env.X402_PILOT_STATE_DIR,
  payments:()=>process.env.X402_PILOT_PAYMENTS_ENABLED === "true",
}) {
  const requestUrl=new URL(req.url);
  const pair = (requestUrl.searchParams.get("pair") ?? "").toUpperCase();
  const amount = Number(requestUrl.searchParams.get("amount"));
  const side = requestUrl.searchParams.get("side") as SwapSide;

  try {
    calculateSwapRisk(pair, amount, side);
  } catch {
    return structured("INVALID_QUOTE_INPUT", "Parámetros inválidos; no se solicita pago.", 400);
  }

  let seller: string;
  try {
    seller = deps.config().seller;
  } catch {
    return structured(
      "X402_SERVER_NOT_CONFIGURED",
      "Falta configuración server-only de facilitator/seller Testnet.",
      503,
    );
  }

  const resourceUrl = `${requestUrl.origin}${requestUrl.pathname}?pair=${encodeURIComponent(pair)}&amount=${amount}&side=${side}`;
  const resource: ResourceInfo = {
    url: resourceUrl,
    description: "Deterministic read-only Swap Risk Quote; informational only.",
    mimeType: "application/json",
  };
  let requirements: PaymentRequirements = {
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
      route: requestUrl.pathname,
      inputHash: Buffer.from(`${pair}|${amount}|${side}`).toString("base64url"),
    },
  };

  const pilot=deps.pilot();
  if(pilot && (!deps.directory() || !["127.0.0.1","localhost"].includes(requestUrl.hostname))) return structured("PILOT_LOCAL_STORAGE_REQUIRED","El piloto XLM requiere almacenamiento privado local y origen localhost.",503);
  const options:PaymentRequirements[]=pilot ? [requirements,{...requirements,asset:TESTNET_ASSETS.XLM,amount:"100000"}] : [requirements];
  const signature = req.headers.get("payment-signature");
  if (!signature) {
    const required = { x402Version: 2, error: "Payment required", resource, accepts: options };
    return Response.json(required, {
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
  const selected=options.find(option=>option.asset === accepted.asset);
  if(!selected)return structured("PAYMENT_ASSET_NOT_ACCEPTED","Activo no admitido.",402);
  requirements=selected;
  const mismatches = paymentRequirementMismatches(accepted, {
    scheme: requirements.scheme,
    network: requirements.network,
    payTo: requirements.payTo,
    asset: requirements.asset,
    amount: requirements.amount,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    resourceUrl,
    method: "GET",
    route: requestUrl.pathname,
    inputHash: String(requirements.extra?.inputHash),
  });
  if (mismatches.length > 0) {
    return structured(
      "PAYMENT_REQUIREMENTS_MISMATCH",
      `La firma no coincide con el contrato fijado (${mismatches.join(", ")}).`,
      402,
    );
  }

  if(pilot && !deps.payments()) return structured("PILOT_PAYMENTS_DISABLED","Piloto local: compras deshabilitadas hasta autorización de la prueba Testnet.",503);
  const facilitator = deps.facilitator();
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
    if(pilot){
      const operationId=req.headers.get("idempotency-key");
      if(!operationId || !/^[a-zA-Z0-9_-]{8,128}$/.test(operationId))return structured("OPERATION_ID_REQUIRED","El piloto requiere Idempotency-Key estable.",400);
      settled=await settlePilotOnce(new FilePaymentJournal(deps.directory()!),operationId,payload,requirements,()=>facilitator.settle(payload,requirements));
    }else settled = await facilitator.settle(payload, requirements);
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

  const result = calculateSwapRisk(pair, amount, side);
  return Response.json(
    {
      ok: true,
      result,
      payment: {
        network: settled.network,
        transaction: settled.transaction,
        payer: settled.payer,
        amount: requirements.amount,
        asset: requirements.asset,
        recipient: seller,
        facilitator: "OpenZeppelin hosted Testnet",
      },
      delivery: {
        model: "sync",
        status: "result-returned",
        evidence: "provider-response",
        resultAvailable: true,
        independentlyVerified: false,
        resultHash: {
          algorithm: "sha256",
          scope: "canonical-result",
          value: canonicalResultSha256(result),
        },
        message: "Provider returned this synchronous response after settlement; Bazaar does not independently verify result quality.",
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
