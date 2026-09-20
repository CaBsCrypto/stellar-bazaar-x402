import type { PaidService } from "./types";

export const services: PaidService[] = [
  {
    id: "swap-risk-quote",
    name: "Swap Risk Quote",
    eyebrow: "DeFi intelligence",
    description: "Estima impacto de ruta, profundidad y riesgo de ejecución para un par. Datos informativos; no es asesoría financiera.",
    kind: "http",
    tags: ["defi", "risk", "liquidity"],
    routeTemplate: "/api/x402/swap-risk?pair={pair}&amount={amount}&side={side}",
    provider: "Bazaar Reference Provider (in-process; extracción prevista)",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.001", destination: "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ" },
    latency: "~680 ms mock",
    input: ["pair", "amount", "side"],
    output: ["routeRisk", "priceImpact", "liquidityBands"],
    accent: "violet",
    featured: true
  },
  {
    id: "stellar-ledger-brief",
    name: "Ledger Brief",
    eyebrow: "HTTP API",
    description: "Resume actividad reciente de una cuenta o contrato con un esquema de respuesta estable.",
    kind: "http",
    tags: ["stellar", "ledger", "analytics"],
    routeTemplate: "/api/x402/ledger-brief?address={address}&window={window}",
    provider: "Bazaar Reference Provider",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.005", destination: "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ" },
    latency: "~420 ms live",
    input: ["address", "window"],
    output: ["summary", "events", "anomalies"],
    accent: "blue"
  },
  {
    id: "contract-safety-mcp",
    name: "Contract Safety Scan",
    eyebrow: "MCP tool",
    description: "Herramienta MCP que produce señales explicables sobre un contrato Soroban y sus auth entries.",
    kind: "mcp",
    tags: ["mcp", "soroban", "security"],
    routeTemplate: "/api/x402/contract-safety?contractId={contractId}&network={network}",
    provider: "Bazaar Reference Provider",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.010", destination: "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ" },
    latency: "~850 ms live",
    input: ["contractId", "network"],
    output: ["findings", "authTree", "riskFlags"],
    accent: "mint"
  },
  {
    id: "market-window-mcp",
    name: "Market Window",
    eyebrow: "MCP tool",
    description: "Devuelve un paquete acotado de observaciones y profundidad de mercado DEX en Stellar.",
    kind: "mcp",
    tags: ["mcp", "market-data", "liquidity"],
    routeTemplate: "/api/x402/market-window?pair={pair}&depth={depth}",
    provider: "Bazaar Reference Provider",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.002", destination: "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ" },
    latency: "~380 ms live",
    input: ["pair", "depth"],
    output: ["spreadBps", "midPrice", "orderbook"],
    accent: "amber"
  },
  {
    id: "sentinel-agent-intelligence",
    name: "Sentinel Agent Intelligence",
    eyebrow: "Partner Pilot · AI Oracle",
    description: "Oráculo autónomo de inferencia de señales para agentes. Genera análisis sintéticos y score de riesgo on-chain.",
    kind: "http",
    tags: ["ai", "oracle", "partner-pilot", "intelligence"],
    routeTemplate: "/api/x402/swap-risk?pair={pair}&amount={amount}&side=buy",
    provider: "Sentinel AI Labs (External Pilot #1)",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.003" },
    latency: "~310 ms live",
    input: ["pair", "amount"],
    output: ["signalScore", "marketConfidence", "recommendationHash"],
    accent: "mint",
    featured: true
  },
  {
    id: "ai-video-scriptwriter",
    name: "AI Video Scriptwriter & Creative Director",
    eyebrow: "Creative Studio",
    description: "Generador de guiones virales de alta retención para videos cortos (Shorts, TikTok, Reels) con visual cues, ritmo de audio y visor interactivo de teleprompter.",
    kind: "http",
    tags: ["ai", "video-script", "creative-director", "teleprompter", "shorts", "tiktok", "reels"],
    routeTemplate: "/api/script?topic={topic}&durationSeconds={durationSeconds}&tone={tone}",
    provider: "AI Creative Studio",
    network: "stellar:testnet",
    payment: {
      scheme: "exact",
      asset: "USDC",
      amount: "0.02",
      destination: "GBYXQUSY7WA3DUXZSANGQ3HMER2EBMOK5IYPUJV4YY2UH7QS736J62LB"
    },
    latency: "~450 ms live",
    input: ["topic", "durationSeconds", "tone"],
    output: ["script", "teleprompterHtml", "bazaarDelivery"],
    accent: "violet",
    featured: true
  }
];

export function getService(id: string) {
  return services.find((service) => service.id === id);
}

