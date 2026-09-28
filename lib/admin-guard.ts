import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis: Redis | null = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// In-memory fallback map for magic link OTP tokens: token -> { email, expiresAt }
const memoryOtps = new Map<string, { email: string; expiresAt: number }>();

export function isAuthorizedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const envEmails = process.env.ADMIN_ALLOWED_EMAILS
    ? process.env.ADMIN_ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];
  return /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(normalized) && envEmails.includes(normalized);
}

/**
 * Generates a single-use 15-minute Magic Link token for an authorized admin email.
 */
export async function createMagicLinkToken(email: string): Promise<string> {
  if (!isAuthorizedAdminEmail(email)) throw new Error("ADMIN_EMAIL_NOT_ALLOWED");
  if (!redis && (process.env.VERCEL || !["test", "development"].includes(process.env.NODE_ENV ?? ""))) throw new Error("ADMIN_STORAGE_NOT_CONFIGURED");
  const token = "bz_magic_" + randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

  if (redis) {
    await redis.set("bazaar:admin:magic:" + token, JSON.stringify({ email, expiresAt }), { ex: 900 });
  } else {
    memoryOtps.set(token, { email, expiresAt });
  }

  return token;
}

/**
 * Validates and consumes an OTP magic link token.
 */
export async function verifyAndConsumeMagicToken(token: string): Promise<boolean> {
  if (!/^bz_magic_[a-f0-9]{48}$/.test(token)) return false;
  try {
    let record: unknown;
    if (redis) {
      const raw = await redis.eval<string[], unknown>(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]) end; return value",
        ["bazaar:admin:magic:" + token], [],
      );
      record = typeof raw === "string" ? JSON.parse(raw) : raw;
    } else {
      if (process.env.VERCEL || !["test", "development"].includes(process.env.NODE_ENV ?? "")) return false;
      record = memoryOtps.get(token);
      memoryOtps.delete(token);
    }
    if (!record || typeof record !== "object") return false;
    const value = record as { email?: unknown; expiresAt?: unknown };
    return typeof value.email === "string" && isAuthorizedAdminEmail(value.email)
      && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now();
  } catch { return false; }
}

/**
 * Validates whether the incoming authorization token matches the authorized admin key
 * or a valid dynamic magic session token.
 */
export async function verifyAdminAccessAsync(authorizationHeader: string | null): Promise<boolean> {
  if (!authorizationHeader) return false;

  const match = /^Bearer\s+([a-zA-Z0-9_\-.~]{16,256})$/.exec(authorizationHeader.trim());
  if (!match) return false;

  const candidateKey = match[1];

  // 1. Check if it's a valid single-use magic token being redeemed
  if (candidateKey.startsWith("bz_magic_")) {
    return await verifyAndConsumeMagicToken(candidateKey);
  }

  // 2. Check static/env master admin key with constant-time equality
  const configuredAdminKey = process.env.BAZAAR_ADMIN_KEY?.trim();
  if (!configuredAdminKey || !/^[a-zA-Z0-9_\-.~]{32,256}$/.test(configuredAdminKey)) return false;
  try {
    const candidateHash = createHash("sha256").update(candidateKey).digest();
    const targetHash = createHash("sha256").update(configuredAdminKey).digest();
    return timingSafeEqual(candidateHash, targetHash);
  } catch {
    return false;
  }
}

export function verifyAdminAccess(authorizationHeader: string | null): boolean {
  if (!authorizationHeader) return false;
  const match = /^Bearer\s+([a-zA-Z0-9_\-.~]{16,256})$/.exec(authorizationHeader.trim());
  if (!match) return false;
  const candidateKey = match[1];
  const configuredAdminKey = process.env.BAZAAR_ADMIN_KEY?.trim();
  if (!configuredAdminKey || !/^[a-zA-Z0-9_\-.~]{32,256}$/.test(configuredAdminKey)) return false;
  try {
    const candidateHash = createHash("sha256").update(candidateKey).digest();
    const targetHash = createHash("sha256").update(configuredAdminKey).digest();
    return timingSafeEqual(candidateHash, targetHash);
  } catch {
    return false;
  }
}
