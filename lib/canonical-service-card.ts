import { createHash } from "node:crypto";
import type { ServiceCard } from "./types.ts";

/**
 * Stable v0 ServiceCard canonicalization. Object keys sort recursively using
 * code-point ordering; array order is part of the signed representation.
 */
export function canonicalizeServiceCard(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeServiceCard);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalizeServiceCard(nested)]),
    );
  }
  return value;
}

export function computeCanonicalServiceCardHash(card: ServiceCard): string {
  return createHash("sha256").update(JSON.stringify(canonicalizeServiceCard(card))).digest("hex");
}
