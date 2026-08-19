import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { ServiceCard } from "./types.ts";

export interface DynamicEntry {
  id: string;
  hash: string;
  card: ServiceCard;
  providerKeyHash: string;
  revision: number;
  registeredAt: string;
  updatedAt: string;
}

const CARD_KEY_PREFIX = "bazaar:card:";
const INDEX_KEY = "bazaar:index";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis: Redis | null = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const globalRegistry = globalThis as unknown as {
  __bazaar_dynamic_registry?: Map<string, DynamicEntry>;
};

if (!globalRegistry.__bazaar_dynamic_registry) {
  globalRegistry.__bazaar_dynamic_registry = new Map<string, DynamicEntry>();
}

const memoryRegistry = globalRegistry.__bazaar_dynamic_registry;

export function storageMode(): "upstash" | "memory" {
  return redis ? "upstash" : "memory";
}

export function computeCardHash(card: ServiceCard): string {
  const serialized = JSON.stringify(card, Object.keys(card).sort());
  return createHash("sha256").update(serialized).digest("hex");
}

function toEntry(card: ServiceCard, providerKeyHash: string, registeredAt: string, updatedAt: string, revision: number): DynamicEntry {
  return {
    id: card.id,
    hash: computeCardHash(card),
    card: Object.freeze({ ...card }),
    providerKeyHash,
    revision,
    registeredAt,
    updatedAt,
  };
}

export async function getDynamicServiceCard(id: string): Promise<DynamicEntry | undefined> {
  if (redis) {
    const entry = await redis.get<DynamicEntry>(CARD_KEY_PREFIX + id);
    return entry ?? undefined;
  }
  return memoryRegistry.get(id);
}

export async function createDynamicServiceCard(card: ServiceCard, providerKeyHash: string): Promise<{ entry: DynamicEntry } | { exists: true }> {
  const existing = await getDynamicServiceCard(card.id);
  if (existing) return { exists: true };

  const now = new Date().toISOString();
  const entry = toEntry(card, providerKeyHash, now, now, 1);

  if (redis) {
    await redis.set(CARD_KEY_PREFIX + card.id, entry);
    await redis.sadd(INDEX_KEY, card.id);
    return { entry };
  }
  memoryRegistry.set(card.id, entry);
  return { entry };
}

export async function updateDynamicServiceCard(card: ServiceCard, providerKeyHash: string): Promise<{ entry: DynamicEntry } | { notFound: true } | { unauthorized: true }> {
  const existing = await getDynamicServiceCard(card.id);
  if (!existing) return { notFound: true };
  if (existing.providerKeyHash !== providerKeyHash) return { unauthorized: true };

  const now = new Date().toISOString();
  const entry = toEntry(card, providerKeyHash, existing.registeredAt, now, existing.revision + 1);

  if (redis) {
    await redis.set(CARD_KEY_PREFIX + card.id, entry);
    return { entry };
  }
  memoryRegistry.set(card.id, entry);
  return { entry };
}

export async function deleteDynamicServiceCard(id: string, providerKeyHash: string): Promise<{ deleted: DynamicEntry } | { notFound: true } | { unauthorized: true }> {
  const existing = await getDynamicServiceCard(id);
  if (!existing) return { notFound: true };
  if (existing.providerKeyHash !== providerKeyHash) return { unauthorized: true };

  if (redis) {
    await redis.del(CARD_KEY_PREFIX + id);
    await redis.srem(INDEX_KEY, id);
    return { deleted: existing };
  }
  memoryRegistry.delete(id);
  return { deleted: existing };
}

export async function getAllDynamicServiceCards(): Promise<DynamicEntry[]> {
  if (redis) {
    const ids = await redis.smembers(INDEX_KEY);
    if (ids.length === 0) return [];
    const entries = await redis.mget<DynamicEntry[]>(...ids.map((id) => CARD_KEY_PREFIX + id));
    return entries.filter((entry): entry is DynamicEntry => Boolean(entry));
  }
  return Array.from(memoryRegistry.values());
}

export async function listDynamicServiceCardsByProvider(providerKeyHash: string): Promise<DynamicEntry[]> {
  const all = await getAllDynamicServiceCards();
  return all.filter((entry) => entry.providerKeyHash === providerKeyHash);
}