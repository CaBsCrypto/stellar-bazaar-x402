import { meteredRedis } from './acceptance-meter.ts';
import { Redis } from "@upstash/redis";

export interface ReviewRedis {
  get(key: string): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}
let injectedRedis: ReviewRedis | undefined;
export function setReviewRedisForTests(redis: ReviewRedis | undefined) { injectedRedis = redis; }
export function getReviewPrefix(): string {
  const prefix = process.env.BAZAAR_REVIEW_PREFIX;
  if (!prefix || !/^bazaar-review:(?:local-test|preview|production|pilot-[a-f0-9]{32})$/.test(prefix)) throw Error("INVALID_REVIEW_NAMESPACE");
  return prefix;
}
export function getReviewRedis(): ReviewRedis | null {
  const marketplace = process.env.BAZAAR_ENABLE_MARKETPLACE === 'true';
  const backend = process.env.BAZAAR_PROVIDER_REVIEW_BACKEND;
  if (backend !== undefined && backend !== "redis" && backend !== "file") throw Error("INVALID_REVIEW_BACKEND");
  if (backend !== "redis") { if (marketplace) throw Error("REVIEW_REDIS_REQUIRED"); return null; }
  getReviewPrefix();
  if (injectedRedis) return injectedRedis;
  // Marketplace shares the explicit workspace connection, retaining review keys.
  // Missing workspace credentials never fall back to legacy or generic Redis.
  const url = marketplace ? process.env.BAZAAR_WORKSPACE_REDIS_REST_URL : process.env.BAZAAR_REVIEW_REDIS_REST_URL;
  const token = marketplace ? process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN : process.env.BAZAAR_REVIEW_REDIS_REST_TOKEN;
  if (!url || !token?.trim()) throw Error("REVIEW_REDIS_REQUIRED");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error("INVALID_REVIEW_REDIS_URL");
  return meteredRedis(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 }, enableAutoPipelining: false }));
}
export function reviewSharedConfigured(): boolean {
  try { return getReviewRedis() !== null; } catch { return false; }
}
