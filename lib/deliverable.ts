import { z } from "zod";
import { safeJson } from "./operation-history.ts";

/** Bounded provider JSON, displayed as text and never treated as markup. */
export const originalResultSchema = z.unknown().refine((value) => {
  if (!safeJson(value)) return false;
  const serialized = JSON.stringify(value);
  return (
    serialized !== undefined &&
    new TextEncoder().encode(serialized).length <= 64000
  );
}, "Unsupported or sensitive original result");

export const FILE_LIMIT = 500_000_000;
export const OWNER_LIMIT = 5_000_000_000;
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
const text = (max = 4000) => z.string().max(max);
const https = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  });
export const deliveryFileSchema = z
  .object({
    id,
    name: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[^\\/\r\n\u0000]+$/),
    mediaType: z
      .string()
      .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/)
      .max(120),
    size: z.number().int().positive().max(FILE_LIMIT),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const scene = z
  .object({
    id,
    title: text(160),
    durationSeconds: z.number().nonnegative().max(86400).optional(),
    narration: text(),
    screenText: text().optional(),
    visual: text().optional(),
  })
  .strict();
const clip = z
  .object({
    id,
    title: text(160),
    fileId: id,
    captionsFileId: id.optional(),
    posterFileId: id.optional(),
    durationSeconds: z.number().positive().optional(),
  })
  .strict();
const section = z
  .object({
    id,
    title: text(160),
    body: text(16000),
    findings: z.array(text(2000)).max(50).optional(),
  })
  .strict();
export const deliverableSchema = z
  .object({
    schemaVersion: z.literal("bazaar.deliverable/v1"),
    deliveryId: id,
    versionId: id,
    previousVersionId: id.optional(),
    versionLabel: text(80),
    title: text(200),
    summary: text(2000),
    originalResult: originalResultSchema.optional(),
    files: z.array(deliveryFileSchema).max(50),
    content: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("script"),
          scenes: z.array(scene).min(1).max(100),
        })
        .strict(),
      z
        .object({
          kind: z.literal("video"),
          clips: z.array(clip).min(1).max(50),
        })
        .strict(),
      z
        .object({
          kind: z.literal("gallery"),
          variants: z
            .array(
              z
                .object({
                  id,
                  title: text(160),
                  fileId: id,
                  description: text(2000).optional(),
                })
                .strict(),
            )
            .min(1)
            .max(50),
        })
        .strict(),
      z
        .object({
          kind: z.literal("report"),
          sections: z.array(section).min(1).max(100),
          sources: z
            .array(z.object({ id, title: text(200), url: https }).strict())
            .max(100)
            .optional(),
        })
        .strict(),
      z
        .object({ kind: z.literal("other"), text: text(16000).optional() })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const files = new Map(value.files.map((f) => [f.id, f]));
    if (files.size !== value.files.length)
      ctx.addIssue({ code: "custom", message: "Duplicate file IDs" });
    if (value.previousVersionId === value.versionId)
      ctx.addIssue({
        code: "custom",
        message: "Version cannot reference itself",
      });
    const content = value.content;
    const parts =
      content.kind === "script"
        ? content.scenes
        : content.kind === "video"
          ? content.clips
          : content.kind === "gallery"
            ? content.variants
            : content.kind === "report"
              ? content.sections
              : [];
    if (new Set(parts.map((p) => p.id)).size !== parts.length)
      ctx.addIssue({ code: "custom", message: "Duplicate part IDs" });
    const check = (fileId: string, type?: string) => {
      const file = files.get(fileId);
      if (!file || (type && !file.mediaType.startsWith(type)))
        ctx.addIssue({ code: "custom", message: "Invalid file reference" });
    };
    if (content.kind === "gallery")
      for (const part of content.variants) check(part.fileId, "image/");
    if (content.kind === "video")
      for (const part of content.clips) {
        check(part.fileId, "video/");
        if (part.posterFileId) check(part.posterFileId, "image/");
        if (part.captionsFileId) check(part.captionsFileId, "text/vtt");
      }
    if (JSON.stringify(value).length > 128000)
      ctx.addIssue({ code: "custom", message: "Manifest exceeds 128 KB" });
    if (
      /\bS[A-Z2-7]{55}\b|-----BEGIN .*PRIVATE KEY|\bBearer\s+\S+/.test(
        JSON.stringify(value),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Sensitive content is not permitted",
      });
  });
export type Deliverable = z.infer<typeof deliverableSchema>;
export type DeliveryFile = z.infer<typeof deliveryFileSchema>;
export type SavedDeliverable = {
  manifest: Deliverable;
  operationId: string;
  taskId?: string;
  agentId?: string;
  createdAt: string;
  files: Record<string, "pending" | "available">;
};
export function deliveryAvailability(
  delivery: SavedDeliverable,
): "available" | "partial" | "pending" {
  const states = delivery.manifest.files.map((f) => delivery.files[f.id]);
  if (states.every((s) => s === "available")) return "available";
  return states.some((s) => s === "available") ? "partial" : "pending";
}
