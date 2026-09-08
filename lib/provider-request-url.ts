import type { ServiceCard } from "./types.ts";

/** Resolve a provider route against its card, never against Bazaar's origin. */
export function providerRequestUrl(card: ServiceCard, params: Record<string, string | number | boolean>): string {
  const base = new URL(card.url);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("INVALID_PROVIDER_ORIGIN");
  const route = card.routeTemplate.replace(/\{([^}]+)\}/g, (_match, key: string, offset: number) => {
    if (!Object.hasOwn(params, key)) throw new Error("MISSING_PROVIDER_INPUT");
    const value = String(params[key]);
    const queryStart = card.routeTemplate.indexOf("?");
    if ((queryStart === -1 || offset < queryStart) && (value === "." || value === ".." || /[\\/%]/.test(value))) throw new Error("INVALID_PROVIDER_PATH_INPUT");
    return encodeURIComponent(value);
  });
  if (route.includes("\\") || route.split("?")[0].split("/").some(segment => {
    const decoded = decodeURIComponent(segment);
    return decoded === "." || decoded === "..";
  })) throw new Error("INVALID_PROVIDER_PATH_INPUT");
  const target = new URL(route, base);
  if (target.origin !== base.origin || target.username || target.password || target.hash) throw new Error("PROVIDER_ORIGIN_MISMATCH");
  return target.href;
}
