import { NextRequest, NextResponse } from "next/server";
import { validateServiceCard } from "@/lib/discovery";
import { saveDynamicServiceCard } from "@/lib/dynamic-registry";
import type { ServiceCard } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizePayload(data: unknown): ServiceCard | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  // Prevent prototype pollution on own properties
  if (
    Object.prototype.hasOwnProperty.call(data, "__proto__") ||
    Object.prototype.hasOwnProperty.call(data, "prototype")
  ) {
    return null;
  }
  return data as ServiceCard;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "MALFORMED_JSON",
          message: "El cuerpo de la solicitud no es un JSON válido.",
          retryable: false,
          stage: "discover",
        },
      },
      { status: 400 }
    );
  }

  const card = sanitizePayload(body);
  if (!card) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "El cuerpo debe ser un objeto JSON ServiceCard válido.",
          retryable: false,
          stage: "discover",
        },
      },
      { status: 400 }
    );
  }

  try {
    const outcomes = validateServiceCard(card);
    const failedOutcomes = outcomes.filter((o) => o.status === "fail");

    if (failedOutcomes.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          valid: false,
          status: "validation-failed",
          failedRules: failedOutcomes.map((f) => ({ rule: f.rule, reason: f.reason })),
          outcomes,
          notice: "La ServiceCard no cumple las reglas deterministas de conformance.",
        },
        { status: 400 }
      );
    }

    const { hash, registeredAt } = saveDynamicServiceCard(card);

    return NextResponse.json(
      {
        ok: true,
        valid: true,
        status: "indexed-dynamic",
        id: card.id,
        card,
        resource: card,
        hash,
        registeredAt,
        outcomes,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        valid: false,
        error: {
          code: "INGESTION_ERROR",
          message: err instanceof Error ? err.message : "Error interno validando tarjeta.",
          retryable: false,
          stage: "discover",
        },
      },
      { status: 400 }
    );
  }
}
