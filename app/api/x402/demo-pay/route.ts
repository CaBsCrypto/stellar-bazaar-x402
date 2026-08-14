import { NextResponse } from "next/server";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { requireLocalResourceBaseUrl } from "@/lib/x402-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.X402_ENABLE_LOCAL_PAYER !== "true") {
    return NextResponse.json(
      { ok: false, error: { code: "LOCAL_PAYER_DISABLED", message: "Demo payer sólo disponible en entorno local explícitamente habilitado.", retryable: false } },
      { status: 403 },
    );
  }
  const secret = process.env.X402_PAYER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: { code: "PAYER_SECRET_MISSING", message: "Seed Testnet no configurada server-side.", retryable: false } },
      { status: 503 },
    );
  }
  try {
    const signer = createEd25519Signer(secret, "stellar:testnet");
    const client = new x402Client().register("stellar:testnet", new ExactStellarScheme(signer));
    const paidFetch = wrapFetchWithPayment(fetch, client);
    const base = requireLocalResourceBaseUrl();
    const response = await paidFetch(`${base}/api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy`);
    const body = await response.json();
    return NextResponse.json(
      { status: response.status, paymentResponsePresent: response.headers.has("payment-response"), body },
      { status: response.status },
    );
  } catch (error) {
    const code = error instanceof Error && error.message === "X402_LOCAL_BASE_URL_REQUIRED"
      ? "LOCAL_PAYER_TARGET_REJECTED"
      : "TESTNET_PAYMENT_FAILED";
    return NextResponse.json(
      { ok: false, error: { code, message: "Pago Testnet no completado; revisa configuración server-only y destino loopback.", retryable: code === "TESTNET_PAYMENT_FAILED" } },
      { status: code === "LOCAL_PAYER_TARGET_REJECTED" ? 400 : 402 },
    );
  }
}
