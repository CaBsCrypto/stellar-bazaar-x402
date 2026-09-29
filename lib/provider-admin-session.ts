import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { consumeMagicTokenIdentity, isAuthorizedAdminEmail } from "./admin-guard.ts";
import { getReviewRedis, getReviewPrefix } from "./provider-review-runtime.ts";
import { readBoundedSubmission } from "./provider-submission-http.ts";

const COOKIE = "__Host-bazaar-review";
const TTL = 1800;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export class ReviewHttpError extends Error { status: number; constructor(status: number, code: string) { super(code); this.status = status; } }
export function requireReviewEnabled() { if (process.env.BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN !== "true") throw new ReviewHttpError(503, "REVIEW_ADMIN_DISABLED"); }
function backend() { const redis = getReviewRedis(); if (!redis) throw new ReviewHttpError(503, "REVIEW_STORAGE_UNAVAILABLE"); return redis; }
function key(token: string) { return `${getReviewPrefix()}:session:${digest(token)}`; }
export function requireReviewOrigin(request: Request) {
  let origin: URL;
  try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? ""); } catch { throw new ReviewHttpError(503, "REVIEW_ORIGIN_NOT_CONFIGURED"); }
  const localTest = process.env.NODE_ENV === "test" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !localTest) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || new URL(request.url).origin !== origin.origin || request.headers.get("origin") !== origin.origin) throw new ReviewHttpError(403, "ORIGIN_DENIED");
}
export async function reviewJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ReviewHttpError(415, "JSON_REQUIRED");
  try { const body = await readBoundedSubmission(request, 8192); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error(); return body as Record<string, unknown>; }
  catch { throw new ReviewHttpError(400, "INVALID_JSON"); }
}
export interface ReviewSession { email: string; csrfToken: string; expiresAt: number }
export function reviewCookie(token = "") { return `${COOKIE}=${token}; Path=/; Max-Age=${token ? TTL : 0}; HttpOnly; Secure; SameSite=Strict`; }
function cookieToken(request: Request) { const entries = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`)); if (entries.length !== 1) return ""; return entries[0].slice(COOKIE.length + 1); }
export async function exchangeReviewSession(token: unknown) {
  requireReviewEnabled(); const redis = backend();
  if (typeof token !== "string" || !/^bz_magic_[a-f0-9]{48}$/.test(token)) throw new ReviewHttpError(401, "INVALID_MAGIC_TOKEN");
  const email = await consumeMagicTokenIdentity(token);
  if (!email) throw new ReviewHttpError(401, "INVALID_MAGIC_TOKEN");
  const sessionToken = randomBytes(32).toString("hex");
  const session: ReviewSession = { email, csrfToken: randomBytes(32).toString("hex"), expiresAt: Date.now() + TTL * 1000 };
  const persisted = await redis.eval("return redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])", [key(sessionToken)], [JSON.stringify(session), String(TTL)]);
  if (persisted !== "OK") throw new ReviewHttpError(503, "REVIEW_STORAGE_UNAVAILABLE");
  return { session, cookie: reviewCookie(sessionToken) };
}
export async function requireReviewSession(request: Request, mutation = false): Promise<ReviewSession> {
  requireReviewEnabled(); const redis = backend(); const token = cookieToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ReviewHttpError(401, "SESSION_REQUIRED");
  const raw = await redis.get(key(token));
  let session: ReviewSession;
  try { session = (typeof raw === "string" ? JSON.parse(raw) : raw) as ReviewSession; } catch { throw new ReviewHttpError(401, "SESSION_REQUIRED"); }
  if (!session || typeof session.email !== "string" || !isAuthorizedAdminEmail(session.email) || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || !/^[a-f0-9]{64}$/.test(session.csrfToken)) throw new ReviewHttpError(401, "SESSION_REQUIRED");
  if (mutation) { requireReviewOrigin(request); const csrf = request.headers.get("x-csrf-token") ?? ""; if (!/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrfToken))) throw new ReviewHttpError(403, "CSRF_DENIED"); }
  return session;
}
export async function revokeReviewSession(request: Request) {
  await requireReviewSession(request, true);
  const removed = await backend().eval("return redis.call('DEL', KEYS[1])", [key(cookieToken(request))], []);
  if (removed !== 0 && removed !== 1) throw new ReviewHttpError(503, "SESSION_REVOCATION_UNCONFIRMED");
}
export function reviewResponse(body: unknown, status = 200, cookie?: string) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie", ...(cookie ? { "Set-Cookie": cookie } : {}) } }); }
export function reviewError(error: unknown) { return reviewResponse({ ok: false, error: { code: error instanceof ReviewHttpError ? error.message : "REVIEW_OPERATION_UNAVAILABLE" } }, error instanceof ReviewHttpError ? error.status : 503); }
