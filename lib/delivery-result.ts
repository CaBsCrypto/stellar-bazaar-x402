import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function canonicalResultSha256(result: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(result))).digest("hex");
}

export function hasMatchingProviderResultHash(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  const delivery = record.delivery;
  if (!delivery || typeof delivery !== "object") return false;
  const resultHash = (delivery as Record<string, unknown>).resultHash;
  if (!resultHash || typeof resultHash !== "object") return false;
  const hash = resultHash as Record<string, unknown>;
  return hash.algorithm === "sha256" && hash.scope === "canonical-result" && typeof hash.value === "string" && hash.value === canonicalResultSha256(record.result);
}
