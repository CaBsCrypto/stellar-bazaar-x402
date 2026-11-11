import { getReviewRedis, getReviewPrefix } from "./provider-review-runtime.ts";
import { ReviewHttpError } from "./provider-admin-session.ts";

/** Pre-action intent and terminal outcome survive worker replacement. No tokens or cards. */
export async function recordReviewAudit(event: { requestId: string; submissionId: string; action: string; operatorEmail: string; outcome: "started" | "succeeded" | "failed" }) {
  const redis = getReviewRedis();
  if (!redis) throw new ReviewHttpError(503, "AUDIT_UNAVAILABLE");
  const stored = await redis.eval("return redis.call('SET', KEYS[1], ARGV[1])", [`${getReviewPrefix()}:audit:${event.requestId}:${event.outcome}`], [JSON.stringify({ ...event, at: new Date().toISOString() })]);
  if (stored !== "OK") throw new ReviewHttpError(503, "AUDIT_UNAVAILABLE");
}
