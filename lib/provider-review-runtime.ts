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
  const backend = process.env.BAZAAR_PROVIDER_REVIEW_BACKEND;
  if (backend !== undefined && backend !== "redis" && backend !== "file") throw Error("INVALID_REVIEW_BACKEND");
  if (backend !== "redis") return null;
  getReviewPrefix();
  if (injectedRedis) return injectedRedis;
  const url = process.env.BAZAAR_REVIEW_REDIS_REST_URL;
  const token = process.env.BAZAAR_REVIEW_REDIS_REST_TOKEN;
  if (!url || !token?.trim()) throw Error("REVIEW_REDIS_REQUIRED");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error("INVALID_REVIEW_REDIS_URL");
  return new Redis({ url, token, automaticDeserialization: false, retry: false, enableAutoPipelining: false });
}
export function reviewSharedConfigured(): boolean {
  try { return getReviewRedis() !== null; } catch { return false; }
}
