import * as z from "zod/v4";
import type { ServiceCard } from "./types.ts";

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
    scheme: z.enum(["exact", "upto"]),
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