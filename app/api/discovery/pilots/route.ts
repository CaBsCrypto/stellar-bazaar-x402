import { NextResponse } from "next/server";
import { pilotCards } from "@/lib/pilot-cards";

export function GET() {
  return NextResponse.json({
    ok: true,
    results: pilotCards,
    count: pilotCards.length,
    indexStatus: "pilot-indexed-https-qa",
    verifiedAt: "2026-08-30",
    paymentActive: true,
    activePaymentIds: pilotCards.filter((card) => card.payment.status === "active-testnet").map((card) => card.id),
    notice: {
      es: "Pilotos externos con deployment HTTPS verificado. Website Intelligence tiene un flujo pagado x402 Testnet verificado; los demás pilotos mantienen pagos inactivos.",
      en: "External pilots with verified HTTPS deployments. Website Intelligence has one verified x402 Testnet paid flow; all other pilots remain payment inactive.",
    },
  });
}
