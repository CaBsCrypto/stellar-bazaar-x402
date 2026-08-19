import { NextRequest, NextResponse } from "next/server";
import { createService, listMyServices, providerSecretConfigured } from "@/lib/service-ingest";
import { storageMode } from "@/lib/dynamic-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_KEY_HEADER = "x-bazaar-provider-key";

function providerKeyOf(req: NextRequest): string | undefined {
  const header = req.headers.get(PROVIDER_KEY_HEADER);
  return header?.trim() || undefined;
}

function errorResponse(error: { code: string; message: string; retryable: boolean; stage: string; field?: string; failedRules?: Array<{ rule: string; reason: string }> }, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  if (!providerSecretConfigured() && process.env.NODE_ENV === "production") {
    return errorResponse(
      {
        code: "SERVICE_NOT_CONFIGURED",
        message: "BAZAAR_PROVIDER_SECRET no está configurado en este entorno.",
        retryable: true,
        stage: "discover",
      },
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(
      {
        code: "MALFORMED_JSON",
        message: "El cuerpo de la solicitud no es un JSON válido.",
        retryable: false,
        stage: "discover",
      },
      400,
    );
  }

  const result = await createService(body, providerKeyOf(req));
  if (!result.ok) {
    const status =
      result.error.code === "UNAUTHORIZED"
        ? 401
        : result.error.code === "CARD_EXISTS"
          ? 409
          : result.error.code === "VALIDATION_FAILED"
            ? 400
            : 500;
    return errorResponse(result.error, status);
  }

  return NextResponse.json(
    {
      ok: true,
      valid: true,
      status: "indexed-dynamic",
      id: result.entry.id,
      card: result.entry.card,
      resource: result.entry.card,
      hash: result.entry.hash,
      revision: result.entry.revision,
      registeredAt: result.entry.registeredAt,
      storage: storageMode(),
      outcomes: result.outcomes,
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  if (!providerSecretConfigured() && process.env.NODE_ENV === "production") {
    return errorResponse(
      {
        code: "SERVICE_NOT_CONFIGURED",
        message: "BAZAAR_PROVIDER_SECRET no está configurado en este entorno.",
        retryable: true,
        stage: "discover",
      },
      503,
    );
  }

  const result = await listMyServices(providerKeyOf(req));
  if (!result.ok) {
    const status = result.error.code === "UNAUTHORIZED" ? 401 : 500;
    return errorResponse(result.error, status);
  }

  return NextResponse.json({
    ok: true,
    services: result.entries.map((entry) => ({
      id: entry.id,
      hash: entry.hash,
      revision: entry.revision,
      registeredAt: entry.registeredAt,
      updatedAt: entry.updatedAt,
      card: entry.card,
    })),
    count: result.entries.length,
    storage: storageMode(),
  });
}