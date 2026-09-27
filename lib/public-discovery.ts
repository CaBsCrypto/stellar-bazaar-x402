import { services } from "./catalog.ts";
import { toServiceCard } from "./service-card.ts";
import { parseServiceCardShape } from "./service-card-schema.ts";
import type { ServiceCard } from "./types.ts";
export type DiscoverySnapshot = { cards: ServiceCard[]; partialResults: boolean; dynamicRegistry: "available" | "unavailable" };
export async function readPublicDiscovery(): Promise<DiscoverySnapshot> {
  // Offline adapters disclose incomplete discovery; browsers use the public registry endpoint.
  if (typeof window === "undefined" || !window.location?.origin) return { cards: services.map(toServiceCard), partialResults: true, dynamicRegistry: "unavailable" };
  const response = await fetch(new URL("/api/discovery/resources", window.location.origin), { method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("DISCOVERY_UNAVAILABLE");
  const body = await response.json();
  if (!body || !Array.isArray(body.results) || typeof body.partialResults !== "boolean" || !["available", "unavailable"].includes(body.dynamicRegistry)) throw new Error("DISCOVERY_INVALID_RESPONSE");
  const cards = body.results.map((value: unknown) => {
    const parsed = parseServiceCardShape(value);
    if (!parsed.ok) throw new Error("DISCOVERY_INVALID_RESPONSE");
    return parsed.card;
  });
  return { cards, partialResults: body.partialResults, dynamicRegistry: body.dynamicRegistry };
}

