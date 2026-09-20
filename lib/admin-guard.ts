import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

const DEFAULT_ADMIN_TOKEN = "bz_admin_stellar_bazaar_sec_2026";
const AUTHORIZED_ADMIN_EMAILS = [
  "cristian@browns.studio",
  "cabscryptocontacto@gmail.com",
];

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
  return AUTHORIZED_ADMIN_EMAILS.includes(normalized) || envEmails.includes(normalized);
}

/**
 * Generates a single-use 15-minute Magic Link token for an authorized admin email.
 */
export async function createMagicLinkToken(email: string): Promise<string> {
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
  if (redis) {
    const raw = await redis.get<string>("bazaar:admin:magic:" + token);
    if (!raw) return false;
    // Consume single-use token immediately
    await redis.del("bazaar:admin:magic:" + token);
    return true;
  }

  const record = memoryOtps.get(token);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    memoryOtps.delete(token);
    return false;
  }
  memoryOtps.delete(token);
  return true;
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
  const configuredAdminKey = process.env.BAZAAR_ADMIN_KEY || DEFAULT_ADMIN_TOKEN;
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
  const configuredAdminKey = process.env.BAZAAR_ADMIN_KEY || DEFAULT_ADMIN_TOKEN;
  try {
    const candidateHash = createHash("sha256").update(candidateKey).digest();
    const targetHash = createHash("sha256").update(configuredAdminKey).digest();
    return timingSafeEqual(candidateHash, targetHash);
  } catch {
    return false;
  }
}
