import { createHash } from "node:crypto";
import { canonicalResultSha256 } from "./delivery-result.ts";

export const EXECUTION_REQUEST_VERSION = "bazaar.execution-request/v1" as const;
export const DELIVERY_ENVELOPE_VERSION = "bazaar.delivery-envelope/v1" as const;
export const LOCAL_DEMO_AUTHORIZATION = "buyer-policy-approved-local-demo" as const;
export const FIXTURE_STATUS_ENDPOINT = "/api/buyer-execution/reference" as const;
const MIN_TTL_MS = 1_000;
const MAX_TTL_MS = 300_000;

export type FixtureServiceId = "script-creator" | "video-repurpose";
export type ExecutionRequestV1 = {
  version: typeof EXECUTION_REQUEST_VERSION;
  requestId: string;
  serviceId: FixtureServiceId;
  method: "POST";
  route: "/fixtures/script" | "/fixtures/video";
  input: Record<string, unknown>;
  inputHash: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
};
type Artifact = { id: string; mediaType: string; sha256: string; href: null };
export type DeliveryEnvelopeV1 = {
  version: typeof DELIVERY_ENVELOPE_VERSION;
  evidence: "local-fixture-only";
  request: Pick<ExecutionRequestV1, "requestId" | "serviceId" | "method" | "route" | "inputHash" | "idempotencyKey">;
  payment: { status: "not-performed"; transactionHash: null };
  delivery: { mode: "sync" | "async"; status: "completed" | "processing"; jobId: string | null; statusEndpoint: typeof FIXTURE_STATUS_ENDPOINT | null; result: unknown; resultHash: string; artifactManifest: Artifact[] };
  reconciliation: { status: "matched"; checks: Record<string, true> };
};

const replayCache = new Map<string, { inputHash: string; envelope: DeliveryEnvelopeV1 }>();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture(serviceId: FixtureServiceId) {
  if (serviceId === "script-creator") return { route: "/fixtures/script" as const, mode: "sync" as const };
  if (serviceId === "video-repurpose") return { route: "/fixtures/video" as const, mode: "async" as const };
  throw new Error("SERVICE_NOT_ALLOWED");
}
function requestIdentity(value: Omit<ExecutionRequestV1, "requestId" | "version" | "input">) {
  return sha(canonical({ version: EXECUTION_REQUEST_VERSION, serviceId: value.serviceId, method: value.method, route: value.route, inputHash: value.inputHash, idempotencyKey: value.idempotencyKey, createdAt: value.createdAt, expiresAt: value.expiresAt })).slice(0, 32);
}

export function createExecutionRequest(value: { serviceId: FixtureServiceId; input: unknown; idempotencyKey?: string; now?: Date; ttlMs?: number }): ExecutionRequestV1 {
  if (!value.input || typeof value.input !== "object" || Array.isArray(value.input)) throw new Error("INVALID_INPUT");
  const config = fixture(value.serviceId);
  const now = value.now ?? new Date();
  const ttlMs = value.ttlMs ?? MAX_TTL_MS;
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) throw new Error("INVALID_REQUEST_TIME");
  const input = value.input as Record<string, unknown>;
  const inputHash = sha(canonical(input));
  const idempotencyKey = value.idempotencyKey?.trim() || sha(`${value.serviceId}|${inputHash}`).slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const identity = { serviceId: value.serviceId, method: "POST" as const, route: config.route, inputHash, idempotencyKey, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
  return { version: EXECUTION_REQUEST_VERSION, requestId: requestIdentity(identity), input, ...identity };
}

function validateRequest(request: ExecutionRequestV1, now = new Date()) {
  const config = fixture(request.serviceId);
  if (request.version !== EXECUTION_REQUEST_VERSION || request.method !== "POST" || request.route !== config.route) throw new Error("REQUEST_BINDING_MISMATCH");
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(request.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (request.inputHash !== sha(canonical(request.input))) throw new Error("INPUT_TAMPERED");
  const created = Date.parse(request.createdAt); const expires = Date.parse(request.expiresAt); const current = now.getTime(); const ttl = expires - created;
  const canonicalDates = Number.isFinite(created) && Number.isFinite(expires) && new Date(created).toISOString() === request.createdAt && new Date(expires).toISOString() === request.expiresAt;
  if (!canonicalDates || ![created, expires, current, ttl].every(Number.isFinite) || created >= expires || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS || created > current + 5_000) throw new Error("INVALID_REQUEST_TIME");
  if (expires <= current) throw new Error("REQUEST_EXPIRED");
  const expectedId = requestIdentity({ serviceId: request.serviceId, method: request.method, route: request.route, inputHash: request.inputHash, idempotencyKey: request.idempotencyKey, createdAt: request.createdAt, expiresAt: request.expiresAt });
  if (request.requestId !== expectedId) throw new Error("REQUEST_IDENTITY_MISMATCH");
}
function baseEnvelope(request: ExecutionRequestV1, mode: "sync" | "async", status: "completed" | "processing", jobId: string | null, result: unknown, artifactManifest: Artifact[] = []): DeliveryEnvelopeV1 {
  return { version: DELIVERY_ENVELOPE_VERSION, evidence: "local-fixture-only", request: { requestId: request.requestId, serviceId: request.serviceId, method: request.method, route: request.route, inputHash: request.inputHash, idempotencyKey: request.idempotencyKey }, payment: { status: "not-performed", transactionHash: null }, delivery: { mode, status, jobId, statusEndpoint: mode === "async" ? FIXTURE_STATUS_ENDPOINT : null, result, resultHash: canonicalResultSha256(result), artifactManifest }, reconciliation: { status: "matched", checks: { requestId: true, serviceId: true, method: true, route: true, inputHash: true, resultHash: true, idempotencyKey: true, artifacts: true } } };
}
export function executeFixtureRequest(value: { request: ExecutionRequestV1; demoAuthorization?: unknown; now?: Date }): DeliveryEnvelopeV1 {
  validateRequest(value.request, value.now);
  if (value.demoAuthorization !== LOCAL_DEMO_AUTHORIZATION) throw new Error("AUTHORIZATION_REQUIRED");
  const prior = replayCache.get(value.request.idempotencyKey);
  if (prior) { if (prior.inputHash !== value.request.inputHash) throw new Error("IDEMPOTENCY_CONFLICT"); return prior.envelope; }
  if (value.request.input.simulateUnavailable === true) throw new Error("PROVIDER_UNAVAILABLE");
  let envelope: DeliveryEnvelopeV1;
  if (value.request.serviceId === "script-creator") {
    const topic = String(value.request.input.topic ?? "Producto digital");
    envelope = baseEnvelope(value.request, "sync", "completed", null, { status: "completed", language: "es", title: `Guion: ${topic}`, hook: `¿Y si ${topic} pudiera explicarse en 60 segundos?`, beats: ["Problema", "Idea central", "Prueba", "Cierre"], disclaimer: "Fixture local; contenido no producido por un proveedor externo." });
  } else {
    const sourceName = String(value.request.input.sourceName ?? "source-video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
    envelope = baseEnvelope(value.request, "async", "processing", `video_${value.request.requestId.slice(0, 10)}`, { status: "processing", progress: 35, uploadHandoff: { mode: "fixture-token", token: `upload_${value.request.requestId.slice(0, 8)}`, accepts: ["video/mp4"], uploaded: false }, sourceName, note: "No file was uploaded or stored." });
  }
  replayCache.set(value.request.idempotencyKey, { inputHash: value.request.inputHash, envelope });
  return envelope;
}
export function pollFixtureStatus(value: { request: ExecutionRequestV1; jobId: unknown; now?: Date }): DeliveryEnvelopeV1 {
  validateRequest(value.request, value.now);
  if (value.request.serviceId !== "video-repurpose") throw new Error("STATUS_NOT_SUPPORTED");
  const prior = replayCache.get(value.request.idempotencyKey);
  if (!prior || value.jobId !== prior.envelope.delivery.jobId) throw new Error("JOB_NOT_FOUND");
  if (prior.envelope.delivery.status === "completed") return prior.envelope;
  const artifactContent = { fixture: true, sourceName: (prior.envelope.delivery.result as Record<string, unknown>).sourceName, format: "video/mp4", durationSeconds: 45, note: "Metadata-only fixture artifact; no media bytes exist." };
  const manifest = [{ id: "video-output-1", mediaType: "video/mp4", sha256: canonicalResultSha256(artifactContent), href: null }];
  const result = { status: "completed", progress: 100, artifacts: [{ id: "video-output-1", content: artifactContent }] };
  const completed = baseEnvelope(value.request, "async", "completed", prior.envelope.delivery.jobId, result, manifest);
  replayCache.set(value.request.idempotencyKey, { inputHash: value.request.inputHash, envelope: completed });
  return completed;
}
export function reconcileEnvelope(request: ExecutionRequestV1, envelope: DeliveryEnvelopeV1): boolean {
  const expectedMode = request.serviceId === "video-repurpose" ? "async" : "sync";
  const lifecycleMatches = expectedMode === "async"
    ? envelope.delivery.statusEndpoint === FIXTURE_STATUS_ENDPOINT && typeof envelope.delivery.jobId === "string" && envelope.delivery.jobId === `video_${request.requestId.slice(0, 10)}`
    : envelope.delivery.statusEndpoint === null && envelope.delivery.jobId === null && envelope.delivery.status === "completed";
  const basic = envelope.version === DELIVERY_ENVELOPE_VERSION && envelope.evidence === "local-fixture-only" && envelope.payment.status === "not-performed" && envelope.payment.transactionHash === null && envelope.request.requestId === request.requestId && envelope.request.serviceId === request.serviceId && envelope.request.method === request.method && envelope.request.route === request.route && envelope.request.inputHash === request.inputHash && envelope.request.idempotencyKey === request.idempotencyKey && envelope.delivery.mode === expectedMode && lifecycleMatches && envelope.delivery.resultHash === canonicalResultSha256(envelope.delivery.result);
  if (!basic) return false;
  const artifacts = (envelope.delivery.result as { artifacts?: Array<{ id: string; content: unknown }> })?.artifacts ?? [];
  if (artifacts.length !== envelope.delivery.artifactManifest.length) return false;
  return envelope.delivery.artifactManifest.every((entry) => { const matches = artifacts.filter((candidate) => candidate.id === entry.id); return entry.href === null && matches.length === 1 && entry.sha256 === canonicalResultSha256(matches[0].content); });
}
export function resetFixtureReplayCache() { replayCache.clear(); }
