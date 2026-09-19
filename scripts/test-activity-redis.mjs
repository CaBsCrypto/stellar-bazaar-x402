import {createDeliverableStore} from "../lib/deliverable-store.ts";
import {reviewDeliveries} from "../lib/review-deliveries.ts";
// Uses a disposable, unpublished Docker Redis instance. Never uses app Redis credentials.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createActivityStore } from "../lib/activity-store.ts";
import { createHistoryStore } from "../lib/operation-history-store.ts";
const exec = promisify(execFile),
  name = "bazaar-history-qa-" + randomUUID();
let created = false;
const docker = async (...args) =>
  (
    await exec("docker", args, { timeout: 60000, maxBuffer: 2 * 1024 * 1024 })
  ).stdout.trim();
try {
  try {
    await docker("info", "--format", "{{.ServerVersion}}");
  } catch {
    throw Error(
      "REDIS_TEST_BLOCKED: Docker engine unavailable; no real Redis validation performed.",
    );
  }
  await docker(
    "run",
    "--detach",
    "--name",
    name,
    "redis:7.4-alpine",
    "redis-server",
    "--appendonly",
    "yes",
    "--appendfsync",
    "always",
  );
  created = true;
  const command = async (...args) =>
    JSON.parse(await docker("exec", name, "redis-cli", "--json", ...args));
  async function ready() {
    for (let i = 0; i < 30; i++) {
      try {
        if ((await command("PING")) === "PONG") return;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw Error("Redis not ready");
  }
  await ready();
  const redis = {
    eval: (script, keys, args) =>
      command("EVAL", script, String(keys.length), ...keys, ...args),
    lrange: (key, start, end) =>
      command("LRANGE", key, String(start), String(end)),
    hmget: async () => ({}),
  };
  redis.hmget = async (key, ...ids) => {
    const values = await command("HMGET", key, ...ids);
    return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
  };
  const store = createActivityStore(redis),
    ops = createHistoryStore(redis);
  const event = {
    eventId: "concurrent",
    taskId: "real-redis-task",
    mode: "mock",
    kind: "task-started",
    title: "Real Redis test",
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => store.append("qa", event)),
  );
  assert.equal(results.filter((r) => r.created).length, 1);
  await assert.rejects(
    () => store.append("qa", { ...event, title: "conflict" }),
    { code: "OPERATION_CONFLICT" },
  );
  const purchase = await ops.append("qa", {
    clientOperationId: "purchase",
    taskId: "real-redis-task",
    mode: "mock",
    service: {
      id: "fixture",
      title: "Report",
      provider: "Fixture",
      url: "https://example.com",
    },
    payment: {
      status: "not-requested",
      network: "stellar:testnet",
      asset: "USDC",
      amountAtomic: "0",
      recipient: "G" + "A".repeat(55),
    },
    delivery: { status: "reported-delivered", result: { report: "persisted" } },
  });
  const deliveries=createDeliverableStore(redis);
  const original={...reviewDeliveries[2],operationId:'purchase'};
  const reservations=await Promise.all(Array.from({length:8},()=>deliveries.reserve('qa',original)));
  assert.equal(reservations.filter(r=>r.created).length,1);
  await deliveries.confirm('qa',original.manifest.versionId,original.manifest.files[0].id);
  const revised={...original,manifest:{...original.manifest,versionId:'redis-new-version',previousVersionId:original.manifest.versionId}};
  await deliveries.reserve('qa',revised);
  assert.equal(await deliveries.get('other',original.manifest.versionId),null);
  const quota={...original,manifest:{...original.manifest,deliveryId:'quota',versionId:'quota-full',content:{kind:'other'},files:Array.from({length:10},(_,i)=>({...original.manifest.files[0],id:'quota-'+i,size:500000000}))}};
  quota.files=Object.fromEntries(quota.manifest.files.map(f=>[f.id,'pending']));
  await deliveries.reserve('quota-owner',quota);
  await assert.rejects(()=>deliveries.reserve('quota-owner',{...original,manifest:{...original.manifest,versionId:'quota-overflow'}}),{code:'OWNER_STORAGE_LIMIT'});
  await docker("restart", name);
  await ready();
  assert.equal((await createDeliverableStore(redis).list('qa','purchase')).length,2);
  assert.equal((await createDeliverableStore(redis).get('qa',original.manifest.versionId)).files[original.manifest.files[0].id],'available');
  await ready();
  assert.equal((await createActivityStore(redis).all("qa")).length, 1);
  assert.equal(
    (await createHistoryStore(redis).all("qa"))[0].id,
    purchase.record.id,
  );
  assert.equal(
    (await createHistoryStore(redis).all("qa"))[0].delivery.result.report,
    "persisted",
  );
  assert.equal((await store.all("other")).length, 0);
  console.log(
    "Real Redis Lua, concurrent idempotency, conflict, owner isolation and persisted result after container restart PASS. No network port published or payment.",
  );
} catch (error) {
  console.error(
    error.message.startsWith("REDIS_TEST_BLOCKED")
      ? error.message
      : "Redis test failed; no PASS claimed.",
  );
  process.exitCode = 1;
} finally {
  if (created) await docker("rm", "--force", name);
}
