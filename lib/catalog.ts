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
    payment: { scheme: "exact", asset: "USDC", amount: "0.001" },
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
    routeTemplate: "https://demo.bazaar.invalid/v1/ledger/{address}/brief",
    provider: "Orbit Index (fixture)",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.008" },
    latency: "~310 ms mock",
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
    routeTemplate: "mcp://demo.bazaar.invalid/tools/scan_contract",
    provider: "Lumen Guard (fixture)",
    network: "stellar:testnet",
    payment: { scheme: "exact", asset: "USDC", amount: "0.040" },
    latency: "~1.4 s mock",
    input: ["contractId", "network"],
    output: ["findings", "authTree", "riskFlags"],
    accent: "mint"
  },
  {
    id: "market-window-mcp",
    name: "Market Window",
    eyebrow: "MCP tool · experimental scheme",
    description: "Devuelve un paquete acotado de observaciones de mercado. El esquema upto es sólo metadata experimental en este POC.",
    kind: "mcp",
    tags: ["mcp", "market-data", "upto"],
    routeTemplate: "mcp://demo.bazaar.invalid/tools/market_window",
    provider: "Kepler Data (fixture)",
    network: "stellar:testnet",
    payment: { scheme: "upto", asset: "USDC", amount: "0.060" },
    latency: "~900 ms mock",
    input: ["assets", "maxRows"],
    output: ["observations", "sources", "usedAmount"],
    accent: "amber"
  }
];

export function getService(id: string) {
  return services.find((service) => service.id === id);
}
