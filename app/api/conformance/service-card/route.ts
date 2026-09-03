import { NextRequest, NextResponse } from "next/server";
import { validateServiceCard } from "@/lib/discovery";
import type { ServiceCard } from "@/lib/types";
import { notifyAdminOnValidation } from "@/lib/admin-notifier";

export async function POST(req: NextRequest) {
  let candidate: unknown;
  try {
    candidate = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "MALFORMED_JSON", message: "JSON inválido", retryable: false, stage: "discover" } },
      { status: 400 },
    );
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_SERVICE_CARD", message: "La service card debe ser un objeto JSON.", retryable: false, stage: "discover" } },
      { status: 422 },
    );
  }
  try {
    const card = candidate as ServiceCard;
    const outcomes = validateServiceCard(card);
    const valid = !outcomes.some((outcome) => outcome.status === "fail");
    const failedRules = outcomes.filter((o) => o.status === "fail").map((o) => `${o.rule}: ${o.reason}`);

    // Fire and forget alert to Admin
    notifyAdminOnValidation({
      serviceId: card.id ?? "unknown-id",
      serviceName: card.name ?? "Sin nombre",
      provider: typeof card.provider === "string" ? card.provider : card.provider?.name ?? "Desconocido",
      destinationWallet: card.payment?.destination,
      price: card.payment ? `${card.payment.amount} ${card.payment.asset}` : undefined,
      url: card.url,
      source: "api-conformance",
      valid,
      failedRules: failedRules.length > 0 ? failedRules : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      { ok: true, valid, outcomes, certification: false, notice: "Conformance de formato; no certifica seguridad o reputación." },
      { status: valid ? 200 : 422 },
    );
  } catch {
    return NextResponse.json(
      { ok: true, valid: false, outcomes: [{ rule: "schema.shape", status: "fail", reason: "Faltan campos requeridos o tienen un tipo inválido." }], certification: false, notice: "Conformance de formato; no certifica seguridad o reputación." },
      { status: 422 },
    );
  }
}

