import type { PaidService } from "./types";

export const services: PaidService[] = [
  {
    id: "swap-risk-quote",
    name: "Swap Risk Quote (Sandbox)",
    eyebrow: "🧪 Testnet Sandbox",
    description: "Servicio oficial de prueba para que agentes de IA validen conectividad, handshake x402 y liquidación en Stellar Testnet.",
    kind: "http",
    tags: ["testnet-sandbox", "defi", "risk", "connectivity-check"],
    routeTemplate: "/api/x402/swap-risk?pair={pair}&amount={amount}&side={side}",
    provider: "Bazaar Official Testnet Sandbox",
    network: "stellar:testnet",
    payment: {
      scheme: "exact",
      asset: "USDC",
      amount: "0.001",
      destination: "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ"
    },
    latency: "~250 ms live",
    input: ["pair", "amount", "side"],
    output: ["routeRisk", "priceImpact", "liquidityBands"],
    accent: "mint",
    featured: false
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
