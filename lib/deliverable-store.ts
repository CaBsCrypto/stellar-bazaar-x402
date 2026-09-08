import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { canonicalOperationJson } from "./operation-history.ts";
import { OWNER_LIMIT, type SavedDeliverable } from "./deliverable.ts";
import type { HistoryRedis } from "./operation-history-store.ts";

export class DeliverableError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const RESERVE_DELIVERY_LUA = `
local old = redis.call('HGET',KEYS[1],ARGV[1])
if old then
 if cjson.decode(old).digest ~= ARGV[2] then return {'conflict'} end
 return {'existing',old}
end
if redis.call('HLEN',KEYS[1]) >= 1000 then return {'capacity'} end
local current = tonumber(redis.call('GET',KEYS[2]) or '0')
if current + tonumber(ARGV[3]) > tonumber(ARGV[4]) then return {'quota'} end
if ARGV[6] ~= '' then
 local parent=redis.call('HGET',KEYS[1],ARGV[6])
 if not parent or cjson.decode(parent).record.manifest.deliveryId ~= ARGV[7] then return {'parent'} end
end
redis.call('HSET',KEYS[1],ARGV[1],ARGV[5])
redis.call('INCRBY',KEYS[2],ARGV[3])
redis.call('LPUSH',KEYS[3],ARGV[1])
return {'created',ARGV[5]}
`;
export const CONFIRM_FILE_LUA = `
local raw=redis.call('HGET',KEYS[1],ARGV[1])
if not raw then return {'missing'} end
local value=cjson.decode(raw)
if not value.record.files[ARGV[2]] then return {'missing'} end
value.record.files[ARGV[2]]='available'
local saved=cjson.encode(value)
redis.call('HSET',KEYS[1],ARGV[1],saved)
return {'saved',saved}
`;
function keys(owner: string) {
  const scope = createHash("sha256").update(owner).digest("hex");
  return [
    `bazaar:deliveries:v1:{${scope}}:versions`,
    `bazaar:deliveries:v1:{${scope}}:bytes`,
    `bazaar:deliveries:v1:{${scope}}:index`,
  ];
}
function decode(value: unknown): SavedDeliverable {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || !("record" in parsed))
    throw new DeliverableError("STORAGE_UNAVAILABLE");
  return parsed.record as SavedDeliverable;
}
export function createDeliverableStore(redis: HistoryRedis) {
  return {
    async reserve(owner: string, record: SavedDeliverable) {
      const digest = createHash("sha256")
        .update(
          canonicalOperationJson({
            manifest: record.manifest,
            operationId: record.operationId,
          }),
        )
        .digest("hex");
      const bytes = record.manifest.files.reduce((n, f) => n + f.size, 0);
      const response = await redis.eval(RESERVE_DELIVERY_LUA, keys(owner), [
        record.manifest.versionId,
        digest,
        String(bytes),
        String(OWNER_LIMIT),
        JSON.stringify({ digest, record }),
        record.manifest.previousVersionId ?? "",
        record.manifest.deliveryId,
      ]);
      if (!Array.isArray(response))
        throw new DeliverableError("STORAGE_UNAVAILABLE");
      const errors: Record<string, string> = {
        conflict: "VERSION_CONFLICT",
        quota: "OWNER_STORAGE_LIMIT",
        capacity: "MANIFEST_LIMIT",
        parent: "INVALID_PARENT_VERSION",
      };
      if (errors[response[0]])
        throw new DeliverableError(errors[response[0]], 409);
      if (!["created", "existing"].includes(response[0]))
        throw new DeliverableError("STORAGE_UNAVAILABLE");
      return {
        record: decode(response[1]),
        created: response[0] === "created",
      };
    },
    async get(owner: string, versionId: string) {
      const values = await redis.hmget(keys(owner)[0], versionId);
      return values?.[versionId] ? decode(values[versionId]) : null;
    },
    async list(owner: string, operationId: string) {
      const [records, , index] = keys(owner),
        ids = await redis.lrange(index, 0, 999);
      if (!ids.length) return [];
      const values = await redis.hmget(records, ...ids);
      if (!values) throw new DeliverableError("STORAGE_UNAVAILABLE");
      return ids
        .map((id) => decode(values[id]))
        .filter((r) => r.operationId === operationId);
    },
    async usage(owner: string) {
      const [records, , index] = keys(owner),
        ids = await redis.lrange(index, 0, 999);
      if (!ids.length) return 0;
      const values = await redis.hmget(records, ...ids);
      if (!values) throw new DeliverableError("STORAGE_UNAVAILABLE");
      return ids.reduce(
        (total, id) =>
          total +
          decode(values[id]).manifest.files.reduce(
            (bytes, file) => bytes + file.size,
            0,
          ),
        0,
      );
    },
    async confirm(owner: string, versionId: string, fileId: string) {
      const result = await redis.eval(
        CONFIRM_FILE_LUA,
        [keys(owner)[0]],
        [versionId, fileId],
      );
      if (!Array.isArray(result) || result[0] !== "saved")
        throw new DeliverableError("FILE_NOT_FOUND", 404);
      return decode(result[1]);
    },
  };
}
export function configuredDeliverableStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url?.startsWith("https://") || !token)
    throw new DeliverableError("STORAGE_UNAVAILABLE");
  return createDeliverableStore(new Redis({ url, token }));
}
