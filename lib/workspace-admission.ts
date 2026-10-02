import { timingSafeEqual } from "node:crypto";
import { WorkspaceError, workspaceHashSchema } from "./workspace-types.ts";

if (typeof window !== "undefined") throw new Error("Workspace admission is server-only");

export function workspaceGlobalRequestLimits(): { minute: number; day: number } | undefined {
  const admission = process.env.BAZAAR_WORKSPACE_ADMISSION ?? "open";
  if (admission !== "open" && admission !== "invite-only") throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
  const minute = process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE;
  const day = process.env.BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY;
  if (!minute && !day && admission !== "invite-only") return undefined;
  if (!minute || !day || !/^[1-9]\d{0,3}$/.test(minute) || !/^[1-9]\d{0,4}$/.test(day) ||
      Number(minute) > 1000 || Number(day) > 10000) throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
  return { minute: Number(minute), day: Number(day) };
}

/** Invite hashes identify participant-owned recovery credentials, never raw tokens. */
export function assertWorkspaceCreationAdmission(bootstrapHash: string): void {
  workspaceGlobalRequestLimits();
  const mode = process.env.BAZAAR_WORKSPACE_ADMISSION ?? "open";
  const raw = process.env.BAZAAR_WORKSPACE_INVITE_HASHES_JSON;
  if (mode === "open") {
    if (raw) throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
    return;
  }
  if (mode !== "invite-only" || !raw || Buffer.byteLength(raw, "utf8") > 512) {
    throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
  }
  let hashes: unknown;
  try { hashes = JSON.parse(raw); } catch { throw new WorkspaceError("WORKSPACE_UNAVAILABLE"); }
  if (!Array.isArray(hashes) || hashes.length < 1 || hashes.length > 5 ||
      hashes.some(hash => !workspaceHashSchema.safeParse(hash).success) ||
      new Set(hashes).size !== hashes.length) {
    throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
  }
  if (!workspaceHashSchema.safeParse(bootstrapHash).success) throw new WorkspaceError("UNAUTHORIZED", 401);
  const candidate = Buffer.from(bootstrapHash, "hex");
  let admitted = false;
  for (const hash of hashes as string[]) {
    // Compare every entry; do not expose which invitation matched.
    admitted = timingSafeEqual(candidate, Buffer.from(hash, "hex")) || admitted;
  }
  if (!admitted) throw new WorkspaceError("WORKSPACE_INVITE_REQUIRED", 403);
}
