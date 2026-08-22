import { createHash, timingSafeEqual } from "node:crypto";
import { validateServiceCard } from "./discovery.ts";
import { parseServiceCardShape, type ShapeIssue } from "./service-card-schema.ts";
import {
  createDynamicServiceCard,
  getDynamicServiceCard,
  storageMode,
  type DynamicEntry,
} from "./dynamic-registry.ts";
import type { ServiceCard } from "./types.ts";

export type IngestErrorCode =
  | "UNAUTHORIZED"
  | "CARD_EXISTS"
  | "RESOURCE_NOT_FOUND"
  | "VALIDATION_FAILED"
  | "SERVICE_NOT_CONFIGURED"
  | "STORAGE_ERROR";

export interface IngestError {
  code: IngestErrorCode;
  message: string;
  retryable: boolean;
  stage: "discover";
  field?: string;
  failedRules?: Array<{ rule: string; reason: string }>;
}

export const ok = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value as Record<string, unknown>,
});

export const err = (error: IngestError) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(error),
    },
  ],
});

export function hashProviderKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function providerSecretConfigured(): boolean {
  return Boolean(process.env.BAZAAR_PROVIDER_SECRET);
}

export function registryMutationConfigured(): boolean {
  return process.env.BAZAAR_ENABLE_REGISTRY_MUTATIONS === "true"
    && providerSecretConfigured()
    && storageMode() === "upstash";
}

export function authorizeProviderKey(providerKey: string | undefined): boolean {
  if (!providerSecretConfigured()) return false;
  if (!providerKey) return false;
  const expected = Buffer.from(process.env.BAZAAR_PROVIDER_SECRET as string);
  const actual = Buffer.from(providerKey);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const unauthorizedError = (): IngestError => ({
  code: "UNAUTHORIZED",
  message: "Credencial de registro inválida o ausente en X-Bazaar-Provider-Key.",
  retryable: false,
  stage: "discover",
});

const storageError = (): IngestError => ({
  code: "STORAGE_ERROR",
  message: "El registro no pudo completar la operación.",
  retryable: true,
  stage: "discover",
});

const notConfiguredError = (): IngestError => ({
  code: "SERVICE_NOT_CONFIGURED",
  message: "El registro mutable requiere almacenamiento durable y credencial server-side.",
  retryable: false,
  stage: "discover",
});

export async function validateCardShape(card: unknown): Promise<{ ok: true; card: ServiceCard } | { ok: false; error: IngestError }> {
  const shape = parseServiceCardShape(card);
  if (!shape.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "La ServiceCard no cumple el schema de forma.",
        retryable: false,
        stage: "discover",
        failedRules: shape.issues.map((issue) => ({ rule: `schema.${issue.field}`, reason: issue.reason })),
      },
    };
  }
  return { ok: true, card: shape.card };
}

export function validateCardRules(card: ServiceCard) {
  const outcomes = validateServiceCard(card);
  const failedOutcomes = outcomes.filter((o) => o.status === "fail");
  return { outcomes, failedOutcomes };
}

export type CreateResult =
  | {
      ok: true;
      entry: DynamicEntry;
      outcomes: ReturnType<typeof validateServiceCard>;
    }
  | { ok: false; error: IngestError };

export async function createService(rawCard: unknown, providerKey: string | undefined): Promise<CreateResult> {
  if (!registryMutationConfigured()) return { ok: false, error: notConfiguredError() };
  if (!authorizeProviderKey(providerKey)) return { ok: false, error: unauthorizedError() };
  const shape = await validateCardShape(rawCard);
  if (!shape.ok) return { ok: false, error: shape.error };
  const { outcomes, failedOutcomes } = validateCardRules(shape.card);
  if (failedOutcomes.length > 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "La ServiceCard no cumple las reglas deterministas de conformance.",
        retryable: false,
        stage: "discover",
        failedRules: failedOutcomes.map((f) => ({ rule: f.rule, reason: f.reason })),
      },
    };
  }
  try {
    const providerKeyHash = hashProviderKey(providerKey as string);
    const created = await createDynamicServiceCard(shape.card, providerKeyHash);
    if ("exists" in created) {
      return {
        ok: false,
        error: {
          code: "CARD_EXISTS",
          message: `Ya existe una ServiceCard con id '${shape.card.id}'. Usa update o un id distinto.`,
          retryable: false,
          stage: "discover",
          field: "id",
        },
      };
    }
    return { ok: true, entry: created.entry, outcomes };
  } catch {
    return { ok: false, error: storageError() };
  }
}

export async function getServiceById(id: string): Promise<DynamicEntry | undefined> {
  try {
    return await getDynamicServiceCard(id);
  } catch {
    return undefined;
  }
}

export { storageMode };
