import { createHash } from "node:crypto";
import type { ServiceCard } from "./types.ts";

export interface DynamicEntry {
  hash: string;
  card: ServiceCard;
  registeredAt: string;
}

const globalRegistry = globalThis as unknown as {
  __bazaar_dynamic_registry?: Map<string, DynamicEntry>;
};

if (!globalRegistry.__bazaar_dynamic_registry) {
  globalRegistry.__bazaar_dynamic_registry = new Map<string, DynamicEntry>();
}

export const dynamicRegistry = globalRegistry.__bazaar_dynamic_registry;

export function computeCardHash(card: ServiceCard): string {
  const serialized = JSON.stringify(card, Object.keys(card).sort());
  return createHash("sha256").update(serialized).digest("hex");
}

export function saveDynamicServiceCard(card: ServiceCard): { hash: string; registeredAt: string } {
  const hash = computeCardHash(card);
  const registeredAt = new Date().toISOString();
  dynamicRegistry.set(card.id, { hash, card: Object.freeze({ ...card }), registeredAt });
  return { hash, registeredAt };
}

export function getDynamicServiceCard(id: string): DynamicEntry | undefined {
  return dynamicRegistry.get(id);
}

export function getAllDynamicServiceCards(): DynamicEntry[] {
  return Array.from(dynamicRegistry.values());
}
