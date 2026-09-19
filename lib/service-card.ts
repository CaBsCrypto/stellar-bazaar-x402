import type { PaidService, ServiceCard } from "./types.ts";
import { syncDeliveryContract } from "./delivery-contract.ts";

export function toServiceCard(s: PaidService): ServiceCard {
  if (s.sourceCard) return structuredClone(s.sourceCard);
  return {
    version: "bazaar.service-card/v0",
    id: s.id,
    name: s.name,
    description: s.description,
    kind: s.kind,
    url: s.routeTemplate.startsWith("/")
      ? (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL : "https://stellar-bazaar-x402.vercel.app")
      : "https://demo.bazaar.invalid",
    routeTemplate: s.routeTemplate,
    input: s.input.map((name) => ({ name, type: name === "amount" ? "number" : "string", required: true })),
    network: s.network,
    payment: {
      ...s.payment,
      destination: s.payment.destination ?? "",
    },
    provider: { name: s.provider },
    tags: s.tags,
    delivery: syncDeliveryContract(),
  };
}

export function toPaidService(card: ServiceCard): PaidService {
  return {
    sourceCard: structuredClone(card),
    id: card.id,
    name: card.name,
    eyebrow: card.tags[0] ? card.tags[0].toUpperCase() : "DYNAMIC",
    description: card.description,
    kind: card.kind,
    tags: card.tags,
    routeTemplate: card.routeTemplate,
    provider: card.provider.name,
    network: card.network,
    payment: {
      scheme: card.payment.scheme,
      asset: card.payment.asset,
      amount: card.payment.amount,
      destination: card.payment.destination,
    },
    latency: "<500ms",
    input: card.input.map((i) => i.name),
    output: ["result", "data"],
    accent: "mint",
  };
}
