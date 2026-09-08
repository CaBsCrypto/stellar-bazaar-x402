import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createActivityStore } from "../lib/activity-store.ts";
import { createHistoryStore } from "../lib/operation-history-store.ts";
import { createActivityHandlers } from "../lib/activity-http.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";
import { parseOperationHistoryInput } from "../lib/operation-history.ts";
import { BazaarAgentClient } from "../lib/bazaar-agent-client.ts";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const read = "a".repeat(43),
  write = "b".repeat(43),
  other = "c".repeat(43);
const config = JSON.stringify([
  { ownerId: "alice", readTokenHash: hash(read), writeTokenHash: hash(write) },
  {
    ownerId: "bob",
    readTokenHash: hash(other),
    writeTokenHash: hash("d".repeat(43)),
  },
]);
const records = new Map(),
  indexes = new Map();
const redis = {
  async eval(script, [key, index], [id, digest, value]) {
    const map = records.get(key) ?? new Map();
    if (map.has(id))
      return [
        JSON.parse(map.get(id)).digest === digest ? "existing" : "conflict",
        map.get(id),
      ];
    if (map.size >= (script.includes(">= 10000") ? 10000 : 1000))
      return ["capacity"];
    map.set(id, value);
    records.set(key, map);
    indexes.set(index, [id, ...(indexes.get(index) ?? [])]);
    return ["created", value];
  },
  async lrange(key, start, end) {
    return (indexes.get(key) ?? []).slice(start, end + 1);
  },
  async hmget(key, ...ids) {
    return Object.fromEntries(ids.map((id) => [id, records.get(key)?.get(id)]));
  },
};
const operations = createHistoryStore(redis),
  events = createActivityStore(redis),
  handlers = createActivityHandlers({
    authenticate: (header, w) => authenticateHistory(header, w, config),
    operations: () => operations,
    events: () => events,
  });
const request = (query = "", token = read) =>
  new Request("https://bazaar.example/api/activity" + query, {
    headers: { Authorization: "Bearer " + token },
  });
const post = (body, token = write) =>
  handlers.POST(
    new Request("https://bazaar.example/api/activity", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
const event = {
  eventId: "e1",
  taskId: "t1",
  agentId: "buyer",
  mode: "mock",
  kind: "task-started",
  title: "Research",
};
assert.equal((await post(event, read)).status, 403);
assert.equal((await post({ ...event, ownerId: "bob" })).status, 400);
assert.equal(
  (await post({ ...event, evidence: "bazaar-observed" })).status,
  400,
);
assert.equal(
  (await post({ ...event, result: { token: "secret" } })).status,
  400,
);
assert.equal((await post(event)).status, 201);
assert.equal((await post(event)).status, 200);
assert.equal((await post({ ...event, title: "changed" })).status, 409);
await Promise.all(
  Array.from({ length: 12 }, () =>
    events.append("alice", { ...event, eventId: "parallel", kind: "search" }),
  ),
);
assert.equal(
  (await createActivityStore(redis).all("alice")).filter(
    (e) => e.eventId === "parallel",
  ).length,
  1,
);
const input = {
  clientOperationId: "o1",
  taskId: "t1",
  agentId: "buyer",
  mode: "mock",
  service: {
    id: "service",
    title: "Purchased report",
    provider: "Example",
    url: "https://provider.example",
  },
  payment: {
    status: "reported-unverified",
    network: "stellar:testnet",
    asset: "USDC",
    amountAtomic: "10000",
    recipient: "G" + "A".repeat(55),
    transactionHash: "a".repeat(64),
  },
  delivery: {
    status: "reported-delivered",
    result: { summary: "Your report" },
  },
};
const saved = await operations.append("alice", input);
await operations.append("alice", {
  ...input,
  clientOperationId: "old",
  taskId: undefined,
});
await events.append("alice", {
  ...event,
  eventId: "e2",
  kind: "task-completed",
});
let response = await handlers.GET(request("?view=tasks&limit=1")),
  page = await response.json();
assert.equal(page.items.length, 1);
assert.ok(page.nextCursor);
const second = await (
  await handlers.GET(request("?view=tasks&limit=1&cursor=" + page.nextCursor))
).json();
assert.equal(second.items.length, 1);
assert.notEqual(second.items[0].id, page.items[0].id);
assert.equal(
  (
    await handlers.GET(
      request("?view=tasks&limit=1&cursor=" + page.nextCursor, other),
    )
  ).status,
  400,
);
assert.equal(
  (
    await handlers.GET(
      request("?view=tasks&limit=1&agentId=buyer&cursor=" + page.nextCursor),
    )
  ).status,
  400,
);
assert.equal(
  (await handlers.GET(request("?view=tasks&cursor=bad"))).status,
  400,
);
assert.equal((await handlers.GET(request("?token=leak"))).status, 400);
const tasks = await (await handlers.GET(request("?view=tasks"))).json();
assert.equal(tasks.items.find((t) => t.id === "t1").status, "completed");
assert.equal(tasks.items.find((t) => t.status === "legacy").steps, 0);
const own = await (
  await handlers.GET(request("?view=operations&taskId=t1"))
).json();
assert.equal(own.items[0].delivery.result.summary, "Your report");
assert.equal(
  (await (await handlers.GET(request("?view=tasks", other))).json()).items
    .length,
  0,
);
assert.equal(
  (
    await handlers.GET(
      request("?download=1&operationId=" + saved.record.id, other),
    )
  ).status,
  404,
);
const download = await handlers.GET(
  request("?download=1&operationId=" + saved.record.id),
);
assert.match(download.headers.get("content-disposition"), /attachment/);
assert.equal((await download.json()).summary, "Your report");
assert.throws(() =>
  parseOperationHistoryInput({
    ...input,
    delivery: {
      status: "reported-delivered",
      artifact: {
        kind: "external",
        label: "evil",
        url: "https://other.example",
      },
    },
  }),
);
assert.throws(() =>
  parseOperationHistoryInput({
    ...input,
    delivery: {
      status: "reported-delivered",
      artifact: {
        kind: "file",
        filename: "secret.json",
        mediaType: "application/json",
        base64: Buffer.from('{"token":"secret"}').toString("base64"),
      },
    },
  }),
);
const file = await operations.append("alice", {
  ...input,
  clientOperationId: "file",
  delivery: {
    status: "reported-delivered",
    artifact: {
      kind: "file",
      filename: "report.txt",
      mediaType: "text/plain",
      base64: Buffer.from("Purchased file").toString("base64"),
    },
  },
});
assert.equal(
  await (
    await handlers.GET(request("?download=1&operationId=" + file.record.id))
  ).text(),
  "Purchased file",
);
const listed = await (await handlers.GET(request("?view=operations"))).json();
assert.ok(!JSON.stringify(listed).includes("base64"));
const pending = await operations.append("alice", {
  ...input,
  clientOperationId: "pending",
  delivery: { status: "pending" },
});
assert.equal(
  (await handlers.GET(request("?download=1&operationId=" + pending.record.id)))
    .status,
  404,
);
const broken = createActivityHandlers({
  authenticate: (h, w) => authenticateHistory(h, w, config),
  events: () => {
    throw Error();
  },
  operations: () => operations,
});
assert.equal((await broken.GET(request())).status, 503);
// Real SDK workflow, mocked transport/outcome: telemetry failures must not duplicate purchases.
const previous = globalThis.fetch;
const writes = [];
let count = 0;
globalThis.fetch = async (url, options) => {
  writes.push({
    url: String(url),
    body: options?.body ? JSON.parse(options.body) : null,
  });
  return String(url).includes("/api/activity")
    ? new Response("{}", { status: 503 })
    : new Response("{}", { status: 201 });
};
try {
  const client = new BazaarAgentClient({
    baseUrl: "https://bazaar.example",
    history: {
      writeToken: write,
      agentId: "buyer",
      taskId: "sdk-task",
      taskTitle: "Task",
      includeResult: true,
    },
  });
  client.executeServiceCore = async () => {
    count++;
    return {
      ok: true,
      data: { report: "purchased" },
      payment: { transactionHash: "a".repeat(64) },
      delivery: { resultAvailable: true },
    };
  };
  const outcome = await client.executeService(
    {
      id: "service",
      name: "Service",
      url: "https://provider.example",
      provider: { name: "Example" },
      network: "stellar:testnet",
      payment: {
        amount: "0.001",
        asset: "USDC",
        destination: "G" + "A".repeat(55),
      },
    },
    {},
  );
  await client.finishTask();
  assert.equal(count, 1);
  assert.equal(outcome.history.status, "failed");
  assert.equal(
    writes.find((w) => w.url.endsWith("/api/operations")).body.delivery.result
      .report,
    "purchased",
  );
  assert.deepEqual(
    writes
      .filter((w) => w.url.endsWith("/api/activity"))
      .map((w) => w.body.kind),
    [
      "task-started",
      "service-selected",
      "request-started",
      "payment-reported",
      "delivery-reported",
      "task-completed",
    ],
  );
} finally {
  globalThis.fetch = previous;
}
console.log(
  "Activity panel: owner isolation, immutable/idempotent events, pagination, legacy records, private results/files, unavailable delivery, SDK telemetry failure without repay PASS. Redis here is a model, not a real server.",
);
