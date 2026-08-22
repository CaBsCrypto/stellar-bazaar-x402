import { NextRequest, NextResponse } from "next/server";
import { services } from "@/lib/catalog";
import { filterServices, rankServices } from "@/lib/discovery";
import { toServiceCard, toPaidService } from "@/lib/service-card";
import { readDynamicServiceCards } from "@/lib/dynamic-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("query")?.trim();

  if (!q) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_QUERY",
          message: "query es obligatorio",
          retryable: false,
          stage: "discover",
        },
      },
      { status: 400 },
    );
  }

  const registry = await readDynamicServiceCards();
  const dynamicServices = registry.entries.map((d) => toPaidService(d.card));
  const combined = [...services, ...dynamicServices];

  const base = filterServices(combined, {
    kind: p.get("kind") ?? undefined,
    scheme: p.get("scheme") ?? undefined,
    asset: p.get("asset") ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    query: q,
    ranking: {
      version: "lexical-v1",
      method: "exact token weights: name 5, tag 3, asset 3, kind 2, description 1",
      ai: false,
    },
    results: rankServices(base, q).map((r) => ({
      resource: toServiceCard(r.service),
      score: r.score,
      reasons: r.reasons,
    })),
    nextCursor: null,
    partialResults: !registry.available,
    dynamicRegistry: registry.available ? "available" : "unavailable",
  });
}
