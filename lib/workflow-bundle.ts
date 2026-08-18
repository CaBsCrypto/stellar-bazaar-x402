import type { ValidationOutcome } from "./types.ts";

export const WORKFLOW_BUNDLE_VERSION = "bazaar.workflow-bundle/v1" as const;

export type WorkflowBundleStatus =
  | "draft"
  | "ready"
  | "running"
  | "awaiting-approval"
  | "partial"
  | "complete"
  | "failed";

export type AggregatePriceStatus = "estimate" | "quoted" | "partially-paid" | "paid";

export interface WorkflowStage {
  order: number;
  capability: string;
  input: string[];
  outputArtifact: { type: string; mediaType: string; schemaVersion: string };
  approvalGate?: boolean;
  next?: number;
}

export interface WorkflowBundle {
  version: "bazaar.workflow-bundle/v1";
  id: string;
  title: { es: string; en: string };
  objective: { es: string; en: string };
  services: Array<{ id: string; version: string }>;
  stages: WorkflowStage[];
  handoffArtifact?: { type: string; mediaType: string; schemaVersion: string; integrity: string };
  aggregatePrice: {
    entries: Array<{ provider: string; asset: string; network: string; scheme: string; amount: string }>;
    status: AggregatePriceStatus;
  };
  status: WorkflowBundleStatus;
  policy?: { allowlist?: string[]; budget?: string; expiry?: string; artifacts?: string };
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const DECIMAL = /^\d+(\.\d{1,7})?$/;
const MEDIA_TYPE = /^[\w.+-]+\/[\w.+-]+$/;
const NETWORKS = new Set(["stellar:testnet"]);
const SCHEMES = new Set(["exact", "upto"]);
const STATUSES = new Set<WorkflowBundleStatus>([
  "draft",
  "ready",
  "running",
  "awaiting-approval",
  "partial",
  "complete",
  "failed",
]);
const PRICE_STATUSES = new Set<AggregatePriceStatus>([
  "estimate",
  "quoted",
  "partially-paid",
  "paid",
]);

export function validateWorkflowBundle(
  bundle: WorkflowBundle,
  knownServiceIds: string[],
): ValidationOutcome[] {
  const out: ValidationOutcome[] = [];
  const rule = (
    name: string,
    ok: boolean,
    pass: string,
    fail: string,
    status: "fail" | "warning" = "fail",
  ) => out.push({ rule: name, status: ok ? "pass" : status, reason: ok ? pass : fail });

  rule(
    "bundle.version",
    bundle.version === WORKFLOW_BUNDLE_VERSION,
    "Versión del bundle reconocida.",
    `Usa ${WORKFLOW_BUNDLE_VERSION}.`,
  );
  rule(
    "bundle.id",
    STABLE_ID.test(bundle.id),
    "ID estable y máquina-legible.",
    "id debe ser [a-z0-9-] y no comenzar con símbolos.",
  );

  const serviceIds = bundle.services.map((s) => s.id);
  const hasDuplicates = new Set(serviceIds).size !== serviceIds.length;
  rule(
    "bundle.services.unique",
    !hasDuplicates,
    "Referencias de servicio únicas.",
    "services no puede repetir ids.",
  );
  rule(
    "bundle.services.nonempty",
    serviceIds.length > 0,
    "Al menos un servicio referenciado.",
    "services debe declarar al menos una capacidad.",
  );
  const staleRefs = serviceIds.filter((id) => !knownServiceIds.includes(id));
  rule(
    "bundle.services.known",
    staleRefs.length === 0,
    "Todas las capacidades existen en el catálogo.",
    `Capacidades desconocidas o sin versión publicada: ${staleRefs.join(", ")}.`,
  );

  rule(
    "bundle.stages.nonempty",
    bundle.stages.length > 0,
    "Al menos una etapa declarada.",
    "stages debe declarar al menos una etapa.",
  );

  const orders = bundle.stages.map((s) => s.order);
  const expectedOrders = bundle.stages.map((_, i) => i);
  const sequential =
    orders.length === expectedOrders.length &&
    orders.every((o, i) => o === expectedOrders[i]);
  rule(
    "bundle.stages.sequential",
    sequential,
    "Órdenes secuenciales 0..n-1.",
    "stages debe numerarse en orden 0..n-1 sin saltos ni duplicados.",
  );

  const unknownCapabilities = bundle.stages
    .map((s) => s.capability)
    .filter((cap) => !serviceIds.includes(cap));
  rule(
    "bundle.stages.capability",
    unknownCapabilities.length === 0,
    "Cada etapa referencia una capacidad del bundle.",
    `Etapas con capacidad no declarada en services: ${unknownCapabilities.join(", ")}.`,
  );

  const stageByOrder = new Map(bundle.stages.map((s) => [s.order, s]));
  const visited = new Set<number>();
  const stack = new Set<number>();
  let cycleDetected = false;
  const walk = (order: number) => {
    if (stack.has(order)) {
      cycleDetected = true;
      return;
    }
    if (visited.has(order)) return;
    visited.add(order);
    stack.add(order);
    const stage = stageByOrder.get(order);
    const next = stage?.next ?? order + 1;
    if (stageByOrder.has(next)) walk(next);
    stack.delete(order);
  };
  bundle.stages.forEach((s) => walk(s.order));
  rule(
    "bundle.stages.acyclic",
    !cycleDetected,
    "El grafo de handoff no contiene ciclos.",
    "El encadenamiento de etapas forma un ciclo; cada artifact debe avanzar.",
  );

  const lastOrder = bundle.stages.length > 0 ? bundle.stages.length - 1 : -1;
  const gatedLast = bundle.stages.some(
    (s) => s.approvalGate === true && s.order === lastOrder,
  );
  rule(
    "bundle.approvalGate.meaningful",
    !gatedLast,
    "Todo approval gate precede a etapas posteriores.",
    "Una etapa final con approvalGate=true es un gate sin efecto (bypass).",
  );

  const artifactOk = (artifact: { type: string; mediaType: string; schemaVersion: string }) =>
    artifact.type.trim().length > 0 &&
    MEDIA_TYPE.test(artifact.mediaType) &&
    artifact.schemaVersion.trim().length > 0;
  rule(
    "bundle.stages.artifacts",
    bundle.stages.every((s) => artifactOk(s.outputArtifact)),
    "Artifacts de etapa con type/mediaType/schemaVersion válidos.",
    "Cada etapa debe declarar outputArtifact con type, mediaType (tipo/subtipo) y schemaVersion.",
  );
  if (bundle.handoffArtifact) {
    rule(
      "bundle.handoffArtifact.valid",
      artifactOk(bundle.handoffArtifact) && bundle.handoffArtifact.integrity.trim().length > 0,
      "Handoff artifact válido con regla de integridad.",
      "handoffArtifact debe incluir type, mediaType, schemaVersion e integrity.",
    );
  } else {
    rule(
      "bundle.handoffArtifact.valid",
      false,
      "Handoff artifact declarado.",
      "El bundle debe declarar handoffArtifact para la entrega final.",
      "warning",
    );
  }

  const entries = bundle.aggregatePrice?.entries ?? [];
  rule(
    "bundle.price.nonempty",
    entries.length > 0,
    "Desglose de precios por proveedor.",
    "aggregatePrice.entries no puede estar vacío.",
  );
  rule(
    "bundle.price.assets",
    entries.length > 0 && new Set(entries.map((e) => `${e.asset}@${e.network}`)).size === 1,
    "Un único asset/network en el desglose.",
    "El bundle no puede mezclar assets o redes incompatibles.",
  );
  rule(
    "bundle.price.scheme",
    entries.every((e) => SCHEMES.has(e.scheme)),
    "Schemes de pago reconocidos (exact/upto).",
    "aggregatePrice sólo admite schemes exact o upto.",
  );
  rule(
    "bundle.price.amounts",
    entries.every((e) => DECIMAL.test(e.amount) && Number(e.amount) > 0),
    "Montos positivos con precisión Stellar.",
    "Cada amount debe ser decimal positivo con máximo 7 decimales.",
  );
  rule(
    "bundle.price.networks",
    entries.every((e) => NETWORKS.has(e.network)),
    "Red Stellar Testnet declarada.",
    "El MVP sólo admite stellar:testnet.",
  );
  rule(
    "bundle.price.status",
    PRICE_STATUSES.has(bundle.aggregatePrice.status),
    "Estado del precio reconocido.",
    `status debe ser uno de: ${[...PRICE_STATUSES].join(", ")}.`,
  );

  rule(
    "bundle.status.known",
    STATUSES.has(bundle.status),
    "Estado agregado reconocido.",
    `status debe ser uno de: ${[...STATUSES].join(", ")}.`,
  );

  if (bundle.status === "complete") {
    rule(
      "bundle.status.gated",
      !bundle.stages.some((s) => s.approvalGate === true),
      "Estados finales sin approval gates pendientes.",
      "Un bundle complete no puede conservar approval gates abiertos.",
      "warning",
    );
  }

  return out;
}