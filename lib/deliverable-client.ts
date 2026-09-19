import {
  deliverableSchema,
  type Deliverable,
  type SavedDeliverable,
} from "./deliverable.ts";

export type DeliveryCopyInput = {
  manifest: Deliverable;
  sources: Array<{ fileId: string; url: string }>;
};
export type DeliveryCopyResult = {
  status: "stored" | "partial" | "failed";
  versionId?: string;
  failedFiles: string[];
  error?: string;
};
/** Runs only in the buyer process. Never signs, purchases or repeats service execution. */
export async function preserveDeliverable(options: {
  baseUrl: string;
  writeToken: string;
  operationId: string;
  providerOrigin: string;
  delivery: DeliveryCopyInput;
}): Promise<DeliveryCopyResult> {
  let versionId: string | undefined;
  const failedFiles: string[] = [];
  try {
    const base = new URL(options.baseUrl),
      provider = new URL(options.providerOrigin);
    const permitted = (url: URL) =>
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)));
    if (!permitted(base) || !permitted(provider)) throw Error();
    const manifest = deliverableSchema.parse(options.delivery.manifest);
    versionId = manifest.versionId;
    async function post(path: string, body: unknown) {
      const response = await fetch(new URL(path, base), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + options.writeToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const code = (await response.json().catch(() => null))?.error?.code;
        throw Error(
          [
            "OWNER_STORAGE_LIMIT",
            "MANIFEST_LIMIT",
            "VERSION_CONFLICT",
            "PRIVATE_FILES_NOT_CONFIGURED",
          ].includes(code)
            ? code
            : "STORAGE_UNAVAILABLE",
        );
      }
      return response.json();
    }
    const { record } = (await post("/api/deliveries", {
      operationId: options.operationId,
      manifest,
    })) as { record: SavedDeliverable };
    for (const file of manifest.files) {
      if (record.files[file.id] === "available") continue;
      try {
        // A completed upload may survive a lost confirmation response; reconcile before fetching the provider again.
        try {
          await post("/api/deliveries/confirm", { versionId, fileId: file.id });
          continue;
        } catch {
          /* Not yet available. */
        }
        const source = options.delivery.sources.find(
          (s) => s.fileId === file.id,
        );
        if (!source) throw Error();
        const sourceUrl = new URL(source.url, provider);
        if (!permitted(sourceUrl) || sourceUrl.origin !== provider.origin)
          throw Error();
        const upload = (await post("/api/deliveries/uploads", {
          versionId,
          fileId: file.id,
        })) as { url: string; headers: Record<string, string> };
        if (!permitted(new URL(upload.url))) throw Error();
        const response = await fetch(sourceUrl, {
          redirect: "error",
          credentials: "omit",
          signal: AbortSignal.timeout(120000),
        });
        if (!response.ok || !response.body) throw Error();
        let bytes = 0;
        const body = response.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytes += chunk.byteLength;
              if (bytes > file.size) throw Error("FILE_SIZE_MISMATCH");
              controller.enqueue(chunk);
            },
            flush() {
              if (bytes !== file.size) throw Error("FILE_SIZE_MISMATCH");
            },
          }),
        );
        const request: RequestInit & { duplex: "half" } = {
          method: "PUT",
          headers: { ...upload.headers, "content-length": String(file.size) },
          body,
          duplex: "half",
          redirect: "error",
          credentials: "omit",
          signal: AbortSignal.timeout(300000),
        };
        const uploaded = await fetch(upload.url, request);
        if (!uploaded.ok) throw Error();
        await post("/api/deliveries/confirm", { versionId, fileId: file.id });
      } catch {
        failedFiles.push(file.id);
      }
    }
    return {
      status: failedFiles.length
        ? failedFiles.length === manifest.files.length
          ? "failed"
          : "partial"
        : "stored",
      versionId,
      failedFiles,
    };
  } catch (error) {
    return {
      status: "failed",
      versionId,
      failedFiles,
      error:
        error instanceof Error &&
        [
          "OWNER_STORAGE_LIMIT",
          "MANIFEST_LIMIT",
          "VERSION_CONFLICT",
          "PRIVATE_FILES_NOT_CONFIGURED",
        ].includes(error.message)
          ? error.message
          : "STORAGE_UNAVAILABLE",
    };
  }
}
