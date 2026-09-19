import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  activitySchema,
  type ActivityInput,
  type ActivityEvent,
} from "./activity.ts";
import { canonicalOperationJson } from "./operation-history.ts";
import {
  HistoryStoreError,
  type HistoryRedis,
} from "./operation-history-store.ts";
export const APPEND_ACTIVITY_LUA = `
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  if cjson.decode(old).digest ~= ARGV[2] then return {'conflict'} end
  return {'existing', old}
end
if redis.call('HLEN', KEYS[1]) >= 10000 then return {'capacity'} end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('LPUSH', KEYS[2], ARGV[1])
return {'created', ARGV[3]}
`;
function keys(owner: string) {
  const scope = createHash("sha256").update(owner).digest("hex");
  return [
    "bazaar:activity:v1:{" + scope + "}:events",
    "bazaar:activity:v1:{" + scope + "}:index",
  ];
}
export function createActivityStore(redis: HistoryRedis) {
  return {
    async append(owner: string, input: ActivityInput) {
      const parsed = activitySchema.parse(input);
      const record: ActivityEvent = {
        ...parsed,
        recordedAt: new Date().toISOString(),
        evidence: "agent-reported",
      };
      const digest = createHash("sha256")
        .update(canonicalOperationJson(parsed))
        .digest("hex");
      try {
        const response = await redis.eval(APPEND_ACTIVITY_LUA, keys(owner), [
          parsed.eventId,
          digest,
          JSON.stringify({ digest, record }),
        ]);
        if (!Array.isArray(response)) throw new Error();
        if (response[0] === "conflict")
          throw new HistoryStoreError("OPERATION_CONFLICT");
        if (response[0] === "capacity")
          throw new HistoryStoreError("HISTORY_CAPACITY");
        if (!["created", "existing"].includes(response[0])) throw new Error();
        const value =
          typeof response[1] === "string"
            ? JSON.parse(response[1])
            : response[1];
        return {
          record: value.record as ActivityEvent,
          created: response[0] === "created",
        };
      } catch (error) {
        if (error instanceof HistoryStoreError) throw error;
        throw new HistoryStoreError("HISTORY_UNAVAILABLE");
      }
    },
    async all(owner: string): Promise<ActivityEvent[]> {
      try {
        const [records, index] = keys(owner);
        const ids = await redis.lrange(index, 0, 9999);
        if (!ids.length) return [];
        const values = await redis.hmget(records, ...ids);
        if (!values) throw new Error();
        return ids.map((id) => {
          const value = values[id];
          const saved = typeof value === "string" ? JSON.parse(value) : value;
          if (!saved || typeof saved !== "object" || !("record" in saved))
            throw new Error();
          return saved.record as ActivityEvent;
        });
      } catch {
        throw new HistoryStoreError("HISTORY_UNAVAILABLE");
      }
    },
  };
}
export function configuredActivityStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url?.startsWith("https://") || !token)
    throw new HistoryStoreError("HISTORY_UNAVAILABLE");
  return createActivityStore(new Redis({ url, token }));
}
