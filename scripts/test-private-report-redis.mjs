/**
 * Opt-in integration test against the Redis credentials in this project's .env.local.
 * Run: node scripts/test-private-report-redis.mjs --run-isolated-test
 *
 * Writes only synthetic data under two random owners, using the current stores/HTTP
 * handlers. Leaves 2 operations, 2 events and 3 inline report versions for inspection.
 * No cleanup, expiration, global key scan, S3, provider requests or payments. A fresh
 * Node child reads the same data with a read-only Redis adapter. Secrets are never
 * placed in arguments, output, artifacts, or process.env; child auth travels via IPC.
 */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const self = fileURLToPath(import.meta.url);
const project = fileURLToPath(new URL("../", import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const ownerPattern = /^qa_report_[a-f0-9]{32}(?:_other)?$/;
let phase = "opt-in guard";

function check(condition, message) {
  assert.ok(condition, message);
}

function readRedisConfig() {
  // Parse only the supported single-line Redis settings, never load the whole env
  // into process.env (which would also load wallet/payment/provider credentials).
  const names = new Set([
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]);
  const selected = Object.create(null);
  const source = readFileSync(
    new URL("../.env.local", import.meta.url),
    "utf8",
  );
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line);
    if (!match || !names.has(match[1])) continue;
    check(!(match[1] in selected), "Duplicate Redis configuration key");
    selected[match[1]] = parseEnv(line)[match[1]];
  }
  const url = selected.UPSTASH_REDIS_REST_URL ?? selected.KV_REST_API_URL;
  const secret =
    selected.UPSTASH_REDIS_REST_TOKEN ?? selected.KV_REST_API_TOKEN;
  check(
    typeof url === "string" && typeof secret === "string" && secret.length > 0,
    "Redis configuration unavailable",
  );
  const endpoint = new URL(url);
  check(
    endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash,
    "Invalid Redis endpoint",
  );
  return { url, token: secret };
}

async function modules() {
  const [
    redis,
    history,
    activity,
    deliveries,
    historyHttp,
    activityHttp,
    deliveryHttp,
    auth,
    model,
  ] = await Promise.all([
    import("@upstash/redis"),
    import("../lib/operation-history-store.ts"),
    import("../lib/activity-store.ts"),
    import("../lib/deliverable-store.ts"),
    import("../lib/operation-history-http.ts"),
    import("../lib/activity-http.ts"),
    import("../lib/deliverable-http.ts"),
    import("../lib/operation-history-auth.ts"),
    import("../lib/deliverable.ts"),
  ]);
  return {
    ...redis,
    ...history,
    ...activity,
    ...deliveries,
    ...historyHttp,
    ...activityHttp,
    ...deliveryHttp,
    ...auth,
    ...model,
  };
}

function keysFor(owner) {
  check(ownerPattern.test(owner), "Unexpected QA owner");
  const scope = `{${hash(owner)}}`;
  return {
    history: [
      `bazaar:history:v1:${scope}:records`,
      `bazaar:history:v1:${scope}:index`,
    ],
    activity: [
      `bazaar:activity:v1:${scope}:events`,
      `bazaar:activity:v1:${scope}:index`,
    ],
    deliveries: [
      `bazaar:deliveries:v1:${scope}:versions`,
      `bazaar:deliveries:v1:${scope}:bytes`,
      `bazaar:deliveries:v1:${scope}:index`,
    ],
  };
}

function scopedRedis(raw, m, owners, readOnly) {
  const scopes = owners.map(keysFor);
  const allowed = new Set(scopes.flatMap((s) => Object.values(s).flat()));
  const indexes = new Set(
    scopes.flatMap((s) => [s.history[1], s.activity[1], s.deliveries[2]]),
  );
  const hashes = new Set(
    scopes.flatMap((s) => [s.history[0], s.activity[0], s.deliveries[0]]),
  );
  const scripts = new Map([
    [m.APPEND_OPERATION_LUA, "history"],
    [m.APPEND_ACTIVITY_LUA, "activity"],
    [m.RESERVE_DELIVERY_LUA, "deliveries"],
  ]);
  const stats = { reads: 0, attemptedWrites: 0 };
  return {
    allowed: [...allowed],
    stats,
    adapter: {
      async eval(script, keys, args) {
        check(!readOnly, "Child attempted a write");
        const kind = scripts.get(script);
        check(
          kind &&
            scopes.some(
              (s) => JSON.stringify(s[kind]) === JSON.stringify(keys),
            ),
          "Write outside the exact approved QA keys/scripts",
        );
        stats.attemptedWrites++;
        return raw.eval(script, keys, args);
      },
      async lrange(key, start, end) {
        check(
          indexes.has(key) && start >= 0 && end <= 9999,
          "Unexpected index read",
        );
        stats.reads++;
        return raw.lrange(key, start, end);
      },
      async hmget(key, ...ids) {
        check(hashes.has(key) && ids.length > 0, "Unexpected record read");
        stats.reads++;
        return raw.hmget(key, ...ids);
      },
    },
  };
}

function session(m, raw, context, readOnly = false) {
  const guarded = scopedRedis(
    raw,
    m,
    [context.owner, context.otherOwner],
    readOnly,
  );
  const operations = m.createHistoryStore(guarded.adapter);
  const events = m.createActivityStore(guarded.adapter);
  const deliveries = m.createDeliverableStore(guarded.adapter);
  const authenticate = (header, write) =>
    m.authenticateHistory(header, write, context.authConfig);
  const forbiddenObjects = () => {
    throw new Error("Object storage is outside this test");
  };
  return {
    guarded,
    operations,
    events,
    deliveries,
    history: m.createHistoryHandlers({ authenticate, store: () => operations }),
    activity: m.createActivityHandlers({
      authenticate,
      operations: () => operations,
      events: () => events,
    }),
    reports: m.createDeliverableHandlers({
      auth: authenticate,
      history: () => operations,
      store: () => deliveries,
      objects: forbiddenObjects,
    }),
  };
}

function request(path, credential, body) {
  const headers = {};
  if (credential) headers.Authorization = `Bearer ${credential}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`https://isolated-qa.invalid${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function responseJson(response, status) {
  assert.equal(response.status, status, "Unexpected handler status");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Authorization");
  return response.json();
}

async function concurrent(post, body, credential, identity) {
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => post(body, credential)),
  );
  assert.equal(responses.filter((r) => r.status === 201).length, 1);
  assert.equal(responses.filter((r) => r.status === 200).length, 7);
  const saved = await Promise.all(
    responses.map((r) => responseJson(r, r.status)),
  );
  assert.equal(saved.filter((r) => r.created).length, 1);
  assert.equal(new Set(saved.map((r) => identity(r.record))).size, 1);
  return saved[0].record;
}

async function verifyReadOnly(m, s, context) {
  const records = (
    await responseJson(
      await s.history.GET(request("/api/operations", context.read)),
      200,
    )
  ).records;
  const others = (
    await responseJson(
      await s.history.GET(request("/api/operations", context.otherRead)),
      200,
    )
  ).records;
  assert.equal(records.length, 1);
  assert.equal(others.length, 1);
  assert.equal(records[0].id, context.operationRecordId);
  check(records[0].id !== others[0].id, "Owners share a stored operation");
  assert.equal(
    hash(JSON.stringify(records[0].delivery.result)),
    context.originalResultHash,
  );
  assert.equal(
    hash(JSON.stringify(others[0].delivery.result)),
    context.otherResultHash,
  );
  const events = (
    await responseJson(
      await s.activity.GET(request("/api/activity?view=events", context.read)),
      200,
    )
  ).items;
  const otherEvents = (
    await responseJson(
      await s.activity.GET(
        request("/api/activity?view=events", context.otherRead),
      ),
      200,
    )
  ).items;
  assert.equal(events.length, 1);
  assert.equal(otherEvents.length, 1);
  assert.equal(events[0].title, "Isolated original report");
  assert.equal(otherEvents[0].title, "Other owner's isolated report");
  const page = await responseJson(
    await s.reports.GET(
      request("/api/deliveries?operationId=report-operation", context.read),
    ),
    200,
  );
  assert.equal(page.versions.length, 2);
  assert.equal(page.limits.usedBytes, 0);
  const original = page.versions.find(
    (v) => v.manifest.versionId === "report-v1",
  );
  const revision = page.versions.find(
    (v) => v.manifest.versionId === "report-v2",
  );
  check(original && revision, "Missing persisted version");
  assert.equal(
    hash(JSON.stringify(original.manifest)),
    context.originalManifestHash,
  );
  assert.equal(revision.manifest.previousVersionId, "report-v1");
  assert.equal(original.manifest.content.kind, "report");
  assert.deepEqual(original.manifest.files, []);
  assert.equal(m.deliveryAvailability(original), "available");
  const otherPage = await responseJson(
    await s.reports.GET(
      request(
        "/api/deliveries?operationId=report-operation",
        context.otherRead,
      ),
    ),
    200,
  );
  assert.equal(otherPage.versions.length, 1);
  check(
    hash(JSON.stringify(otherPage.versions[0].manifest)) !==
      context.originalManifestHash,
    "Owners share a manifest",
  );
  const downloadPath = `/api/activity?download=1&operationId=${context.operationRecordId}`;
  const download = await s.activity.GET(request(downloadPath, context.read));
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(
    download.headers.get("content-disposition"),
    'attachment; filename="original-report.json"',
  );
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length, context.originalBytes);
  assert.equal(hash(bytes), context.originalBytesHash);
  await responseJson(
    await s.activity.GET(request(downloadPath, context.otherRead)),
    404,
  );
  await responseJson(await s.history.GET(request("/api/operations")), 401);
  await responseJson(await s.activity.GET(request("/api/activity")), 401);
  await responseJson(
    await s.reports.GET(
      request("/api/deliveries?operationId=report-operation"),
    ),
    401,
  );
  return { originalBytes: bytes.length, versions: page.versions.length };
}

async function readInChild(context) {
  return new Promise((resolve, reject) => {
    // A tiny allowlist avoids inheriting unrelated application credentials.
    const env = Object.fromEntries(
      ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"]
        .filter((key) => process.env[key])
        .map((key) => [key, process.env[key]]),
    );
    const child = fork(self, ["--run-isolated-test", "--read-only-child"], {
      cwd: project,
      env,
      execArgv: [],
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let result;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Read-only child timed out"));
    }, 60000);
    // Never forward a dependency's stdout/stderr, which might contain endpoint data.
    child.stdout.resume();
    child.stderr.resume();
    child.on("message", (message) => {
      result = message;
    });
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Child could not start"));
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || result?.ok !== true || result?.writes !== 0)
        reject(new Error("Independent read-only verification failed"));
      else resolve(result);
    });
    child.send(context);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--run-isolated-test")) {
    console.log(
      "Not run. Opt in with: node scripts/test-private-report-redis.mjs --run-isolated-test",
    );
    console.log(
      "Creates two isolated QA owners in real Redis; retains synthetic records. No payments or automatic cleanup.",
    );
    return;
  }
  check(
    args.every((arg) =>
      ["--run-isolated-test", "--read-only-child"].includes(arg),
    ),
    "Unknown argument",
  );
  check(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24+ is required",
  );
  const childMode = args.includes("--read-only-child");
  check(
    !childMode || typeof process.send === "function",
    "Child mode requires parent IPC",
  );
  // Attach before asynchronous imports so an early parent message cannot be lost.
  const childContext = childMode
    ? new Promise((resolve) => process.once("message", resolve))
    : undefined;
  phase = "load current stores and Redis configuration";
  const m = await modules();
  const raw = new m.Redis({
    ...readRedisConfig(),
    retry: { retries: 0 },
    enableAutoPipelining: false,
    latencyLogging: false,
    enableTelemetry: false,
    signal: () => AbortSignal.timeout(15000),
  });
  if (childMode) {
    const context = await childContext;
    check(
      ownerPattern.test(context.owner) &&
        context.otherOwner === `${context.owner}_other`,
      "Invalid child scope",
    );
    const s = session(m, raw, context, true);
    phase = "independent process read-only verification";
    const result = await verifyReadOnly(m, s, context);
    check(s.guarded.stats.attemptedWrites === 0, "Child wrote data");
    process.send({ ok: true, writes: 0, ...result }, () =>
      process.disconnect(),
    );
    return;
  }

  const owner = `qa_report_${randomUUID().replaceAll("-", "")}`;
  const otherOwner = `${owner}_other`;
  const read = token(),
    write = token(),
    otherRead = token(),
    otherWrite = token();
  const authConfig = JSON.stringify([
    { ownerId: owner, readTokenHash: hash(read), writeTokenHash: hash(write) },
    {
      ownerId: otherOwner,
      readTokenHash: hash(otherRead),
      writeTokenHash: hash(otherWrite),
    },
  ]);
  const context = { owner, otherOwner, read, otherRead, authConfig };
  const s = session(m, raw, context);
  phase = "fresh namespace preflight";
  // Exact known keys only; no SCAN, KEYS, global counts or existing-owner reads.
  assert.equal(
    await raw.exists(...s.guarded.allowed),
    0,
    "QA namespace already exists",
  );
  console.log(`Isolated QA owner: ${owner} (plus ${otherOwner}).`);
  console.log(
    "Only these owners will receive synthetic records; data is retained without TTL or cleanup.",
  );

  const content = {
    kind: "report",
    sections: [
      {
        id: "overview",
        title: "Resumen",
        body: `Informe privado de prueba — ejecución ${owner}.`,
        findings: ["Contenido original íntegro", "Sin operación de pago"],
      },
      {
        id: "detail",
        title: "Detalle",
        body: "Primera línea.\nSegunda línea con acentos: á, ñ, ü.",
      },
    ],
  };
  const originalBytes = Buffer.from(
    JSON.stringify(content, null, "\t") + "\n",
    "utf8",
  );
  const operation = {
    clientOperationId: "report-operation",
    taskId: "report-task",
    agentId: "qa-agent",
    mode: "mock",
    service: {
      id: "qa-inline-report",
      title: "Isolated report fixture",
      provider: "Local QA fixture",
      url: "https://isolated-qa.invalid/report",
    },
    payment: {
      status: "not-requested",
      network: "stellar:testnet",
      asset: "USDC",
      amountAtomic: "0",
      recipient: "G" + "A".repeat(55),
    },
    delivery: {
      status: "reported-delivered",
      result: content,
      artifact: {
        kind: "file",
        filename: "original-report.json",
        mediaType: "application/json",
        base64: originalBytes.toString("base64"),
      },
    },
  };
  const event = {
    eventId: "report-event",
    taskId: "report-task",
    agentId: "qa-agent",
    operationId: "report-operation",
    mode: "mock",
    kind: "task-started",
    title: "Isolated original report",
  };
  const manifest = {
    schemaVersion: "bazaar.deliverable/v1",
    deliveryId: "report-delivery",
    versionId: "report-v1",
    versionLabel: "Original",
    title: "Isolated private report",
    summary: "Synthetic real Redis QA report",
    files: [],
    content,
  };
  const delivery = { operationId: "report-operation", manifest };
  const postHistory = (body, credential) =>
    s.history.POST(request("/api/operations", credential, body));
  const postEvent = (body, credential) =>
    s.activity.POST(request("/api/activity", credential, body));
  const postReport = (body, credential) =>
    s.reports.POST(request("/api/deliveries", credential, body));

  phase = "authentication and write permissions";
  for (const [post, body] of [
    [postHistory, operation],
    [postEvent, event],
    [postReport, delivery],
  ]) {
    await responseJson(await post(body), 401);
    await responseJson(await post(body, token()), 401);
    await responseJson(await post(body, read), 403);
    await responseJson(
      await post({ ...body, ownerId: otherOwner }, write),
      400,
    );
  }
  assert.equal(s.guarded.stats.attemptedWrites, 0);

  phase = "atomic concurrent history, activity and report writes";
  const saved = await concurrent(postHistory, operation, write, (r) => r.id);
  await concurrent(postEvent, event, write, (r) => r.eventId + r.recordedAt);
  await concurrent(
    postReport,
    delivery,
    write,
    (r) => r.manifest.versionId + r.createdAt,
  );
  await responseJson(
    await postHistory(
      { ...operation, service: { ...operation.service, title: "Overwrite" } },
      write,
    ),
    409,
  );
  await responseJson(
    await postEvent({ ...event, title: "Overwrite" }, write),
    409,
  );
  await responseJson(
    await postReport(
      { ...delivery, manifest: { ...manifest, title: "Overwrite" } },
      write,
    ),
    409,
  );

  phase = "cross-owner read and write isolation";
  assert.deepEqual(
    (
      await responseJson(
        await s.history.GET(request("/api/operations", otherRead)),
        200,
      )
    ).records,
    [],
  );
  assert.deepEqual(
    (
      await responseJson(
        await s.activity.GET(request("/api/activity?view=events", otherRead)),
        200,
      )
    ).items,
    [],
  );
  await responseJson(await postReport(delivery, otherWrite), 404);
  await responseJson(
    await s.reports.GET(
      request("/api/deliveries?operationId=report-operation", otherRead),
    ),
    404,
  );
  await responseJson(
    await s.history.GET(request(`/api/operations?ownerId=${otherOwner}`, read)),
    400,
  );
  const otherResult = {
    kind: "report",
    sections: [
      { id: "other", title: "Other", body: "Other owner's original content." },
    ],
  };
  await responseJson(
    await postHistory(
      {
        ...operation,
        delivery: { status: "reported-delivered", result: otherResult },
      },
      otherWrite,
    ),
    201,
  );
  await responseJson(
    await postEvent(
      { ...event, title: "Other owner's isolated report" },
      otherWrite,
    ),
    201,
  );
  await responseJson(
    await postReport(
      { ...delivery, manifest: { ...manifest, content: otherResult } },
      otherWrite,
    ),
    201,
  );

  phase = "immutable versions";
  await responseJson(
    await postReport(
      {
        ...delivery,
        manifest: {
          ...manifest,
          versionId: "orphan-version",
          previousVersionId: "missing-version",
        },
      },
      write,
    ),
    409,
  );
  await responseJson(
    await postReport(
      {
        ...delivery,
        manifest: {
          ...manifest,
          versionId: "report-v2",
          previousVersionId: "report-v1",
          versionLabel: "Revision",
          summary: "New immutable revision",
          content: {
            kind: "report",
            sections: [
              { id: "revision", title: "Revision", body: "Separate version." },
            ],
          },
        },
      },
      write,
    ),
    201,
  );
  Object.assign(context, {
    operationRecordId: saved.id,
    originalManifestHash: hash(JSON.stringify(manifest)),
    originalResultHash: hash(JSON.stringify(content)),
    otherResultHash: hash(JSON.stringify(otherResult)),
    originalBytes: originalBytes.length,
    originalBytesHash: hash(originalBytes),
  });
  await verifyReadOnly(m, s, context);

  phase = "fresh Node process reload";
  const child = await readInChild(context);
  assert.equal(child.originalBytes, originalBytes.length);
  assert.equal(child.versions, 2);
  console.log(
    "PASS: authenticated isolation; 8 concurrent retries per store; conflict rejection; inline report files: []; immutable versions.",
  );
  console.log(
    `PASS: original ${child.originalBytes} bytes recovered byte-for-byte by a fresh Node process; child writes: 0.`,
  );
  console.log(
    "Retained: 2 mock operations, 2 events, 3 inline manifests, 0 reserved file bytes; no payment or S3 calls.",
  );
  console.log(
    `Exact QA keys allowed: ${s.guarded.allowed.length}; cleanup intentionally not performed. This does not test a Redis server restart or S3.`,
  );
}

main().catch(() => {
  // Do not print raw errors, stacks, request objects, endpoints or configuration.
  if (typeof process.send === "function") {
    process.exitCode = 1;
    process.send({ ok: false, phase }, () => process.disconnect());
  } else {
    console.error(
      `FAIL during ${phase}; no PASS claimed. Synthetic QA data, if written, is retained.`,
    );
    process.exitCode = 1;
  }
});
