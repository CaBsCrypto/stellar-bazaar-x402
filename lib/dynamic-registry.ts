import { meteredRedis } from './acceptance-meter.ts';
import { Redis } from "@upstash/redis";
import { computeCanonicalServiceCardHash } from "./canonical-service-card.ts";
import type { ServiceCard } from "./types.ts";
import { getService } from "./catalog.ts";
import { pilotCards } from "./pilot-cards.ts";
import { parseServiceCardShape } from "./service-card-schema.ts";
import {configuredMarketStore} from './marketplace-store.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {getSubmissionForOperator} from './provider-self-listing.ts';

export interface DynamicEntry {
  id: string;
  hash: string;
  card: ServiceCard;
  providerKeyHash: string;
  revision: number;
  registeredAt: string;
  updatedAt: string;
  withdrawn?: boolean;
}

const pilot = process.env.BAZAAR_ENABLE_MARKETPLACE === 'true';
const namespace = process.env.BAZAAR_DYNAMIC_PREFIX;
if (pilot && (!/^bazaar-market:pilot-[a-f0-9]{32}:catalog$/.test(namespace ?? '') || namespace !== process.env.BAZAAR_MARKET_PREFIX + ':catalog')) throw Error('INVALID_CATALOG_NAMESPACE');
const CARD_KEY_PREFIX = pilot ? namespace + ':card:' : "bazaar:card:";
const INDEX_KEY = pilot ? namespace + ':index' : "bazaar:index";

const redisUrl = pilot ? process.env.BAZAAR_WORKSPACE_REDIS_REST_URL : process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = pilot ? process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN : process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis: Redis | null = redisUrl && redisToken ? meteredRedis(new Redis({ url: redisUrl, token: redisToken, retry: false, enableAutoPipelining: false })) : null;
if (pilot && !redis) throw Error('CATALOG_REDIS_REQUIRED');

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
  return computeCanonicalServiceCardHash(card);
}

export function isReservedServiceId(id: string): boolean {
  return Boolean(getService(id)) || pilotCards.some((card) => card.id === id);
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
  if (isReservedServiceId(card.id)) return { exists: true };
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
  const checked = (ids: string[], values: unknown[]) => {
    let available = ids.length === values.length;
    const entries: DynamicEntry[] = [];
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      const value = values[index] as Partial<DynamicEntry> | null;
      if (typeof id !== "string" || seen.has(id) || isReservedServiceId(id) || !value || value.id !== id) {
        available = false;
        return;
      }
      seen.add(id);
      const parsed = parseServiceCardShape(value.card);
      if (!parsed.ok || parsed.card.id !== id) { available = false; return; }
      if (value.withdrawn) return;
      entries.push({ ...value, card: parsed.card } as DynamicEntry);
    });
    return { entries, available };
  };
  const visible = async (snapshot: {entries:DynamicEntry[];available:boolean}) => {
    if (!pilot) return snapshot;
    const owned = await configuredMarketStore().transact(s => s.services.filter(v => !v.withdrawn));
    const entries: DynamicEntry[] = [];
    for (const entry of snapshot.entries) {
      const service = owned.find(v => v.card.id === entry.id && v.cardHash === entry.hash);
      if (!service || !await configuredWorkspaceStore().isOwnerActive(service.ownerId)) continue;
      const review = await getSubmissionForOperator(service.submissionId, false);
      if (!review.ok) { if (review.error.code === 'STORE_UNAVAILABLE') throw Error('REVIEW_UNAVAILABLE'); continue; }
      if (review.value.status === 'activated' && computeCardHash(review.value.card) === entry.hash) entries.push(entry);
    }
    return {...snapshot,entries};
  };
  try {
    if (redis) {
      const ids = await redis.smembers(INDEX_KEY);
      if (ids.length === 0) return { entries: [], available: true };
      const entries = await redis.mget<DynamicEntry[]>(...ids.map((id) => CARD_KEY_PREFIX + id));
      return await visible(checked(ids, entries));
    }
    return checked(Array.from(memoryRegistry.keys()), Array.from(memoryRegistry.values()));
  } catch {
    return { entries: [], available: false };
  }
}

export async function getAllDynamicServiceCards(): Promise<DynamicEntry[]> {
  return (await readDynamicServiceCards()).entries;
}

/** Tombstone preserves references used by paid orders. Never delete the card. */
export async function withdrawDynamicServiceCard(id: string) {
  if (!pilot || !redis) throw Error('CATALOG_REDIS_REQUIRED');
  if (process.env.BAZAAR_ACCEPTANCE_X402 === 'true') {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw Error('CATALOG_WITHDRAWAL_UNCONFIRMED');
    // Preserve the exact stored envelope. No cjson rewrite, lease or retry.
    const rawClient = meteredRedis(new Redis({url:redisUrl!,token:redisToken!,automaticDeserialization:false,retry:false,enableAutoPipelining:false}));
    const key = CARD_KEY_PREFIX + id;
    const raw = await rawClient.get<string>(key);
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 7936) throw Error('CATALOG_WITHDRAWAL_UNCONFIRMED');
    const entry = JSON.parse(raw) as DynamicEntry;
    const parsed = parseServiceCardShape(entry.card);
    if (entry.id !== id || !parsed.ok || parsed.card.id !== id || computeCardHash(parsed.card) !== entry.hash) throw Error('CATALOG_WITHDRAWAL_UNCONFIRMED');
    if (entry.withdrawn === true) return;
    const next = JSON.stringify({...entry,withdrawn:true});
    const script = "-- x402-catalog-withdraw-cas-v1\nlocal old=redis.call('GET',KEYS[1]); if not old or old~=ARGV[1] then return 0 end; if string.len(ARGV[2])>7936 then return -1 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
    if (await rawClient.eval(script,[key],[raw,next]) !== 1) throw Error('CATALOG_WITHDRAWAL_UNCONFIRMED');
    return;
  }
  const bound=process.env.BAZAAR_ACCEPTANCE_SALE==='true'?" if string.len(next)>7936 then return -1 end;":"";
  const result=await redis.eval("local old=redis.call('GET',KEYS[1]); if not old then return 0 end; local card=cjson.decode(old); card.withdrawn=true; local next=cjson.encode(card);"+bound+" redis.call('SET',KEYS[1],next); return 1", [CARD_KEY_PREFIX + id], []);
  if(result!==1)throw Error('CATALOG_WITHDRAWAL_UNCONFIRMED');
}
