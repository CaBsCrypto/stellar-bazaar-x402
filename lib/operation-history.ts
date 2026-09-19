import { z } from "zod";

const text = (max: number) => z.string().min(1).max(max).refine((value) => !/[\u0000-\u001f]/.test(value));
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
const safeUrl = z.string().max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
});
const secretKey = /secret|password|token|authorization|signature|seed|mnemonic|private.?key|api.?key|credential|cookie|payload/i;
const secretValue = /\bS[A-Z2-7]{55}\b|-----BEGIN .*PRIVATE KEY|\bBearer\s+\S+|[?&](?:token|key|signature|authorization|secret|password)=/i;

/** Deliberately small private result; never accepts credentials or payment authorizations. */
export function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === undefined || value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 8192 && !secretValue.test(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => safeJson(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).length <= 100 && Object.entries(value).every(([key, item]) =>
    !secretKey.test(key) && !["__proto__", "prototype", "constructor"].includes(key) && safeJson(item, depth + 1));
}

export const historyArtifactSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/), mediaType: z.enum(["text/plain", "application/json", "text/csv", "application/pdf", "image/png", "image/jpeg"]), base64: z.string().max(87384).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict(),
  z.object({ kind: z.literal("external"), url: safeUrl, label: text(120) }).strict(),
]);

export const operationHistoryInputSchema = z.object({
  clientOperationId: identifier,
  mode: z.enum(["fixture", "mock", "testnet"]),
  agentId: identifier.optional(),
  taskId: identifier.optional(),
  service: z.object({ id: identifier, title: text(200), provider: text(200), url: z.union([safeUrl, z.string().max(2048).url().refine((value) => { const url = new URL(value); return url.protocol === "http:" && url.hostname === "127.0.0.1" && !url.username && !url.password && !url.search && !url.hash; })]) }).strict(),
  payment: z.object({
    status: z.enum(["not-requested", "reported-unverified", "failed", "unknown"]),
    network: z.literal("stellar:testnet"),
    asset: text(128),
    amountAtomic: z.string().regex(/^(0|[1-9][0-9]{0,29})$/),
    recipient: z.string().regex(/^[GC][A-Z2-7]{55}$/),
    transactionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  delivery: z.object({
    status: z.enum(["pending", "reported-delivered", "failed", "unknown"]),
    result: z.unknown().optional(),
    artifact: historyArtifactSchema.optional(),
  }).strict(),
}).strict().superRefine((input, context) => {
  if (new URL(input.service.url).protocol === "http:" && (input.mode !== "mock" || input.payment.status !== "not-requested" || input.payment.amountAtomic !== "0")) context.addIssue({ code: "custom", message: "Loopback service is only allowed for unpaid local validation" });
  const artifact = input.delivery.artifact;
  if (artifact?.kind === "external" && new URL(artifact.url).origin !== new URL(input.service.url).origin) {
    context.addIssue({ code: "custom", message: "External delivery must use provider origin" });
  }
  if (artifact?.kind === "file") {
    const bytes = Buffer.from(artifact.base64, "base64");
    if (artifact.mediaType === "application/json") { try { if (!safeJson(JSON.parse(bytes.toString("utf8")))) throw Error(); } catch { context.addIssue({code:"custom",message:"Unsupported JSON file"}); } }
    if (!bytes.length || bytes.length > 65536 || bytes.toString("base64") !== artifact.base64 || secretValue.test(bytes.toString("utf8"))) {
      context.addIssue({ code: "custom", message: "Unsupported file content" });
    }
  }
  if (!safeJson({ ...input, delivery: { ...input.delivery, artifact: undefined } }) || JSON.stringify(input.delivery.result ?? null).length > 8192) {
    context.addIssue({ code: "custom", message: "Unsupported or sensitive content" });
  }
  if (input.payment.transactionHash && input.payment.status !== "reported-unverified") {
    context.addIssue({ code: "custom", message: "Transaction reference requires an unverified payment report" });
  }
});

export type OperationHistoryInput = z.infer<typeof operationHistoryInputSchema>;
export type OperationHistoryRecord = OperationHistoryInput & {
  id: string;
  recordedAt: string;
  evidence: "agent-reported";
};

export function parseOperationHistoryInput(input: unknown): OperationHistoryInput {
  return operationHistoryInputSchema.parse(input);
}

export function canonicalOperationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalOperationJson).join(",")}]`;
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonicalOperationJson(v)}`).join(",") + "}";
  return JSON.stringify(value);
}
