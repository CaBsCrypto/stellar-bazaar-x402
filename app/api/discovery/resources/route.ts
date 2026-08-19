import { NextRequest, NextResponse } from "next/server";
import { services } from "@/lib/catalog";
import { filterServices } from "@/lib/discovery";
import { toServiceCard, toPaidService } from "@/lib/service-card";
import { getAllDynamicServiceCards } from "@/lib/dynamic-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const dynamicServices = (await getAllDynamicServiceCards()).map((d) => toPaidService(d.card));
  const combined = [...services, ...dynamicServices];

  const results = filterServices(combined, {
    kind: p.get("kind") ?? undefined,
    scheme: p.get("scheme") ?? undefined,
    asset: p.get("asset") ?? undefined,
    network: p.get("network") ?? undefined,
    maxPrice: p.get("maxPrice") ? Number(p.get("maxPrice")) : undefined,
  });

  return NextResponse.json({
    results: results.map(toServiceCard),
    count: results.length,
    cursor: null,
    indexStatus: "local-mvp",
  });
}
