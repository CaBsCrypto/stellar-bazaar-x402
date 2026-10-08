import {demoIngress} from "./demo-http.ts";
import { isIP } from "node:net";
import { assertWorkspaceCreationAdmission, workspaceGlobalRequestLimits } from "./workspace-admission.ts";
import { z } from "zod";
import { requireWorkspacePrincipal, workspaceBearerHash } from "./workspace-auth.ts";
import { configuredWorkspaceStore, assertWorkspaceEnabled, workspaceLoopbackOrigin } from "./workspace-store.ts";
import { openWorkspacesEnabled } from "./workspace-store.ts";
import { createWorkspaceSchema, workspaceAccessSchema, WorkspaceError, type WorkspaceRole } from "./workspace-types.ts";
import {workspacePublicOrigin} from './workspace-public-origin.ts';
import {configuredMarketStore} from './marketplace-store.ts';
export const workspaceHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export function workspaceFailure(e: unknown) { const error = e instanceof WorkspaceError ? e : e instanceof z.ZodError ? new WorkspaceError("INVALID_REQUEST", 400) : new WorkspaceError("WORKSPACE_UNAVAILABLE", 503); return Response.json({ error: { code: error.code } }, { status: process.env.BAZAAR_PUBLIC_DEMO === "true" && error.code === "WORKSPACE_CAPACITY" ? 503 : error.status, headers: { ...workspaceHeaders, ...(error.status === 429 ? { "Retry-After": String(error.retryAfter ?? 60) } : {}) } }); }
/** NextURL normalizes loopback IPs to localhost. Host only validates our configured authority. */
export function workspaceRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const isolatedRedis = process.env.BAZAAR_WORKSPACE_BACKEND === "redis" && /^bazaar-workspace:isolated-[a-f0-9]{32}$/.test(process.env.BAZAAR_WORKSPACE_PREFIX ?? "");
  if (!openWorkspacesEnabled()) return url.origin;
  if (!isolatedRedis && process.env.BAZAAR_WORKSPACE_BACKEND !== "file") {
    const configured = workspacePublicOrigin();
    if (!configured) {
      if (process.env.BAZAAR_WORKSPACE_ADMISSION === "invite-only") throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
      return url.origin;
    }
    let publicUrl: URL;
    try { publicUrl = new URL(configured); } catch { throw new WorkspaceError("WORKSPACE_UNAVAILABLE"); }
    if (publicUrl.protocol !== "https:" || publicUrl.origin !== configured || publicUrl.username || publicUrl.password) throw new WorkspaceError("WORKSPACE_UNAVAILABLE");
    if (url.origin !== configured) throw new WorkspaceError("INVALID_REQUEST", 400);
    return configured;
  }
  const expected = new URL(workspaceLoopbackOrigin()), host = request.headers.get("host");
  const port = expected.port || (expected.protocol === "https:" ? "443" : "80");
  const forwardedHost = request.headers.get("x-forwarded-host"), forwardedProto = request.headers.get("x-forwarded-proto"), forwardedPort = request.headers.get("x-forwarded-port");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== expected.protocol || url.port !== expected.port || url.username || url.password ||
      (host ? host !== expected.host : url.origin !== expected.origin) ||
      (forwardedHost !== null && forwardedHost !== expected.host) || (forwardedProto !== null && forwardedProto !== expected.protocol.slice(0, -1)) ||
      (forwardedPort !== null && forwardedPort !== port) || request.headers.has("forwarded")) throw new WorkspaceError("WORKSPACE_LOCAL_ONLY", 403);
  return expected.origin;
}
export function assertWorkspaceRequest(request: Request, allowQuery = false) {
  assertWorkspaceEnabled(); const url = new URL(request.url), origin = request.headers.get("origin"), expectedOrigin = workspaceRequestOrigin(request);
  if ((origin && origin !== expectedOrigin) || (!allowQuery && url.search) || request.headers.get("authorization")?.length && request.headers.get("authorization")!.length > 150) throw new WorkspaceError("INVALID_REQUEST", 400);
}
export async function parseWorkspaceBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 16384): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new WorkspaceError("INVALID_CONTENT_TYPE", 415);
  const reader = request.body?.getReader(); if (!reader) throw new WorkspaceError("INVALID_REQUEST", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new WorkspaceError("REQUEST_TOO_LARGE", 413); } chunks.push(value); }
  try { return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { throw new WorkspaceError("INVALID_REQUEST", 400); }
}
export async function authenticateWorkspaceRequest(request: Request, role?: WorkspaceRole, allowQuery = false) {
  await demoIngress(request); assertWorkspaceRequest(request, allowQuery); const principal = await requireWorkspacePrincipal(request.headers.get("authorization"), role);
  await configuredWorkspaceStore().consumeRequest(principal.ownerId, principal.generation, principal.role === "bootstrap" ? workspaceBearerHash(request.headers.get("authorization")) : undefined);
  return principal;
}
export function trustedIp(request: Request) {
  if (process.env.VERCEL === "1") { const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim(); if (ip && isIP(ip)) return ip; }
  return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname) ? "loopback" : "untrusted";
}
export function createWorkspaceHandlers() {
  return {
    async POST(request: Request) { try { await demoIngress(request); assertWorkspaceRequest(request); const bootstrapHash = workspaceBearerHash(request.headers.get("authorization")); assertWorkspaceCreationAdmission(bootstrapHash); const input = await parseWorkspaceBody(request, createWorkspaceSchema, 1024); const allowNew = process.env.BAZAAR_WORKSPACE_CREATION_PAUSED !== 'true' && (process.env.BAZAAR_ENABLE_MARKETPLACE !== 'true' || !await configuredMarketStore().transact(s=>s.paused??false)); const store = configuredWorkspaceStore(), result = await store.createWorkspace(input, bootstrapHash, trustedIp(request), allowNew); if (!result.created || !workspaceGlobalRequestLimits()) await store.consumeRequest(result.record.ownerId, result.record.generation, bootstrapHash); return Response.json({ version: "1", ...result }, { status: result.created ? 201 : 200, headers: workspaceHeaders }); } catch (e) { return workspaceFailure(e); } },
    async access(request: Request, workspaceId: string) { try { await demoIngress(request); assertWorkspaceRequest(request); const bootstrapHash = workspaceBearerHash(request.headers.get("authorization")); const principal = await requireWorkspacePrincipal(request.headers.get("authorization"), "bootstrap"); if (principal.workspaceId !== workspaceId) throw new WorkspaceError("FORBIDDEN", 403); await configuredWorkspaceStore().consumeRequest(principal.ownerId, principal.generation, bootstrapHash); const input = await parseWorkspaceBody(request, workspaceAccessSchema, 1024); const result = await configuredWorkspaceStore().changeAccess(workspaceId, bootstrapHash, input); return Response.json({ version: "1", ...result }, { headers: workspaceHeaders }); } catch (e) { return workspaceFailure(e); } },
  };
}
