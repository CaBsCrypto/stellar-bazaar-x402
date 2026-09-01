import { NextResponse } from "next/server";
import { pilotCards } from "@/lib/pilot-cards";
import {
  WEBSITE_INTELLIGENCE_PUBLIC_CARD_URL,
  WEBSITE_INTELLIGENCE_PUBLIC_ENDPOINT,
  validateVerifiedWebsiteIntelligenceDelivery,
  verifiedWebsiteIntelligenceDelivery,
} from "@/lib/website-intelligence-consumption";
import { canonicalServiceCardHash } from "@/lib/website-intelligence-readiness";
import { requestWebsiteIntelligencePaymentChallenge } from "@/lib/website-intelligence-one-shot";
import { validateDeliveryRecoveryIntent } from "@/lib/delivery-recovery-handoff";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  if (!validateVerifiedWebsiteIntelligenceDelivery()) {
    return NextResponse.json({ error: { code: "VERIFIED_DELIVERY_INTEGRITY_FAILED" } }, { status: 503, headers: noStore });
  }
  return NextResponse.json(verifiedWebsiteIntelligenceDelivery, { headers: noStore });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown; language?: unknown; requestId?: unknown; recoveryProof?: unknown };
    const url = typeof body.url === "string" ? body.url : "";
    const language = body.language === "en" ? "en" : "es";
    if (url !== "https://example.com") {
      return NextResponse.json({ error: { code: "FIXTURE_URL_NOT_ALLOWED", message: "Este piloto público solo acepta https://example.com." } }, { status: 400, headers: noStore });
    }
    const recoveryIntent = validateDeliveryRecoveryIntent({ requestId: body.requestId, proof: body.recoveryProof });

    const cardResponse = await fetch(WEBSITE_INTELLIGENCE_PUBLIC_CARD_URL, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!cardResponse.ok) throw new Error("PUBLIC_SERVICE_CARD_UNAVAILABLE");
    const card = await cardResponse.json() as Record<string, any>;
    const approvedCardHash = canonicalServiceCardHash(card);
    const declaredCardHash = card.payment?.binding?.cardHash;
    if (declaredCardHash !== approvedCardHash) throw new Error("PUBLIC_SERVICE_CARD_HASH_MISMATCH");

    const pilot = pilotCards.find(item => item.id === "website-intelligence-pilot");
    if (!pilot || pilot.payment.status !== "active-testnet") throw new Error("PILOT_PAYMENT_NOT_ACTIVE");
    const idempotencyKey = `bazaar-inspect-${crypto.randomUUID()}`;
    const challenge = await requestWebsiteIntelligencePaymentChallenge({
      requestBody: { url, language },
      idempotencyKey,
      localBaseUrl: new URL(WEBSITE_INTELLIGENCE_PUBLIC_ENDPOINT).origin,
      expectedPayTo: String(card.payment.payTo),
      approvedCardHash,
      publicResourceUrl: WEBSITE_INTELLIGENCE_PUBLIC_ENDPOINT,
      recoveryIntent,
    });

    return NextResponse.json({
      version: "bazaar.payment-inspection/v1",
      status: "payment-required",
      paymentPerformed: false,
      signerEnabled: false,
      service: { id: card.id, version: card.version, endpoint: WEBSITE_INTELLIGENCE_PUBLIC_ENDPOINT },
      request: { url, language, inputHash: challenge.inputHash, idempotencyKey },
      recovery: { requested: true, requestId: recoveryIntent.requestId, proofCommitted: true, tokenReceivedByBazaar: false, recoveryPath: "/v1/x402/audits/recover" },
      payment: {
        network: challenge.accepted.network,
        scheme: challenge.accepted.scheme,
        asset: challenge.accepted.asset,
        atomicAmount: challenge.accepted.amount,
        displayAmount: "0.001 USDC",
        payTo: challenge.accepted.payTo,
        maxTimeoutSeconds: challenge.accepted.maxTimeoutSeconds,
        feesSponsored: (challenge.accepted.extra as Record<string, unknown> | undefined)?.areFeesSponsored === true,
      },
      binding: { method: "POST", route: "/v1/x402/audits", cardHash: approvedCardHash, inputHash: challenge.inputHash, valid: true },
      next: { mode: "buyer-controlled-client", message: "Bazaar no firma ni guarda la clave del comprador. Una nueva compra se autoriza desde un cliente del comprador." },
    }, { status: 402, headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_INSPECTION_FAILED";
    const status = code.startsWith("INVALID_RECOVERY_") ? 400 : 502;
    return NextResponse.json({ error: { code } }, { status, headers: noStore });
  }
}
