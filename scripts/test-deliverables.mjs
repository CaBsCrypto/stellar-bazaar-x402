import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  deliverableSchema,
  deliveryAvailability,
  OWNER_LIMIT,
  FILE_LIMIT,
} from "../lib/deliverable.ts";
import {
  createDeliverableStore,
  DeliverableError,
} from "../lib/deliverable-store.ts";
import { createDeliverableHandlers } from "../lib/deliverable-http.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";
import { preserveDeliverable } from "../lib/deliverable-client.ts";
const hash = (v) => createHash("sha256").update(v).digest("hex"),
  read = "r".repeat(43),
  write = "w".repeat(43),
  bob = "b".repeat(43);
const config = JSON.stringify([
  { ownerId: "alice", readTokenHash: hash(read), writeTokenHash: hash(write) },
  {
    ownerId: "bob",
    readTokenHash: hash(bob),
    writeTokenHash: hash("x".repeat(43)),
  },
]);
const maps = new Map(),
  indexes = new Map(),
  quotas = new Map();
const redis = {
  async eval(script, keys, args) {
    const [key, quota, index] = keys;
    const map = maps.get(key) ?? new Map();
    maps.set(key, map);
    if (script.includes("value.record.files")) {
      const raw = map.get(args[0]);
      if (!raw) return ["missing"];
      const v = JSON.parse(raw);
      if (!v.record.files[args[1]]) return ["missing"];
      v.record.files[args[1]] = "available";
      map.set(args[0], JSON.stringify(v));
      return ["saved", JSON.stringify(v)];
    }
    const [id, digest, bytes, limit, raw, parent, family] = args;
    if (map.has(id))
      return [
        JSON.parse(map.get(id)).digest === digest ? "existing" : "conflict",
        map.get(id),
      ];
    if ((quotas.get(quota) ?? 0) + Number(bytes) > Number(limit))
      return ["quota"];
    if (
      parent &&
      (!map.has(parent) ||
        JSON.parse(map.get(parent)).record.manifest.deliveryId !== family)
    )
      return ["parent"];
    map.set(id, raw);
    quotas.set(quota, (quotas.get(quota) ?? 0) + Number(bytes));
    indexes.set(index, [id, ...(indexes.get(index) ?? [])]);
    return ["created", raw];
  },
  async hmget(key, ...ids) {
    return Object.fromEntries(ids.map((id) => [id, maps.get(key)?.get(id)]));
  },
  async lrange(key, start, end) {
    return (indexes.get(key) ?? []).slice(start, end + 1);
  },
};
const store = createDeliverableStore(redis),
  operation = {
    clientOperationId: "purchase-1",
    taskId: "task-1",
    agentId: "agent-1",
  };
let uploaded = false,
  integrity = true,
  accessCount = 0;
const objects = {
  upload: async () => ({
    url: "https://files.example/upload?expires=soon",
    headers: {},
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }),
  verify: async () => {
    if (!uploaded) throw new DeliverableError("FILE_PENDING", 409);
    if (!integrity) throw new DeliverableError("FILE_INTEGRITY_MISMATCH", 409);
  },
  access: async () => {
    accessCount++;
    return {
      url: "https://files.example/private?expires=" + accessCount,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
  },
};
const handlers = createDeliverableHandlers({
  auth: (h, w) => authenticateHistory(h, w, config),
  history: () => ({
    all: async (owner) => (owner === "alice" ? [operation] : []),
  }),
  store: () => store,
  objects: () => objects,
});
const file = {
  id: "file-1",
  name: "poster.png",
  mediaType: "image/png",
  size: 3,
  sha256: hash("abc"),
};
const manifest = {
  schemaVersion: "bazaar.deliverable/v1",
  deliveryId: "delivery-1",
  versionId: "v1",
  versionLabel: "Version 1",
  title: "Poster",
  summary: "Purchased art",
  files: [file],
  content: {
    kind: "gallery",
    variants: [{ id: "variant-1", title: "First", fileId: "file-1" }],
  },
};
function req(body, token = write, path = "/api/deliveries") {
  return new Request("https://bazaar.example" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
assert.equal(
  (await handlers.POST(req({ operationId: "purchase-1", manifest }, read)))
    .status,
  403,
);
assert.equal(
  (
    await handlers.POST(
      req({ operationId: "purchase-1", manifest, ownerId: "bob" }),
    )
  ).status,
  400,
);
assert.equal(
  (await handlers.POST(req({ operationId: "missing", manifest }))).status,
  404,
);
assert.equal(
  (await handlers.POST(req({ operationId: "purchase-1", manifest }))).status,
  201,
);
assert.equal(
  (await handlers.POST(req({ operationId: "purchase-1", manifest }))).status,
  200,
);
assert.equal(
  (
    await handlers.POST(
      req({
        operationId: "purchase-1",
        manifest: { ...manifest, title: "overwrite" },
      }),
    )
  ).status,
  409,
);
assert.equal(
  (await handlers.access(req({ versionId: "v1", fileId: "file-1" }, read)))
    .status,
  409,
);
assert.equal(
  (await handlers.upload(req({ versionId: "v1", fileId: "file-1" }, read)))
    .status,
  403,
);
assert.equal(
  (await handlers.upload(req({ versionId: "v1", fileId: "file-1" }))).status,
  200,
);
assert.equal(
  (await handlers.confirm(req({ versionId: "v1", fileId: "file-1" }))).status,
  409,
);
uploaded = true;
integrity = false;
assert.equal(
  (await handlers.confirm(req({ versionId: "v1", fileId: "file-1" }))).status,
  409,
);
integrity = true;
assert.equal(
  (await handlers.confirm(req({ versionId: "v1", fileId: "file-1" }))).status,
  200,
);
assert.equal(
  (await handlers.access(req({ versionId: "v1", fileId: "file-1" }, bob)))
    .status,
  404,
);
const first = await (
    await handlers.access(req({ versionId: "v1", fileId: "file-1" }, read))
  ).json(),
  renewed = await (
    await handlers.access(req({ versionId: "v1", fileId: "file-1" }, read))
  ).json();
assert.notEqual(first.url, renewed.url);
assert.ok(!JSON.stringify(first).includes(write));
assert.equal(deliveryAvailability(await store.get("alice", "v1")), "available");
const v2 = {
  ...manifest,
  versionId: "v2",
  previousVersionId: "v1",
  versionLabel: "Version 2",
};
assert.equal(
  (await handlers.POST(req({ operationId: "purchase-1", manifest: v2 })))
    .status,
  201,
);
assert.equal(
  (await store.get("alice", "v1")).manifest.versionLabel,
  "Version 1",
);
assert.equal((await store.get("alice", "v2")).files["file-1"], "pending");
assert.throws(() =>
  deliverableSchema.parse({
    ...manifest,
    files: [{ ...file, size: FILE_LIMIT + 1 }],
  }),
);
assert.throws(() =>
  deliverableSchema.parse({ ...manifest, files: [file, file] }),
);
assert.throws(() =>
  deliverableSchema.parse({
    ...manifest,
    content: {
      kind: "video",
      clips: [{ id: "clip", title: "x", fileId: "missing" }],
    },
  }),
);
const large = {
  ...manifest,
  deliveryId: "big",
  versionId: "large",
  files: Array.from({ length: 10 }, (_, i) => ({
    ...file,
    id: "big-" + i,
    size: FILE_LIMIT,
  })),
  content: { kind: "other" },
};
const record = {
  manifest: large,
  operationId: "other",
  createdAt: new Date().toISOString(),
  files: Object.fromEntries(large.files.map((f) => [f.id, "pending"])),
};
const reserved = await Promise.all(
  Array.from({ length: 8 }, () => store.reserve("quota-test", record)),
);
assert.equal(reserved.filter((r) => r.created).length, 1);
assert.ok([...quotas.values()].includes(OWNER_LIMIT));
await assert.rejects(
  () =>
    store.reserve("quota-test", {
      ...record,
      manifest: { ...large, versionId: "over", files: [file] },
    }),
  { code: "OWNER_STORAGE_LIMIT" },
);
const page = await handlers.GET(
  new Request("https://bazaar.example/api/deliveries?operationId=purchase-1", {
    headers: { Authorization: "Bearer " + read },
  }),
);
assert.equal((await page.json()).versions.length, 2);
// Buyer copies only provider-owned bytes, and retries storage without calling the paid service.
const originalFetch = globalThis.fetch;
const calls = [];
let stored = false;
globalThis.fetch = async (url, options) => {
  calls.push(String(url));
  if (String(url).endsWith("/api/deliveries"))
    return Response.json({
      record: { files: { "file-1": stored ? "available" : "pending" } },
    });
  if (String(url).endsWith("/confirm"))
    return new Response("{}", { status: stored ? 200 : 409 });
  if (String(url).endsWith("/uploads"))
    return Response.json({ url: "https://files.example/upload", headers: {} });
  if (String(url) === "https://provider.example/art.png")
    return new Response("abc");
  if (String(url) === "https://files.example/upload") {
    for await (const _ of options.body) {
    }
    stored = true;
    return new Response("");
  }
  throw Error("unexpected");
};
try {
  const options = {
    baseUrl: "https://bazaar.example",
    providerOrigin: "https://provider.example",
    writeToken: write,
    operationId: "purchase-1",
    delivery: {
      manifest,
      sources: [{ fileId: "file-1", url: "https://provider.example/art.png" }],
    },
  };
  assert.equal((await preserveDeliverable(options)).status, "stored");
  assert.equal((await preserveDeliverable(options)).status, "stored");
  assert.equal(
    calls.filter((v) => v === "https://provider.example/art.png").length,
    1,
  );
  assert.ok(!calls.some((v) => v.includes("/x402")));
  stored = false;
  assert.equal(
    (
      await preserveDeliverable({
        ...options,
        delivery: {
          manifest,
          sources: [{ fileId: "file-1", url: "https://evil.example/art.png" }],
        },
      })
    ).status,
    "failed",
  );
  assert.ok(!calls.some((v) => v.includes("evil.example")));
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  "Deliverables: manifest validation, owner isolation, quota race/idempotency model, immutable versions, checksum/size rejection, pending uploads, renewed access and buyer storage-only retry PASS. Real Redis/S3 not claimed.",
);
