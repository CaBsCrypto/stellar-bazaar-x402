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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function computeCardHash(card: ServiceCard): string {
  const serialized = JSON.stringify(canonicalize(card));
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
  const now = new Date().toISOString();
  const entry = toEntry(card, providerKeyHash, now, now, 1);

  if (redis) {
    const created = await redis.eval<string[], number>(
      [
        "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end",
        "redis.call('SET', KEYS[1], ARGV[1])",
        "redis.call('SADD', KEYS[2], ARGV[2])",
        "return 1",
      ].join("\n"),
      [CARD_KEY_PREFIX + card.id, INDEX_KEY],
      [JSON.stringify(entry), card.id],
    );
    if (created !== 1) return { exists: true };
    return { entry };
  }
  if (memoryRegistry.has(card.id)) return { exists: true };
  memoryRegistry.set(card.id, entry);
  return { entry };
}

export async function readDynamicServiceCards(): Promise<{ entries: DynamicEntry[]; available: boolean }> {
  try {
    if (redis) {
      const ids = await redis.smembers(INDEX_KEY);
      if (ids.length === 0) return { entries: [], available: true };
      const entries = await redis.mget<DynamicEntry[]>(...ids.map((id) => CARD_KEY_PREFIX + id));
      return { entries: entries.filter((entry): entry is DynamicEntry => Boolean(entry)), available: true };
    }
    return { entries: Array.from(memoryRegistry.values()), available: true };
  } catch {
    return { entries: [], available: false };
  }
}

export async function getAllDynamicServiceCards(): Promise<DynamicEntry[]> {
  return (await readDynamicServiceCards()).entries;
}
