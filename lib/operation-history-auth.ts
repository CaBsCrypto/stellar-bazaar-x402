import { createHash, timingSafeEqual } from "node:crypto";

export type HistoryPrincipal = { ownerId: string; permission: "read" | "write" };
export class HistoryAuthError extends Error {
  readonly code: "HISTORY_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  constructor(code: "HISTORY_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN") { super(code); this.code = code; }
}

/** This module must remain in server routes. Env contains hashes, never browser credentials. */
export function authenticateHistory(authorization: string | null, write = false, config = process.env.BAZAAR_HISTORY_ACCOUNTS_JSON): HistoryPrincipal {
  let accounts: { ownerId: string; readTokenHash: string; writeTokenHash: string }[];
  try {
    const parsed: unknown = JSON.parse(config ?? "null");
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
  const match = /^Bearer ([a-zA-Z0-9_-]{43,128})$/.exec(authorization ?? "");
  if (!match) throw new HistoryAuthError("UNAUTHORIZED");
  const digest = createHash("sha256").update(match[1]).digest();
  let principal: HistoryPrincipal | undefined;
  for (const account of accounts) {
    if (timingSafeEqual(digest, Buffer.from(account.readTokenHash, "hex"))) principal = { ownerId: account.ownerId, permission: "read" };
    if (timingSafeEqual(digest, Buffer.from(account.writeTokenHash, "hex"))) principal = { ownerId: account.ownerId, permission: "write" };
  }
  if (!principal) throw new HistoryAuthError("UNAUTHORIZED");
  if (write && principal.permission !== "write") throw new HistoryAuthError("FORBIDDEN");
  return principal;
}
