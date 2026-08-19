import { createHash, timingSafeEqual } from "node:crypto";
import { validateServiceCard } from "./discovery.ts";
import { parseServiceCardShape, type ShapeIssue } from "./service-card-schema.ts";
import {
  createDynamicServiceCard,
  deleteDynamicServiceCard,
  getDynamicServiceCard,
  listDynamicServiceCardsByProvider,
  storageMode,
  updateDynamicServiceCard,
  type DynamicEntry,
} from "./dynamic-registry.ts";
import type { ServiceCard } from "./types.ts";

export type IngestErrorCode =
  | "UNAUTHORIZED"
  | "CARD_EXISTS"
  | "RESOURCE_NOT_FOUND"
  | "VALIDATION_FAILED"
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

export function authorizeProviderKey(providerKey: string | undefined): boolean {
  if (!providerSecretConfigured()) return true;
  if (!providerKey) return false;
  const expected = Buffer.from(process.env.BAZAAR_PROVIDER_SECRET as string);
  const actual = Buffer.from(providerKey);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const unauthorizedError = (): IngestError => ({
  code: "UNAUTHORIZED",
  message: "Provider key inválida o ausente (header X-Bazaar-Provider-Key / parámetro providerKey).",
  retryable: false,
  stage: "discover",
});

const storageError = (cause: unknown): IngestError => ({
  code: "STORAGE_ERROR",
  message: cause instanceof Error ? cause.message : "Error interno del registro.",
  retryable: true,
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
    const providerKeyHash = hashProviderKey(providerKey ?? "dev-open");
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
  } catch (cause) {
    return { ok: false, error: storageError(cause) };
  }
}

export type UpdateResult =
  | {
      ok: true;
      entry: DynamicEntry;
      outcomes: ReturnType<typeof validateServiceCard>;
    }
  | { ok: false; error: IngestError };

export async function updateService(id: string, rawCard: unknown, providerKey: string | undefined): Promise<UpdateResult> {
  if (!authorizeProviderKey(providerKey)) return { ok: false, error: unauthorizedError() };

  const existing = await getDynamicServiceCard(id).catch(() => undefined);
  if (!existing) {
    return {
      ok: false,
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: `No existe una ServiceCard con id '${id}'.`,
        retryable: false,
        stage: "discover",
        field: "id",
      },
    };
  }
  if (existing.providerKeyHash !== hashProviderKey(providerKey ?? "dev-open")) {
    return { ok: false, error: unauthorizedError() };
  }

  const shape = await validateCardShape(rawCard);
  if (!shape.ok) return { ok: false, error: shape.error };
  if (shape.card.id !== id) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "El id de la ruta no coincide con el id de la ServiceCard.",
        retryable: false,
        stage: "discover",
        field: "id",
      },
    };
  }
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
    const providerKeyHash = hashProviderKey(providerKey ?? "dev-open");
    const updated = await updateDynamicServiceCard(shape.card, providerKeyHash);
    if ("notFound" in updated) {
      return {
        ok: false,
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: `No existe una ServiceCard con id '${id}'.`,
          retryable: false,
          stage: "discover",
          field: "id",
        },
      };
    }
    if ("unauthorized" in updated) {
      return { ok: false, error: unauthorizedError() };
    }
    return { ok: true, entry: updated.entry, outcomes };
  } catch (cause) {
    return { ok: false, error: storageError(cause) };
  }
}

export type DeleteResult =
  | { ok: true; deleted: DynamicEntry }
  | { ok: false; error: IngestError };

export async function deleteService(id: string, providerKey: string | undefined): Promise<DeleteResult> {
  if (!authorizeProviderKey(providerKey)) return { ok: false, error: unauthorizedError() };
  try {
    const providerKeyHash = hashProviderKey(providerKey ?? "dev-open");
    const deleted = await deleteDynamicServiceCard(id, providerKeyHash);
    if ("notFound" in deleted) {
      return {
        ok: false,
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: `No existe una ServiceCard con id '${id}'.`,
          retryable: false,
          stage: "discover",
          field: "id",
        },
      };
    }
    if ("unauthorized" in deleted) {
      return { ok: false, error: unauthorizedError() };
    }
    return { ok: true, deleted: deleted.deleted };
  } catch (cause) {
    return { ok: false, error: storageError(cause) };
  }
}

export type ListResult =
  | { ok: true; entries: DynamicEntry[] }
  | { ok: false; error: IngestError };

export async function listMyServices(providerKey: string | undefined): Promise<ListResult> {
  if (!authorizeProviderKey(providerKey)) return { ok: false, error: unauthorizedError() };
  try {
    const providerKeyHash = hashProviderKey(providerKey ?? "dev-open");
    const entries = await listDynamicServiceCardsByProvider(providerKeyHash);
    return { ok: true, entries };
  } catch (cause) {
    return { ok: false, error: storageError(cause) };
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