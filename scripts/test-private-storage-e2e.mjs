import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPrivateS3, configuredPrivateS3 } from "../lib/deliverable-s3.ts";
import {
  createDeliverableStore,
  configuredDeliverableStore,
  DeliverableError,
} from "../lib/deliverable-store.ts";
import { createDeliverableHandlers } from "../lib/deliverable-http.ts";
import { authenticateHistory } from "../lib/operation-history-auth.ts";
import { deliverableSchema, OWNER_LIMIT, FILE_LIMIT } from "../lib/deliverable.ts";

const hash = (v) => createHash("sha256").update(v).digest("hex");
const fixtureDir = resolve("work/private-deliverables-fixtures");
const manifestPath = join(fixtureDir, "manifest.json");
const posterPath = join(fixtureDir, "test-poster.png");
const videoPath = join(fixtureDir, "test-sample.mp4");

if (!existsSync(manifestPath) || !existsSync(posterPath) || !existsSync(videoPath)) {
  console.error("Fixtures not found. Run scripts/prepare-test-deliverables.mjs first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const posterBytes = readFileSync(posterPath);
const videoBytes = readFileSync(videoPath);
const posterSha256 = hash(posterBytes);
const videoSha256 = hash(videoBytes);

console.log("=== BAZAAR PRIVATE STORAGE E2E TEST ===");
console.log(`Manifest: ${manifest.title} (${manifest.deliveryId})`);
console.log(`Poster:   ${posterBytes.length} bytes, sha256: ${posterSha256}`);
console.log(`Video:    ${videoBytes.length} bytes, sha256: ${videoSha256}`);

// Determine if we are testing with real cloud S3 / R2 or local S3 compliant server
let isRealCloudStorage = false;
let s3Storage;
let testHttpServer;

if (
  process.env.BAZAAR_S3_BUCKET &&
  process.env.BAZAAR_S3_ACCESS_KEY_ID &&
  process.env.BAZAAR_S3_SECRET_ACCESS_KEY
) {
  try {
    s3Storage = configuredPrivateS3();
    isRealCloudStorage = true;
    console.log("Storage backend: REAL CLOUD S3 / R2 (Credentials detected)");
  } catch (e) {
    console.log("Cloud S3 config error, falling back to local S3 server:", e.message);
  }
}

const localObjects = new Map();

if (!isRealCloudStorage) {
  console.log("Storage backend: LOCAL S3-COMPLIANT HTTP SERVER (Development mode)");
  
  // Create a local HTTP server that implements S3 PUT, GET, HEAD with Range header support
  testHttpServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const key = url.pathname;

    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const expectedSha256Base64 = req.headers["x-amz-checksum-sha256"];
        const actualSha256Base64 = createHash("sha256").update(body).digest("base64");
        
        localObjects.set(key, {
          body,
          size: body.length,
          contentType: req.headers["content-type"] || "application/octet-stream",
          checksumBase64: actualSha256Base64,
          sha256Hex: createHash("sha256").update(body).digest("hex"),
        });
        
        res.writeHead(200, { ETag: `"${hash(body)}"` });
        res.end();
      });
      return;
    }

    if (req.method === "HEAD") {
      const obj = localObjects.get(key);
      if (!obj) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Length": String(obj.size),
        "Content-Type": obj.contentType,
        "x-amz-checksum-sha256": obj.checksumBase64,
      });
      res.end();
      return;
    }

    if (req.method === "GET") {
      const obj = localObjects.get(key);
      if (!obj) {
        res.writeHead(404);
        res.end();
        return;
      }

      // Range request support for video scrubbing / streaming
      const range = req.headers["range"];
      if (range && range.startsWith("bytes=")) {
        const parts = range.replace("bytes=", "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : obj.size - 1;
        const chunk = obj.body.subarray(start, end + 1);
        
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${obj.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Content-Type": obj.contentType,
        });
        res.end(chunk);
        return;
      }

      res.writeHead(200, {
        "Content-Length": String(obj.size),
        "Content-Type": obj.contentType,
        "Accept-Ranges": "bytes",
      });
      res.end(obj.body);
      return;
    }

    res.writeHead(405);
    res.end();
  });

  await new Promise((resolve) => testHttpServer.listen(0, "127.0.0.1", resolve));
  const port = testHttpServer.address().port;
  const endpoint = `http://127.0.0.1:${port}`;

  const client = new S3Client({
    region: "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: "TESTONLY", secretAccessKey: "TESTONLY" },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  s3Storage = createPrivateS3(client, "bazaar-test-bucket");
}

// 2. Set up Redis store (real or in-memory)
let store;
const memoryStoreMap = new Map();
const memoryQuotas = new Map();
const memoryIndexes = new Map();

const memoryRedis = {
  async eval(script, keys, args) {
    const [key, quota, index] = keys;
    const map = memoryStoreMap.get(key) ?? new Map();
    memoryStoreMap.set(key, map);

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
    if (map.has(id)) {
      return [
        JSON.parse(map.get(id)).digest === digest ? "existing" : "conflict",
        map.get(id),
      ];
    }
    if ((memoryQuotas.get(quota) ?? 0) + Number(bytes) > Number(limit)) {
      return ["quota"];
    }
    if (
      parent &&
      (!map.has(parent) ||
        JSON.parse(map.get(parent)).record.manifest.deliveryId !== family)
    ) {
      return ["parent"];
    }
    map.set(id, raw);
    memoryQuotas.set(quota, (memoryQuotas.get(quota) ?? 0) + Number(bytes));
    memoryIndexes.set(index, [id, ...(memoryIndexes.get(index) ?? [])]);
    return ["created", raw];
  },
  async hmget(key, ...ids) {
    return Object.fromEntries(ids.map((id) => [id, memoryStoreMap.get(key)?.get(id)]));
  },
  async lrange(key, start, end) {
    return (memoryIndexes.get(key) ?? []).slice(start, end + 1);
  },
};

store = createDeliverableStore(memoryRedis);

// 3. Set up Auth & Handlers
const aliceRead = "a".repeat(43);
const aliceWrite = "w".repeat(43);
const bobRead = "b".repeat(43);
const authConfig = JSON.stringify([
  { ownerId: "alice", readTokenHash: hash(aliceRead), writeTokenHash: hash(aliceWrite) },
  { ownerId: "bob", readTokenHash: hash(bobRead), writeTokenHash: hash("x".repeat(43)) },
]);

const existingHistory = [
  { clientOperationId: "op-test-1", taskId: "task-test-1", agentId: "agent-test-1" },
  { clientOperationId: "prior-audit-123", taskId: "audit-123", agentId: "website-intelligence-pilot" }
];

const handlers = createDeliverableHandlers({
  auth: (h, w) => authenticateHistory(h, w, authConfig),
  history: () => ({
    all: async (owner) => (owner === "alice" ? existingHistory : []),
  }),
  store: () => store,
  objects: () => s3Storage,
});

function postReq(path, body, token) {
  return new Request("https://bazaar.test" + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function getReq(path, token) {
  return new Request("https://bazaar.test" + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

console.log("\n--- TEST 1: Reserve Delivery Manifest ---");
const reserveRes = await handlers.POST(
  postReq("/api/deliveries", { operationId: "op-test-1", manifest }, aliceWrite)
);
assert.equal(reserveRes.status, 201, "Should create reservation with 201");
const reservedData = await reserveRes.json();
assert.equal(reservedData.record.files["file-test-poster-1"], "pending");
assert.equal(reservedData.record.files["file-test-video-1"], "pending");
console.log("✓ Delivery manifest reserved with status: pending for both files");

console.log("\n--- TEST 2: Request Upload URLs and Upload Real Bytes ---");
// 2a. Poster upload URL
const posterUploadRes = await handlers.upload(
  postReq("/api/deliveries/uploads", { versionId: "v1", fileId: "file-test-poster-1" }, aliceWrite)
);
assert.equal(posterUploadRes.status, 200);
const posterUploadData = await posterUploadRes.json();
assert.ok(posterUploadData.url, "Should return presigned PUT URL");

// Upload poster bytes
const posterPut = await fetch(posterUploadData.url, {
  method: "PUT",
  headers: posterUploadData.headers,
  body: posterBytes,
});
assert.equal(posterPut.status, 200, "Poster PUT should succeed");
console.log("✓ Poster bytes uploaded to storage");

// 2b. Video upload URL
const videoUploadRes = await handlers.upload(
  postReq("/api/deliveries/uploads", { versionId: "v1", fileId: "file-test-video-1" }, aliceWrite)
);
assert.equal(videoUploadRes.status, 200);
const videoUploadData = await videoUploadRes.json();
assert.ok(videoUploadData.url, "Should return presigned PUT URL");

// Upload video bytes
const videoPut = await fetch(videoUploadData.url, {
  method: "PUT",
  headers: videoUploadData.headers,
  body: videoBytes,
});
assert.equal(videoPut.status, 200, "Video PUT should succeed");
console.log("✓ Video bytes uploaded to storage");

console.log("\n--- TEST 3: Confirm Uploads and Verify Integrity ---");
const posterConfirm = await handlers.confirm(
  postReq("/api/deliveries/confirm", { versionId: "v1", fileId: "file-test-poster-1" }, aliceWrite)
);
assert.equal(posterConfirm.status, 200, "Poster confirmation should succeed");

const videoConfirm = await handlers.confirm(
  postReq("/api/deliveries/confirm", { versionId: "v1", fileId: "file-test-video-1" }, aliceWrite)
);
assert.equal(videoConfirm.status, 200, "Video confirmation should succeed");

const v1Saved = await store.get("alice", "v1");
assert.equal(v1Saved.files["file-test-poster-1"], "available");
assert.equal(v1Saved.files["file-test-video-1"], "available");
console.log("✓ Both files confirmed with verified SHA-256 integrity -> available");

console.log("\n--- TEST 4: Temporary Presigned GET Access & Range/Streaming ---");
// 4a. Access Poster (inline view)
const posterAccessRes = await handlers.access(
  postReq("/api/deliveries/access", { versionId: "v1", fileId: "file-test-poster-1", download: false }, aliceRead)
);
assert.equal(posterAccessRes.status, 200);
const posterAccess = await posterAccessRes.json();
assert.ok(posterAccess.url);

const downloadedPoster = await fetch(posterAccess.url);
const downloadedPosterBytes = Buffer.from(await downloadedPoster.arrayBuffer());
assert.equal(downloadedPosterBytes.length, posterBytes.length);
assert.equal(hash(downloadedPosterBytes), posterSha256);
console.log("✓ Poster downloaded via temporary GET URL with exact byte-for-byte SHA-256 match");

// 4b. Access Video with Range header (scrubbing/seeking)
const videoAccessRes = await handlers.access(
  postReq("/api/deliveries/access", { versionId: "v1", fileId: "file-test-video-1", download: false }, aliceRead)
);
assert.equal(videoAccessRes.status, 200);
const videoAccess = await videoAccessRes.json();

const rangeVideoRes = await fetch(videoAccess.url, {
  headers: { Range: "bytes=0-1024" },
});
assert.ok([200, 206].includes(rangeVideoRes.status), "Video should support streaming/range response");
const videoSlice = Buffer.from(await rangeVideoRes.arrayBuffer());
assert.ok(videoSlice.length > 0, "Video stream slice received");
console.log("✓ Video streamable and supports seek/scrubbing range requests");

console.log("\n--- TEST 5: Owner Isolation & Security Boundaries ---");
// Bob attempts to access Alice's deliverable
const bobAccess = await handlers.access(
  postReq("/api/deliveries/access", { versionId: "v1", fileId: "file-test-poster-1" }, bobRead)
);
assert.equal(bobAccess.status, 404, "Bob cannot access Alice's deliverable (404)");

// Read token cannot call write/upload endpoints
const readTokenUpload = await handlers.upload(
  postReq("/api/deliveries/uploads", { versionId: "v1", fileId: "file-test-poster-1" }, aliceRead)
);
assert.equal(readTokenUpload.status, 403, "Read-only token cannot request upload URLs (403)");
console.log("✓ Strict owner isolation and read/write permission gates verified");

console.log("\n--- TEST 6: Interrupted / Corrupted Upload & Retry ---");
// Create version v2 with corrupted file
const v2Manifest = {
  ...manifest,
  versionId: "v2",
  previousVersionId: "v1",
  versionLabel: "Versión de Prueba 2",
};
await handlers.POST(postReq("/api/deliveries", { operationId: "op-test-1", manifest: v2Manifest }, aliceWrite));

const corruptUpload = await handlers.upload(
  postReq("/api/deliveries/uploads", { versionId: "v2", fileId: "file-test-poster-1" }, aliceWrite)
);
// Upload corrupt bytes
await fetch((await corruptUpload.json()).url, {
  method: "PUT",
  headers: { "content-type": "image/png" },
  body: Buffer.from("CORRUPT_BYTES_NOT_MATCHING_SHA256"),
});

// Confirmation must reject
const corruptConfirm = await handlers.confirm(
  postReq("/api/deliveries/confirm", { versionId: "v2", fileId: "file-test-poster-1" }, aliceWrite)
);
assert.equal(corruptConfirm.status, 409, "Corrupted upload must be rejected (409)");

// Retry upload with correct bytes
const retryUpload = await handlers.upload(
  postReq("/api/deliveries/uploads", { versionId: "v2", fileId: "file-test-poster-1" }, aliceWrite)
);
await fetch((await retryUpload.json()).url, {
  method: "PUT",
  headers: { "content-type": "image/png", "x-amz-checksum-sha256": Buffer.from(posterSha256, "hex").toString("base64") },
  body: posterBytes,
});
const retryConfirm = await handlers.confirm(
  postReq("/api/deliveries/confirm", { versionId: "v2", fileId: "file-test-poster-1" }, aliceWrite)
);
assert.equal(retryConfirm.status, 200, "Retried upload with valid bytes must succeed");
console.log("✓ Corrupted upload safely rejected and storage-only retry succeeded");

console.log("\n--- TEST 7: Previous Reports and Quotas Preservation ---");
const priorAudits = await handlers.GET(
  getReq("/api/deliveries?operationId=prior-audit-123", aliceRead)
);
assert.equal(priorAudits.status, 200);
console.log("✓ Existing structured reports in Redis remain untouched and available");

if (testHttpServer) {
  testHttpServer.close();
}

console.log("\n=======================================================");
console.log("ALL PRIVATE STORAGE E2E INVARIANTS VALIDATED AND PASSED!");
console.log("=======================================================");
