import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { canonicalOperationJson, parseOperationHistoryInput, type OperationHistoryInput, type OperationHistoryRecord } from "./operation-history.ts";

export class HistoryStoreError extends Error {
  readonly code: "HISTORY_UNAVAILABLE" | "OPERATION_CONFLICT" | "HISTORY_CAPACITY";
  constructor(code: "HISTORY_UNAVAILABLE" | "OPERATION_CONFLICT" | "HISTORY_CAPACITY") { super(code); this.code = code; }
}
export interface HistoryRedis {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  hmget(key: string, ...fields: string[]): Promise<Record<string, unknown> | null>;
}
// One atomic append establishes idempotency and the index together, including concurrent retries.
export const APPEND_OPERATION_LUA = `
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  if cjson.decode(old).digest ~= ARGV[2] then return {'conflict'} end
  return {'existing', old}
end
if redis.call('HLEN', KEYS[1]) >= 1000 then return {'capacity'} end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('LPUSH', KEYS[2], ARGV[1])
return {'created', ARGV[3]}
`;
function keys(ownerId: string): string[] {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ownerId)) throw new HistoryStoreError("HISTORY_UNAVAILABLE");
  const scope = createHash("sha256").update(ownerId).digest("hex");
  return [`bazaar:history:v1:{${scope}}:records`, `bazaar:history:v1:{${scope}}:index`];
}
export function createHistoryStore(redis: HistoryRedis) {
  return {
    async append(ownerId: string, untrusted: OperationHistoryInput): Promise<{ record: OperationHistoryRecord; created: boolean }> {
      const input = parseOperationHistoryInput(untrusted);
      const digest = createHash("sha256").update(canonicalOperationJson(input)).digest("hex");
      const record: OperationHistoryRecord = { ...input, id: randomUUID(), recordedAt: new Date().toISOString(), evidence: "agent-reported" };
      try {
        const response = await redis.eval(APPEND_OPERATION_LUA, keys(ownerId), [input.clientOperationId, digest, JSON.stringify({ digest, record })]);
        if (!Array.isArray(response)) throw new HistoryStoreError("HISTORY_UNAVAILABLE");
        if (response[0] === "conflict") throw new HistoryStoreError("OPERATION_CONFLICT");
        if (response[0] === "capacity") throw new HistoryStoreError("HISTORY_CAPACITY");
        if (response[0] !== "created" && response[0] !== "existing") throw new HistoryStoreError("HISTORY_UNAVAILABLE");
        const saved = typeof response[1] === "string" ? JSON.parse(response[1]) : response[1];
        return { record: saved.record, created: response[0] === "created" };
      } catch (error) {
        if (error instanceof HistoryStoreError) throw error;
        throw new HistoryStoreError("HISTORY_UNAVAILABLE");
      }
    },
    async all(ownerId: string): Promise<OperationHistoryRecord[]> {
      const [recordsKey, indexKey] = keys(ownerId);
      try {
        const ids = await redis.lrange(indexKey, 0, 999);
        if (!ids.length) return [];
        const values = await redis.hmget(recordsKey, ...ids);
        if (!values) throw new Error();
        return ids.map(id => { const value = values[id]; const saved = typeof value === "string" ? JSON.parse(value) : value; if (!saved || typeof saved !== "object" || !("record" in saved)) throw new Error(); return saved.record as OperationHistoryRecord; });
      } catch { throw new HistoryStoreError("HISTORY_UNAVAILABLE"); }
    },
    async list(ownerId: string, limit = 20): Promise<OperationHistoryRecord[]> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HistoryStoreError("HISTORY_UNAVAILABLE");
      try {
        const [recordsKey, indexKey] = keys(ownerId);
        const ids = await redis.lrange(indexKey, 0, limit - 1);
        if (!ids.length) return [];
        const values = await redis.hmget(recordsKey, ...ids);
        if (!values) throw new Error();
        return ids.map((id) => {
          const value = values[id];
          const saved = typeof value === "string" ? JSON.parse(value) : value;
          if (!saved || typeof saved !== "object" || !("record" in saved)) throw new Error();
          return saved.record as OperationHistoryRecord;
        });
      } catch { throw new HistoryStoreError("HISTORY_UNAVAILABLE"); }
    },
  };
}

export function configuredHistoryStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token || !url.startsWith("https://")) throw new HistoryStoreError("HISTORY_UNAVAILABLE");
  return createHistoryStore(new Redis({ url, token }));
}
