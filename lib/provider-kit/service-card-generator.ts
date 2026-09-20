import { createHash } from "node:crypto";
import type { ServiceCard } from "../types.ts";
import type { ProviderServiceConfig } from "./types.ts";

export function generateCanonicalServiceCard(config: ProviderServiceConfig): ServiceCard {
  const urlObj = new URL(config.endpointUrl);
  const routeTemplate = config.routeTemplate ?? urlObj.pathname;

  const card: ServiceCard = {
    version: "bazaar.service-card/v0",
    id: config.id,
    name: config.name,
    description: config.description,
    kind: "http",
    url: config.endpointUrl,
    routeTemplate,
    input: config.input,
    network: "stellar:testnet",
    payment: {
      scheme: config.pricing.scheme ?? "split-exact",
      asset: "USDC",
      amount: config.pricing.amountUsdc,
      destination: config.pricing.destinationAddress,
    },
    provider: {
      name: config.provider.name,
    },
    tags: config.tags,
  };

  return card;
}

export function computeServiceCardHash(card: ServiceCard): string {
  const canonical = JSON.stringify(card, Object.keys(card).sort());
  return createHash("sha256").update(canonical).digest("hex");
}
