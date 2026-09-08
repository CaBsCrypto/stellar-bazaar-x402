import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { parseOperationHistoryInput, canonicalOperationJson } from "../lib/operation-history.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";
import { createHistoryStore, configuredHistoryStore } from "../lib/operation-history-store.ts";
import { GET, POST } from "../app/api/operations/route.ts";
import { createHistoryHandlers } from "../lib/operation-history-http.ts";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const readToken = randomBytes(32).toString("base64url");
const writeToken = randomBytes(32).toString("base64url");
const config = JSON.stringify([{ ownerId: "alice", readTokenHash: hash(readToken), writeTokenHash: hash(writeToken) }]);
assert.deepEqual(authenticateHistory(`Bearer ${readToken}`, false, config), { ownerId: "alice", permission: "read" });
assert.throws(() => authenticateHistory(`Bearer ${readToken}`, true, config), { code: "FORBIDDEN" });
assert.equal(authenticateHistory(`Bearer ${writeToken}`, true, config).ownerId, "alice");
assert.throws(() => authenticateHistory("Bearer invalid", false, config), { code: "UNAUTHORIZED" });
assert.throws(() => authenticateHistory(`Bearer ${readToken}`, false, "[]"), { code: "HISTORY_UNAVAILABLE" });
assert.throws(() => authenticateHistory(`Bearer ${readToken}`, false, JSON.stringify([{ ownerId: "alice", readTokenHash: hash(readToken), writeTokenHash: hash(readToken) }])), { code: "HISTORY_UNAVAILABLE" });

const input = {
  clientOperationId: "fixture-operation-1", mode: "fixture", agentId: "demo-agent",
  service: { id: "demo-quote", title: "Demo quote", provider: "Fixture provider", url: "https://example.com/quote" },
  payment: { status: "reported-unverified", network: "stellar:testnet", asset: "USDC", amountAtomic: "10000", recipient: "G" + "A".repeat(55), transactionHash: "a".repeat(64) },
  delivery: { status: "reported-delivered", result: { signals: [{ label: "fixture", score: 4 }] } },
};
assert.deepEqual(parseOperationHistoryInput(input), input);
assert.equal(parseOperationHistoryInput({ ...input, payment: { ...input.payment, status: "unknown", transactionHash: undefined }, delivery: { status: "unknown" } }).payment.status, "unknown");
for (const mutate of [
  (v) => { v.ownerId = "bob"; }, (v) => { v.recordedAt = "2000-01-01"; },
  (v) => { v.payment.status = "verified"; }, (v) => { v.payment.network = "stellar:pubnet"; },
  (v) => { v.payment.amountAtomic = "1.5"; }, (v) => { v.service.url += "?token=private"; },
  (v) => { v.delivery.result = { nested: { apiKeyToken: "private" } }; },
  (v) => { v.delivery.result = { apiKey: "private" }; },
  (v) => { v.delivery.result = { url: "https://example.com/result?token=private" }; },
  (v) => { v.delivery.result = { text: "S" + "A".repeat(55) }; },
  (v) => { v.delivery.result = { text: "x".repeat(8193) }; },
]) { const bad = structuredClone(input); mutate(bad); assert.throws(() => parseOperationHistoryInput(bad)); }
assert.equal(canonicalOperationJson({ b: { z: 2, a: 1 }, a: 0 }), '{"a":0,"b":{"a":1,"z":2}}');

// Shared fake Redis models the atomic command boundary; a fresh store sees the same durable backing.
const hashes = new Map(); const lists = new Map();
const redis = {
  async eval(_script, [recordKey, indexKey], [id, digest, entry]) {
    const records = hashes.get(recordKey) ?? new Map();
    if (records.has(id)) return [JSON.parse(records.get(id)).digest === digest ? "existing" : "conflict", records.get(id)];
    if (records.size >= 1000) return ["capacity"];
    records.set(id, entry); hashes.set(recordKey, records);
    lists.set(indexKey, [id, ...(lists.get(indexKey) ?? [])]);
    return ["created", entry];
  },
  async lrange(key, start, stop) { return (lists.get(key) ?? []).slice(start, stop + 1); },
  async hmget(key, ...fields) { return Object.fromEntries(fields.map((field) => [field, hashes.get(key)?.get(field)])); },
};
const store = createHistoryStore(redis);
const concurrent = await Promise.all(Array.from({ length: 8 }, () => store.append("alice", input)));
assert.equal(concurrent.filter((value) => value.created).length, 1);
assert.equal(new Set(concurrent.map((value) => value.record.id)).size, 1);
assert.equal(concurrent[0].record.evidence, "agent-reported");
assert.ok(Date.parse(concurrent[0].record.recordedAt));
const restarted = createHistoryStore(redis);
assert.equal((await restarted.list("alice")).length, 1);
assert.deepEqual(await restarted.list("bob"), []);
assert.equal((await restarted.append("bob", input)).created, true);
await assert.rejects(() => restarted.append("alice", { ...input, service: { ...input.service, provider: "Changed" } }), { code: "OPERATION_CONFLICT" });
await restarted.append("alice", { ...input, clientOperationId: "fixture-operation-2" });
assert.equal((await restarted.list("alice", 1))[0].clientOperationId, "fixture-operation-2");
assert.equal((await restarted.list("alice"))[1].delivery.result.signals[0].score, 4);
await assert.rejects(() => createHistoryStore({ ...redis, eval: async () => { throw new Error("sensitive internal URL"); } }).append("alice", input), { message: "HISTORY_UNAVAILABLE" });
await assert.rejects(() => createHistoryStore({ ...redis, eval: async () => ["capacity"] }).append("alice", input), { code: "HISTORY_CAPACITY" });
const bobRead = randomBytes(32).toString("base64url");
const bobWrite = randomBytes(32).toString("base64url");
const routeConfig = JSON.stringify([
  { ownerId: "http-alice", readTokenHash: hash(readToken), writeTokenHash: hash(writeToken) },
  { ownerId: "http-bob", readTokenHash: hash(bobRead), writeTokenHash: hash(bobWrite) },
]);
const http = createHistoryHandlers({ authenticate: (authorization, write) => authenticateHistory(authorization, write, routeConfig), store: () => createHistoryStore(redis) });
const postRequest = (token, body = input) => new Request("https://bazaar.example/api/operations", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const getRequest = (token) => new Request("https://bazaar.example/api/operations", { headers: { Authorization: `Bearer ${token}` } });
const firstResponse = await http.POST(postRequest(writeToken));
assert.equal(firstResponse.status, 201);
const firstRecord = (await firstResponse.json()).record;
const retryResponse = await http.POST(postRequest(writeToken));
assert.equal(retryResponse.status, 200);
assert.deepEqual((await retryResponse.json()).record, firstRecord);
assert.equal((await http.POST(postRequest(writeToken, { ...input, delivery: { status: "failed" } }))).status, 409);
assert.equal((await http.POST(postRequest(readToken))).status, 403);
const ownResponse = await http.GET(getRequest(readToken));
assert.equal(ownResponse.status, 200);
assert.deepEqual((await ownResponse.json()).records, [firstRecord]);
assert.deepEqual((await (await http.GET(getRequest(bobRead))).json()).records, []);
assert.equal((await http.POST(postRequest(bobWrite))).status, 201);
assert.equal((await (await http.GET(getRequest(readToken))).json()).records.length, 1);
const prior = Object.fromEntries(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"].map((key) => [key, process.env[key]]));
try {
  for (const key of Object.keys(prior)) delete process.env[key];
  assert.throws(() => configuredHistoryStore(), { code: "HISTORY_UNAVAILABLE" });
  const priorAccounts = process.env.BAZAAR_HISTORY_ACCOUNTS_JSON;
  try {
    process.env.BAZAAR_HISTORY_ACCOUNTS_JSON = config;
    const request = (token, body = input, extra = {}) => new Request("https://bazaar.example/api/operations", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
    assert.equal((await GET(new Request("https://bazaar.example/api/operations"))).status, 401);
    assert.equal((await POST(request(readToken))).status, 403);
    assert.equal((await POST(request(writeToken, { ...input, ownerId: "bob" }))).status, 400);
    assert.equal((await POST(request(writeToken, input, { Origin: "https://other.example" }))).status, 400);
    assert.equal((await GET(new Request("https://bazaar.example/api/operations?token=never-in-query"))).status, 400);
    assert.equal((await POST(request(writeToken, { ...input, delivery: { status: "reported-delivered", result: "x".repeat(20000) } }))).status, 413);
    const unavailable = await POST(request(writeToken));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
    assert.equal(unavailable.headers.has("access-control-allow-origin"), false);
    assert.equal((await unavailable.json()).error.code, "HISTORY_UNAVAILABLE");
    const privateGet = await GET(new Request("https://bazaar.example/api/operations", { headers: { Authorization: `Bearer ${readToken}` } }));
    assert.equal(privateGet.status, 503);
  } finally { if (priorAccounts === undefined) delete process.env.BAZAAR_HISTORY_ACCOUNTS_JSON; else process.env.BAZAAR_HISTORY_ACCOUNTS_JSON = priorAccounts; }
} finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
console.log("Operation history: validation, private auth, least privilege, owner isolation, atomic idempotency model, restart persistence, result retrieval and fail-closed storage passed. No network or payments.");
