import { createHash } from "node:crypto";
import { z } from "zod";
import { activitySchema, type ActivityInput } from "./activity.ts";
import { appendActivity } from "./activity-client.ts";
import {
  deliverableSchema,
  originalResultSchema,
  type Deliverable,
} from "./deliverable.ts";
import {
  preserveDeliverable,
  type DeliveryCopyResult,
} from "./deliverable-client.ts";
import { appendOperationHistory } from "./operation-history-client.ts";
import {
  canonicalOperationJson,
  operationHistoryInputSchema,
  type OperationHistoryInput,
} from "./operation-history.ts";

const findingSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(160),
    detail: z.string().max(8192),
    category: z.string().max(100).optional(),
    severity: z.string().max(100).optional(),
    evidence: z.string().max(2000).optional(),
  })
  .passthrough();
const reportSchema = z
  .object({
    provider: z.literal("website-intelligence"),
    mode: z.string().min(1).max(80),
    summary: z.string().min(1).max(2000),
    score: z.number().finite().min(0).max(100),
    findings: z.array(findingSchema).max(90),
  })
  .passthrough();
const stableId = (operationId: string, part: string) =>
  "wi-" +
  createHash("sha256")
    .update(canonicalOperationJson([operationId, part]))
    .digest("hex")
    .slice(0, 48);

export type WebsiteReportBundleInput = {
  operationId: string;
  taskId: string;
  agentId: string;
  mode: "mock" | "testnet";
  providerOrigin: string;
  payTo: string;
  result: unknown;
  transactionHash?: string;
};
export type WebsiteReportBundle = {
  operation: OperationHistoryInput;
  manifest: Deliverable;
  events: ActivityInput[];
};

/** Adapts an already received result. This module cannot execute or pay for a service. */
export function buildWebsiteReportBundle(
  input: WebsiteReportBundleInput,
): WebsiteReportBundle {
  if (!["mock", "testnet"].includes(input.mode))
    throw Error("INVALID_REPORT_MODE");
  if (input.transactionHash && input.mode !== "testnet")
    throw Error("MOCK_PAYMENT_REFERENCE");
  const original = originalResultSchema.parse(input.result);
  // Keep a JSON snapshot so later caller mutations cannot change the saved evidence.
  const originalResult: unknown = JSON.parse(JSON.stringify(original));
  const result = reportSchema.parse(originalResult);
  if (
    new Set(result.findings.map((finding) => finding.id)).size !==
    result.findings.length
  )
    throw Error("DUPLICATE_FINDING_ID");
  const provider = new URL(input.providerOrigin);
  if (
    (provider.protocol !== "https:" && !(input.mode === "mock" && provider.protocol === "http:" && provider.hostname === "127.0.0.1")) ||
    provider.username ||
    provider.password ||
    provider.search ||
    provider.hash ||
    !["", "/"].includes(provider.pathname)
  )
    throw Error("INVALID_PROVIDER_ORIGIN");
  const fixture = result.mode === "fixture";
  const live = result.mode === "live";
  const observation = live ? z.object({
    requestedUrl: z.string().url().max(2048), finalUrl: z.string().url().max(2048),
    fetchedAt: z.string().datetime(), limitations: z.array(z.string().max(1000)).min(1).max(10),
    network: z.object({ attempted: z.literal(true), allowed: z.literal(true) }),
  }).parse(result) : undefined;
  const scope = observation
    ? "Análisis real del HTML de una página. URL solicitada: " + observation.requestedUrl + "\n\nURL final: " + observation.finalUrl + "\n\nConsultado: " + observation.fetchedAt + "\n\n" + observation.limitations.join("\n") + (input.mode === "mock" ? "\n\nValidación local sin pago; el contenido procede de una consulta real." : "")
    : fixture
    ? "El proveedor declara un resultado fixture: analiza un ejemplo local, sin visitar el sitio solicitado. El pago Testnet no convierte este resultado en una auditoría en vivo."
    : "Modo declarado por el proveedor: " +
      result.mode +
      ". La información se conserva tal como fue entregada; el pago no certifica su calidad.";
  const manifest = deliverableSchema.parse({
    schemaVersion: "bazaar.deliverable/v1",
    deliveryId: stableId(input.operationId, "delivery"),
    versionId: stableId(input.operationId, "version:1"),
    versionLabel: fixture ? "Informe fixture · v1" : live ? "Análisis real · v1" : "Informe · v1",
    title: fixture
      ? "Website Intelligence · informe fixture"
      : live ? "Website Intelligence · análisis real" : "Website Intelligence · informe",
    summary: result.summary,
    originalResult,
    files: [],
    content: {
      kind: "report",
      sections: [
        {
          id: stableId(input.operationId, "scope"),
          title: "Alcance del informe",
          body: scope,
        },
        {
          id: stableId(input.operationId, "summary"),
          title: "Resumen entregado",
          body: result.summary,
        },
        {
          id: stableId(input.operationId, "score"),
          title: live ? "Puntuación orientativa" : "Puntuación entregada",
          body: String(result.score) + "/100" + (live ? " · Indicador limitado a las comprobaciones del HTML; no es una certificación." : ""),
        },
        ...result.findings.map((finding) => ({
          id: stableId(input.operationId, "finding:" + finding.id),
          title: finding.title,
          body: [
            finding.detail,
            finding.category === undefined
              ? ""
              : "Categoría: " + finding.category,
            finding.severity === undefined
              ? ""
              : "Severidad: " + finding.severity,
          ]
            .filter(Boolean)
            .join("\n\n"),
          ...(finding.evidence === undefined
            ? {}
            : { findings: [finding.evidence] }),
        })),
      ],
    },
  });
  const operation = operationHistoryInputSchema.parse({
    clientOperationId: input.operationId,
    taskId: input.taskId,
    agentId: input.agentId,
    mode: input.mode,
    service: {
      id: "website-intelligence",
      title: "Website Intelligence",
      provider: "Website Intelligence",
      url: new URL(live && input.mode === "mock" ? "/v1/audits" : "/v1/x402/audits", provider).toString(),
    },
    payment: {
      status: input.transactionHash
        ? "reported-unverified"
        : input.mode === "mock"
          ? "not-requested"
          : "unknown",
      network: "stellar:testnet",
      asset: "USDC",
      amountAtomic: input.mode === "mock" ? "0" : "10000",
      recipient: input.payTo,
      ...(input.transactionHash
        ? { transactionHash: input.transactionHash }
        : {}),
    },
    delivery: {
      status: "reported-delivered",
      ...(new TextEncoder().encode(JSON.stringify(originalResult)).length <=
      8192
        ? { result: originalResult }
        : {}),
    },
  });
  const event = (
    kind: ActivityInput["kind"],
    title: string,
    details?: unknown,
  ): ActivityInput =>
    activitySchema.parse({
      eventId: stableId(input.operationId, "event:" + kind),
      operationId: input.operationId,
      taskId: input.taskId,
      agentId: input.agentId,
      mode: input.mode,
      serviceId: "website-intelligence",
      kind,
      title,
      ...(details === undefined ? {} : { result: details }),
    });
  const events = [
    ...(input.transactionHash
      ? [
          event("payment-reported", "Pago Testnet reportado por el agente", {
            transactionHash: input.transactionHash,
          }),
        ]
      : []),
    event(
      "delivery-reported",
      fixture
        ? "Informe fixture recibido de Website Intelligence"
        : "Informe recibido de Website Intelligence",
      { versionId: manifest.versionId, providerMode: result.mode },
    ),
    event("task-completed", "Informe guardado en la biblioteca privada", {
      versionId: manifest.versionId,
    }),
  ];
  return { operation, manifest, events };
}

export type WebsiteReportPersistence = {
  status: "stored" | "partial" | "failed";
  operation: "recorded" | "failed";
  manifest: DeliveryCopyResult;
  events: Array<{ eventId: string; status: "recorded" | "failed" | "skipped" }>;
  failures: Array<{
    stage: "operation" | "manifest" | "event";
    eventId?: string;
    code: string;
  }>;
};

/** Retry only this journal function after a storage failure; IDs make the writes idempotent. */
export async function persistWebsiteReport(
  baseUrl: string,
  writeToken: string,
  bundle: WebsiteReportBundle,
): Promise<WebsiteReportPersistence> {
  const operation = operationHistoryInputSchema.parse(bundle.operation);
  const manifest = deliverableSchema.parse(bundle.manifest);
  const events = bundle.events.map((event) => activitySchema.parse(event));
  if (
    manifest.files.length ||
    manifest.content.kind !== "report" ||
    !operation.taskId ||
    events.some(
      (event) =>
        event.taskId !== operation.taskId ||
        event.operationId !== operation.clientOperationId ||
        event.agentId !== operation.agentId ||
        event.mode !== operation.mode,
    ) ||
    new Set(events.map((event) => event.eventId)).size !== events.length ||
    events.filter((event) => event.kind === "task-completed").length !== 1 ||
    events.at(-1)?.kind !== "task-completed"
  )
    throw Error("INVALID_REPORT_BUNDLE");
  const failures: WebsiteReportPersistence["failures"] = [];
  const operationStatus = await appendOperationHistory(
    baseUrl,
    { writeToken },
    operation,
  );
  if (operationStatus === "failed")
    failures.push({ stage: "operation", code: "HISTORY_WRITE_FAILED" });
  const manifestStatus: DeliveryCopyResult =
    operationStatus === "recorded"
      ? await preserveDeliverable({
          baseUrl,
          writeToken,
          operationId: operation.clientOperationId,
          providerOrigin: new URL(operation.service.url).origin,
          delivery: { manifest, sources: [] },
        })
      : { status: "failed", failedFiles: [], error: "OPERATION_NOT_RECORDED" };
  if (manifestStatus.status !== "stored")
    failures.push({
      stage: "manifest",
      code: manifestStatus.error ?? "MANIFEST_WRITE_FAILED",
    });
  const eventStatuses: WebsiteReportPersistence["events"] = [];
  for (const event of events) {
    if (event.kind === "task-completed" && failures.length) {
      eventStatuses.push({ eventId: event.eventId, status: "skipped" });
      failures.push({
        stage: "event",
        eventId: event.eventId,
        code: "COMPLETION_NOT_RECORDED",
      });
      continue;
    }
    const status = await appendActivity(baseUrl, { writeToken }, event);
    eventStatuses.push({ eventId: event.eventId, status });
    if (status === "failed")
      failures.push({
        stage: "event",
        eventId: event.eventId,
        code: "ACTIVITY_WRITE_FAILED",
      });
  }
  return {
    status: !failures.length
      ? "stored"
      : operationStatus === "recorded" ||
          eventStatuses.some((event) => event.status === "recorded")
        ? "partial"
        : "failed",
    operation: operationStatus,
    manifest: manifestStatus,
    events: eventStatuses,
    failures,
  };
}
