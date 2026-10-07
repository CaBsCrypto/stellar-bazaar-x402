import { randomUUID } from "node:crypto";
import { ReviewStoreError, type ProviderReviewStore, type ReviewState } from "./provider-review-store.ts";
import type { ReviewRedis } from "./provider-review-runtime.ts";
import { recordOperationalStorageBounds } from './acceptance-meter.ts';

export const REVIEW_ENVELOPE_MAX_BYTES = 1024 * 1024;

// Compare the complete observed envelope, including its unique revision. No TTL:
// an uncertain activation must survive restarts and submission expiry.
const COMPARE_AND_SET = `
local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then
  if old then return 0 end
else
  if not old or old~=ARGV[2] then return 0 end
end
redis.call('SET',KEYS[1],ARGV[3])
return 1`;

/** Callbacks execute once and must not perform network or other external side effects. */
export function createRedisReviewStore<T>(redis: ReviewRedis, prefix: string,
  validate: (value: unknown) => asserts value is ReviewState<T>): ProviderReviewStore<T> {
  if (!/^bazaar-review:(?:local-test|preview|production|pilot-[a-f0-9]{32})$/.test(prefix)) throw new ReviewStoreError("Invalid review namespace.");
  const key = `${prefix}:state`;
  return { async transact<R>(operation: (state: ReviewState<T>) => R | Promise<R>): Promise<R> {
    const raw = await redis.get(key);
    let state: ReviewState<T>;
    if (raw === null) state = { version: 1, records: [] };
    else {
      if (typeof raw !== "string" || Buffer.byteLength(raw) > REVIEW_ENVELOPE_MAX_BYTES) throw new ReviewStoreError("Invalid review envelope.");
      let envelope;
      try { envelope = JSON.parse(raw); } catch { throw new ReviewStoreError("Invalid review envelope."); }
      if (!envelope || Object.keys(envelope).sort().join(",") !== "revision,state,version" || envelope.version !== 1
        || typeof envelope.revision !== "string" || !/^[a-f0-9-]{36}$/.test(envelope.revision)) throw new ReviewStoreError("Invalid review envelope.");
      state = envelope.state;
    }
    validate(state);
    recordOperationalStorageBounds({ review: raw === null ? 0 : Buffer.byteLength(raw as string) + Buffer.byteLength(key) });
    const before = JSON.stringify(state);
    const result = await operation(state);
    validate(state);
    const detached = structuredClone(result);
    if (JSON.stringify(state) === before) return detached;
    const next = JSON.stringify({ version: 1, revision: randomUUID(), state });
    if (Buffer.byteLength(next) > REVIEW_ENVELOPE_MAX_BYTES) throw new ReviewStoreError("Review storage capacity exhausted.");
    recordOperationalStorageBounds({ review: Buffer.byteLength(next) + Buffer.byteLength(key) });
    // Never retry a callback or write: a rejected response may hide a committed SET.
    const committed = await redis.eval(COMPARE_AND_SET, [key], [raw === null ? "missing" : "present", raw === null ? "" : raw as string, next]);
    if (committed !== 1) throw new ReviewStoreError("Review write conflicted or was not confirmed.");
    return detached;
  } };
}
