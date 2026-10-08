import { assertPaymentOptions } from "./payment-options.ts";
import * as z from "zod/v4";
import type { ServiceCard } from "./types.ts";
import { isMarketAmount } from './market-price.ts';

const deliveryStorageSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('text') }).strict(),
  z.object({ mode: z.literal('external'), maxFiles: z.number().int().min(1).max(10) }).strict(),
  z.object({ mode: z.literal('bazaar'), maxFiles: z.number().int().min(1).max(10), maxTotalBytes: z.number().int().min(1).max(100_000_000), maxFileBytes: z.number().int().min(1).max(50_000_000) }).strict()
    .refine(value => value.maxFileBytes <= value.maxTotalBytes, 'El tamaño por archivo no puede superar el total.'),
]);

const skillSchema = z.object({
  version: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  title: z.string().min(1).max(120).refine(value => value.trim().length > 0, 'El título no puede estar vacío.'),
  instructions: z.string().min(1).max(8192).refine(value => new TextEncoder().encode(value).byteLength <= 8192, 'Las instrucciones no pueden superar 8 KB UTF-8.'),
}).strict();

export const stellarCreditIdentitySchema=z.object({
  kind:z.literal('stellar-classic-credit'),network:z.enum(['stellar:testnet','stellar:mainnet']),
  code:z.string().regex(/^[A-Za-z0-9]{1,12}$/),issuer:z.string().regex(/^G[A-Z2-7]{55}$/),sacContract:z.string().regex(/^C[A-Z2-7]{55}$/),
}).strict();

const deliverySchema = z.object({
  storage: deliveryStorageSchema.optional(),
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
  skill: skillSchema.optional(),
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
    amount: z.string().max(28).refine(isMarketAmount, "amount debe ser positivo, tener hasta 7 decimales y caber en int64 de Stellar."),
    destination: z.string().regex(/^G[A-Z2-7]{55}$/, "destination debe ser una cuenta Stellar pública G… de 56 caracteres."),
    identity:stellarCreditIdentitySchema.optional(),
    marketplace:z.object({
      protocol:z.literal('x402-stellar-exact-v2'),
      resourceTemplate:z.literal('/api/market/orders/{operationId}/x402'),
    }).strict().optional(),
  }),
  paymentOptions: z.array(z.object({scheme:z.literal("exact"), asset:z.enum(["USDC","XLM"]), contract:z.string(), amount:z.string(), destination:z.string()})).min(1).max(2).optional(),
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
  if (parsed.success) {
    try { assertPaymentOptions(parsed.data as ServiceCard); } catch { return {ok:false,issues:[{field:"paymentOptions",reason:"Opciones de pago inválidas."}]}; }
    return { ok: true, card: parsed.data as ServiceCard };
  }
  const issues: ShapeIssue[] = parsed.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(raíz)",
    reason: issue.message,
  }));
  return { ok: false, issues };
}
