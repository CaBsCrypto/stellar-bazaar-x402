import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_ADMIN_TOKEN = "bz_admin_stellar_bazaar_sec_2026";

/**
 * Validates whether the incoming authorization token matches the authorized admin key.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */
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
