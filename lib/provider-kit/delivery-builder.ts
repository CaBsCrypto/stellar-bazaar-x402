import { createHash } from "node:crypto";
import type { DeliverableFileInput, StandardDeliveryEnvelope } from "./types.ts";

export function createDeliverableBundle<T = unknown>(
  serviceId: string,
  result: T,
  files: DeliverableFileInput[] = []
): StandardDeliveryEnvelope<T> {
  const resultJson = JSON.stringify(result);
  const resultHash = createHash("sha256").update(resultJson).digest("hex");

  const manifestFiles = files.map((f) => {
    const buffer = typeof f.content === "string" ? Buffer.from(f.content, "utf-8") : Buffer.from(f.content);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    return {
      id: f.id,
      path: f.path,
      contentType: f.contentType,
      sizeBytes: buffer.byteLength,
      sha256,
      role: f.role,
    };
  });

  const manifestPayload = JSON.stringify({ serviceId, files: manifestFiles, resultHash });
  const manifestHash = createHash("sha256").update(manifestPayload).digest("hex");

  return {
    result,
    resultHash,
    bazaarDelivery: {
      version: "bazaar.delivery-bundle/v1",
      serviceId,
      deliveredAt: new Date().toISOString(),
      manifestHash,
      files: manifestFiles,
    },
  };
}
