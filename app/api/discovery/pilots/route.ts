import { NextResponse } from "next/server";
import { pilotCards } from "@/lib/pilot-cards";

export function GET() {
  return NextResponse.json({
    ok: true,
    results: pilotCards,
    count: pilotCards.length,
    indexStatus: "pilot-indexed-https-qa",
    verifiedAt: "2026-08-22",
    paymentActive: false,
    notice: {
      es: "Pilotos externos con deployment HTTPS verificado. Siguen en modo fixture o discovery-only; no tienen pagos x402 activos.",
      en: "External pilots with verified HTTPS deployments. They remain fixture or discovery-only; x402 payments are not active.",
    },
  });
}
