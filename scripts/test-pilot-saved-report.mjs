// Read-only verification of the already saved pilot, never executes a service.
import assert from "node:assert/strict";
import { readPrivateJSON } from "./lib/private-pilot-state.mjs";
import { canonicalInputHash } from "../lib/website-intelligence-readiness.ts";
const access = readPrivateJSON("work/private-website-report-pilot/access.json"),
  run = readPrivateJSON("work/private-website-report-pilot/run.json"),
  base = "http://127.0.0.1:3214";
async function get(path, token = access.readToken) {
  return fetch(base + path, {
    headers: { authorization: "Bearer " + token },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}
const url =
  "/api/deliveries?operationId=" + encodeURIComponent(run.operationId);
const response = await get(url);
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.versions.length, 1);
assert.equal(
  canonicalInputHash(body.versions[0].manifest.originalResult),
  run.resultHash,
);
const operations = await (await get("/api/operations")).json();
const matching = operations.records.filter(
  (r) => r.clientOperationId === run.operationId,
);
assert.equal(matching.length, 1);
assert.equal(matching[0].payment.transactionHash, run.transactionHash);
assert.equal(matching[0].payment.amountAtomic, "10000");
const events = await (
  await get(
    "/api/activity?view=events&taskId=" + encodeURIComponent(run.taskId),
  )
).json();
assert.equal(events.items.length, 6);
assert.equal(new Set(events.items.map((e) => e.eventId)).size, 6);
assert.ok(events.items.every((e) => e.operationId === run.operationId));
assert.equal((await get(url, access.otherReadToken)).status, 404);
console.log(
  JSON.stringify({
    ok: true,
    originalResultHashMatches: true,
    purchases: 1,
    versions: 1,
    events: 6,
    otherOwnerDenied: true,
    operationId: run.operationId,
    transactionHash: run.transactionHash,
    newProcess: true,
    paymentAttempted: false,
  }),
);
