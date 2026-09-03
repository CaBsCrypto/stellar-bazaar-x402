import * as z from "zod/v4";
import type { ServiceCard } from "./types.ts";

const deliverySchema = z.object({
  mode: z.enum(["sync", "async"]),
  estimatedDurationMs: z.number().int().positive(),
  result: z.object({
    schemaVersion: z.string().min(1),
    contentType: z.string().min(1),
    terminalStatuses: z.array(z.string().min(1)).min(1),
    hash: z.object({ algorithm: z.literal("sha256"), required: z.literal(true), scope: z.literal("canonical-result") }),
  }),
  status: z.object({ required: z.boolean(), urlTemplate: z.string().min(1).optional(), pollAfterMs: z.number().int().positive().optional() })
    .superRefine((value, ctx) => { if (value.required && !value.urlTemplate) ctx.addIssue({ code: "custom", message: "status.urlTemplate es obligatorio cuando status.required=true." }); }),
  callback: z.object({ supported: z.boolean(), required: z.literal(false), authentication: z.enum(["none", "provider-signed"]) }),
  retention: z.object({ resultTtlHours: z.number().nonnegative(), durable: z.boolean() }),
  idempotency: z.object({ required: z.boolean(), key: z.literal("Idempotency-Key"), replay: z.enum(["return-original", "reject-conflict"]) }),
  retry: z.object({ retryable: z.boolean(), maxAttempts: z.number().int().min(0), failureSemantics: z.enum(["terminal-error", "retry-later"]) }),
});

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id debe ser un slug kebab-case (a-z0-9 y guiones).");

const serviceCardSchema = z.object({
  version: z.literal("bazaar.service-card/v0"),
  id: slug,
  name: z.string().min(1, "name es obligatorio."),
  description: z.string().min(1, "description es obligatoria."),
  kind: z.enum(["http", "mcp"]),
  url: z
    .string()
    .min(1)
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
        } catch {
          return false;
        }
      },
      "url debe ser HTTPS (localhost/127.0.0.1 permitido para desarrollo).",
    ),
  routeTemplate: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("/") && !/\.\.|[\r\n#]|@/.test(value),
      "routeTemplate debe comenzar con / y no contener .., @, # o saltos de línea.",
    ),
  input: z.array(
    z.object({
      name: z.string().min(1, "Cada input requiere name."),
      type: z.enum(["string", "number", "boolean"]),
      required: z.boolean(),
    }),
  ),
  network: z.literal("stellar:testnet"),
  payment: z.object({
    scheme: z.enum(["exact", "upto", "split-exact"]),
    asset: z.string().min(1, "asset es obligatorio."),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,7})?$/, "amount debe ser decimal positivo (máximo 7 decimales).")
      .refine((value) => Number(value) > 0, "amount debe ser mayor que cero."),
    destination: z.string().regex(/^G[A-Z2-7]{55}$/, "destination debe ser una cuenta Stellar pública G… de 56 caracteres."),
  }),
  provider: z.object({
    name: z.string().min(1, "provider.name es obligatorio."),
  }),
  tags: z.array(z.string().min(1)),
  delivery: deliverySchema.optional(),
});

export interface ShapeIssue {
  field: string;
  reason: string;
}

export function parseServiceCardShape(data: unknown): { ok: true; card: ServiceCard } | { ok: false; issues: ShapeIssue[] } {
  const parsed = serviceCardSchema.safeParse(data);
  if (parsed.success) return { ok: true, card: parsed.data as ServiceCard };
  const issues: ShapeIssue[] = parsed.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(raíz)",
    reason: issue.message,
  }));
  return { ok: false, issues };
}
