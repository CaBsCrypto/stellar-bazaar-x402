import { NextRequest, NextResponse } from "next/server";
import { createService, registryMutationConfigured, authorizeProviderKey } from "@/lib/service-ingest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!registryMutationConfigured()) return NextResponse.json({ok:false,error:{code:"SERVICE_NOT_CONFIGURED"}},{status:503});
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : req.headers.get("x-bazaar-provider-key")?.trim();
  if (!authorizeProviderKey(token)) return NextResponse.json({ok:false,error:{code:"UNAUTHORIZED"}},{status:401});
  let card: unknown;
  try { card = await req.json(); }
  catch { return NextResponse.json({ok:false,error:{code:"MALFORMED_JSON"}},{status:400}); }
  const result = await createService(card, token);
  if (!result.ok) {
    const status = result.error.code === "CARD_EXISTS" ? 409 : result.error.code === "UNAUTHORIZED" ? 401 : result.error.code === "VALIDATION_FAILED" ? 422 : result.error.code === "SERVICE_NOT_CONFIGURED" ? 503 : 500;
    return NextResponse.json({ok:false,error:result.error},{status});
  }
  return NextResponse.json({ok:true,status:"indexed-dynamic",id:result.entry.id,card:result.entry.card,registeredAt:result.entry.registeredAt},{status:201});
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
