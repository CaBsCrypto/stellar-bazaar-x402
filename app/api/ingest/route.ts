import { NextRequest, NextResponse } from "next/server";
import { createDynamicServiceCard } from "@/lib/dynamic-registry";
import { parseServiceCardShape } from "@/lib/service-card-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const providerKeyHeader = req.headers.get("x-bazaar-provider-key");
  
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : providerKeyHeader?.trim();

  const expectedSecret = process.env.BAZAAR_PROVIDER_SECRET || "bazaar_provider_sec_2026";

  if (!token || token !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Credenciales de proveedor inválidas o ausentes." } },
      { status: 401 }
    );
  }

  let card: any;
  try {
    card = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "MALFORMED_JSON", message: "El body no es un JSON válido." } },
      { status: 400 }
    );
  }

  const shape = parseServiceCardShape(card);
  if (!shape.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_SHAPE", message: "Estructura de ServiceCard inválida.", issues: shape.issues } },
      { status: 422 }
    );
  }

  try {
    const result = await createDynamicServiceCard(card, "authorized-provider");
    
    return NextResponse.json(
      {
        ok: true,
        status: "indexed-dynamic",
        id: card.id,
        card: card,
        registeredAt: new Date().toISOString(),
        message: `Servicio '${card.id}' indexado exitosamente en el catálogo de Stellar Bazaar.`
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: { code: "STORAGE_ERROR", message: err.message || "Error al persistir la Service Card." } },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bazaar-Provider-Key",
    },
  });
}
