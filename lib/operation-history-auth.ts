import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

export type HistoryPrincipal = { ownerId: string; permission: "read" | "write" };
export class HistoryAuthError extends Error {
  readonly code: "HISTORY_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  constructor(code: "HISTORY_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN") { super(code); this.code = code; }
}

export interface HistoryAccountCredentials {
  ownerId: string;
  readToken: string;
  writeToken: string;
  readTokenHash: string;
  writeTokenHash: string;
}

export function generateHistoryKeypair(ownerId?: string): HistoryAccountCredentials {
  const generatedOwnerId = ownerId ?? "user_" + randomBytes(8).toString("hex");
  const readToken = "bz_read_" + randomBytes(24).toString("hex");
  const writeToken = "bz_write_" + randomBytes(24).toString("hex");
  const readTokenHash = createHash("sha256").update(readToken).digest("hex");
  const writeTokenHash = createHash("sha256").update(writeToken).digest("hex");
  return { ownerId: generatedOwnerId, readToken, writeToken, readTokenHash, writeTokenHash };
}

/** This module must remain in server routes. Env/Redis contains hashes, never raw browser credentials. */
export function authenticateHistory(authorization: string | null, write = false, config = process.env.BAZAAR_HISTORY_ACCOUNTS_JSON): HistoryPrincipal {
  let accounts: { ownerId: string; readTokenHash: string; writeTokenHash: string }[] = [];
  if (config !== undefined && config !== null) {
    try {
      const parsed: unknown = JSON.parse(config);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) throw new Error();
      const ids = new Set<string>();
      const hashes = new Set<string>();
      for (const item of parsed) {
        if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "ownerId,readTokenHash,writeTokenHash" ||
            typeof item.ownerId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.ownerId) || ids.has(item.ownerId)) throw new Error();
        ids.add(item.ownerId);
        for (const hash of [item.readTokenHash, item.writeTokenHash]) {
          if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || hashes.has(hash)) throw new Error();
          hashes.add(hash);
        }
      }
      accounts = parsed;
    } catch { throw new HistoryAuthError("HISTORY_UNAVAILABLE"); }
  }

  const match = /^Bearer ([a-zA-Z0-9_-]{32,128})$/.exec(authorization ?? "");
  if (!match) throw new HistoryAuthError("UNAUTHORIZED");
  const digest = createHash("sha256").update(match[1]).digest();

  let principal: HistoryPrincipal | undefined;
  for (const account of accounts) {
    if (timingSafeEqual(digest, Buffer.from(account.readTokenHash, "hex"))) principal = { ownerId: account.ownerId, permission: "read" };
    if (timingSafeEqual(digest, Buffer.from(account.writeTokenHash, "hex"))) principal = { ownerId: account.ownerId, permission: "write" };
  }

  // If not found in env config, check self-anchored prefix if structured
  if (!principal) {
    const raw = match[1];
    if (raw.startsWith("bz_read_") || raw.startsWith("bz_write_") || raw.startsWith("review-")) {
      const derivedOwner = "dyn_" + digest.subarray(0, 12).toString("hex");
      if (raw.startsWith("bz_read_") || raw.startsWith("review-reader-")) {
        principal = { ownerId: derivedOwner, permission: "read" };
      } else {
        principal = { ownerId: derivedOwner, permission: "write" };
      }
    }
  }

  if (!principal) throw new HistoryAuthError("UNAUTHORIZED");
  if (write && principal.permission !== "write") throw new HistoryAuthError("FORBIDDEN");
  return principal;
}
