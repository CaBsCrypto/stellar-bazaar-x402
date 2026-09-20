import { NextRequest, NextResponse } from "next/server";
import { services } from "@/lib/catalog";
import { getAllDynamicServiceCards, storageMode } from "@/lib/dynamic-registry";
import { verifyAdminAccess } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  
  // Guard: Verify secret admin token
  if (!verifyAdminAccess(authHeader)) {
    return NextResponse.json(
      {
        success: false,
        error: "UNAUTHORIZED",
        message: "Acceso denegado. Se requiere un Admin Access Key válido.",
      },
      { status: 401 }
    );
  }

  try {
    const dynamicCards = await getAllDynamicServiceCards();
    const dynamicCount = dynamicCards.length;
    const staticCount = services.length;
    const totalServices = staticCount + dynamicCount;

    // Health status of core services
    const servicesHealth = [
      {
        id: "swap-risk-quote",
        name: "Swap Risk Quote",
        kind: "http",
        status: "healthy",
        route: "/api/x402/swap-risk",
        price: "0.001 USDC",
      },
      {
        id: "stellar-ledger-brief",
        name: "Ledger Brief",
        kind: "http",
        status: "healthy",
        route: "/api/x402/ledger-brief",
        price: "0.005 USDC",
      },
      {
        id: "contract-safety-mcp",
        name: "Contract Safety Scan",
        kind: "mcp",
        status: "healthy",
        route: "/api/x402/contract-safety",
        price: "0.010 USDC",
      },
      {
        id: "market-window-mcp",
        name: "Market Window",
        kind: "mcp",
        status: "healthy",
        route: "/api/x402/market-window",
        price: "0.002 USDC",
      },
      {
        id: "website-intelligence",
        name: "Website Intelligence Live Provider",
        kind: "external",
        status: "online",
        route: "https://website-intelligence-provider.vercel.app/api/analyze",
        price: "0.010 USDC",
      }
    ];

    // Dynamic services
    const dynamicList = dynamicCards.map(d => ({
      id: d.id,
      name: d.card.name,
      kind: d.card.kind || "http",
      status: "active",
      route: d.card.routeTemplate || d.card.url || "/api/x402/" + d.id,
      price: (d.card.payment?.amount || "0.001") + " " + (d.card.payment?.asset || "USDC"),
      registeredAt: d.registeredAt,
    }));

    const mockStats = {
      totalVolumeUSDC: "142.85",
      bazaarTreasuryFeesUSDC: "4.28", // ~3%
      providerDisbursementsUSDC: "138.57", // ~97%
      totalInvocations: 384,
      totalSettlements: 379,
      settlementSuccessRate: "98.7%",
      averageSettlementLatencyMs: 820,
      network: "stellar:testnet",
      sorobanFeeSplitRouter: "CB...ROUTER (97/3 non-custodial split)",
      storageMode: storageMode(),
      servicesCount: totalServices,
      activeAgents: [
        { id: "agent-video-scriptwriter", label: "AI Video Scriptwriter Agent", status: "online", lastSeen: "Hace 2 min" },
        { id: "agent-sentinel-oracle", label: "Sentinel AI Risk Oracle", status: "online", lastSeen: "Hace 5 min" },
        { id: "agent-autonomous-buyer-cli", label: "Bazaar CLI Autonomous Buyer", status: "idle", lastSeen: "Hace 12 min" },
        { id: "webmcp-browser-adapter", label: "W3C WebMCP Native Client", status: "online", lastSeen: "Hace 1 min" },
      ]
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: mockStats,
      builtInServices: servicesHealth,
      dynamicServices: dynamicList,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Error" },
      { status: 500 }
    );
  }
}
