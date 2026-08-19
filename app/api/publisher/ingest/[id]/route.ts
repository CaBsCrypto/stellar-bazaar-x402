import { NextRequest, NextResponse } from "next/server";
import { deleteService, updateService } from "@/lib/service-ingest";

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const result = await updateService(id, body, providerKeyOf(req));
  if (!result.ok) {
    const status =
      result.error.code === "UNAUTHORIZED"
        ? 401
        : result.error.code === "RESOURCE_NOT_FOUND"
          ? 404
          : result.error.code === "VALIDATION_FAILED"
            ? 400
            : 500;
    return errorResponse(result.error, status);
  }

  return NextResponse.json({
    ok: true,
    valid: true,
    status: "updated-dynamic",
    id: result.entry.id,
    card: result.entry.card,
    resource: result.entry.card,
    hash: result.entry.hash,
    revision: result.entry.revision,
    registeredAt: result.entry.registeredAt,
    updatedAt: result.entry.updatedAt,
    outcomes: result.outcomes,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await deleteService(id, providerKeyOf(req));
  if (!result.ok) {
    const status =
      result.error.code === "UNAUTHORIZED"
        ? 401
        : result.error.code === "RESOURCE_NOT_FOUND"
          ? 404
          : 500;
    return errorResponse(result.error, status);
  }

  return NextResponse.json({
    ok: true,
    status: "deleted-dynamic",
    id: result.deleted.id,
    deletedCard: result.deleted.card,
    revision: result.deleted.revision,
  });
}