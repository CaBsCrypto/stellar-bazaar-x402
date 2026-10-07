import { NextRequest, NextResponse } from "next/server";
import { services } from "@/lib/catalog";
import { filterServices } from "@/lib/discovery";
import { toServiceCard, toPaidService } from "@/lib/service-card";
import { readDynamicServiceCards } from "@/lib/dynamic-registry";
import { measuredHandler } from "@/lib/acceptance-meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = measuredHandler(async (req: NextRequest) => {
  if (process.env.BAZAAR_ENABLE_MARKETPLACE === 'true') return NextResponse.json({error:{code:'USE_MARKET_CATALOG'}},{status:404,headers:{'Cache-Control':'no-store'}});
  const p = req.nextUrl.searchParams;
  const registry = await readDynamicServiceCards();
  const dynamicServices = registry.entries.map((d) => toPaidService(d.card));
  const combined = [...services, ...dynamicServices];

  const results = filterServices(combined, {
    kind: p.get("kind") ?? undefined,
    scheme: p.get("scheme") ?? undefined,
    asset: p.get("asset") ?? undefined,
    network: p.get("network") ?? undefined,
    maxPrice: p.get("maxPrice") ? Number(p.get("maxPrice")) : undefined,
  });

  return NextResponse.json(
    {
      results: results.map(toServiceCard),
      count: results.length,
      cursor: null,
      indexStatus: "local-mvp",
      partialResults: !registry.available,
      dynamicRegistry: registry.available ? "available" : "unavailable",
    },
    {
      headers: {
        "Cache-Control": process.env.BAZAAR_ACCEPTANCE_METER === "true" ? "no-store" : "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
});
