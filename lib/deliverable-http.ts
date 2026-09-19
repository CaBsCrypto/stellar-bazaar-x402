import { z } from "zod";
import {
  authenticateHistory,
  HistoryAuthError,
} from "./operation-history-auth.ts";
import { configuredHistoryStore } from "./operation-history-store.ts";
import {
  deliverableSchema,
  FILE_LIMIT,
  OWNER_LIMIT,
  type SavedDeliverable,
} from "./deliverable.ts";
import {
  configuredDeliverableStore,
  DeliverableError,
} from "./deliverable-store.ts";
import { configuredPrivateS3 } from "./deliverable-s3.ts";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
const fileRequest = z.object({ versionId: id, fileId: id }).strict();
async function json(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new DeliverableError("INVALID_CONTENT_TYPE", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DeliverableError("INVALID_REQUEST", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 150000) {
      await reader.cancel();
      throw new DeliverableError("MANIFEST_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DeliverableError("INVALID_REQUEST", 400);
  }
}
export function createDeliverableHandlers(
  deps: {
    auth?: typeof authenticateHistory;
    history?: typeof configuredHistoryStore;
    store?: typeof configuredDeliverableStore;
    objects?: typeof configuredPrivateS3;
  } = {},
) {
  const auth = deps.auth ?? authenticateHistory,
    history = deps.history ?? configuredHistoryStore,
    store = deps.store ?? configuredDeliverableStore,
    objects = deps.objects ?? configuredPrivateS3;
  async function run(
    request: Request,
    action: "list" | "create" | "upload" | "confirm" | "access",
  ) {
    try {
      const url = new URL(request.url),
        origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new DeliverableError("INVALID_ORIGIN", 400);
      const principal = auth(
        request.headers.get("authorization"),
        ["create", "upload", "confirm"].includes(action),
      );
      if (action === "list") {
        if ([...url.searchParams.keys()].some((k) => k !== "operationId"))
          throw new DeliverableError("INVALID_QUERY", 400);
        const operationId = id.parse(url.searchParams.get("operationId"));
        const operation = (await history().all(principal.ownerId)).find(
          (r) => r.clientOperationId === operationId,
        );
        if (!operation) throw new DeliverableError("OPERATION_NOT_FOUND", 404);
        return Response.json(
          {
            versions: await store().list(principal.ownerId, operationId),
            limits: {
              fileBytes: FILE_LIMIT,
              ownerBytes: OWNER_LIMIT,
              usedBytes: await store().usage(principal.ownerId),
            },
          },
          { headers },
        );
      }
      if (url.search) throw new DeliverableError("INVALID_QUERY", 400);
      const body = await json(request);
      if (action === "create") {
        const input = z
          .object({ operationId: id, manifest: deliverableSchema })
          .strict()
          .parse(body);
        const operation = (await history().all(principal.ownerId)).find(
          (r) => r.clientOperationId === input.operationId,
        );
        if (!operation) throw new DeliverableError("OPERATION_NOT_FOUND", 404);
        // Store pending manifests even before S3 is configured: purchases remain visible.
        const record: SavedDeliverable = {
          manifest: input.manifest,
          operationId: input.operationId,
          taskId: operation.taskId,
          agentId: operation.agentId,
          createdAt: new Date().toISOString(),
          files: Object.fromEntries(
            input.manifest.files.map((f) => [f.id, "pending"]),
          ),
        };
        const saved = await store().reserve(principal.ownerId, record);
        return Response.json(saved, {
          status: saved.created ? 201 : 200,
          headers,
        });
      }
      const input = (
        action === "access"
          ? fileRequest.extend({ download: z.boolean().default(false) })
          : fileRequest
      ).parse(body);
      const saved = await store().get(principal.ownerId, input.versionId),
        file = saved?.manifest.files.find((f) => f.id === input.fileId);
      if (!saved || !file) throw new DeliverableError("FILE_NOT_FOUND", 404);
      if (action === "upload")
        return Response.json(
          await objects().upload(principal.ownerId, input.versionId, file),
          { headers },
        );
      if (action === "confirm") {
        await objects().verify(principal.ownerId, input.versionId, file);
        return Response.json(
          {
            record: await store().confirm(
              principal.ownerId,
              input.versionId,
              input.fileId,
            ),
          },
          { headers },
        );
      }
      if (saved.files[file.id] !== "available")
        throw new DeliverableError("FILE_PENDING", 409);
      return Response.json(
        await objects().access(
          principal.ownerId,
          input.versionId,
          file,
          "download" in input && input.download === true,
        ),
        { headers },
      );
    } catch (error) {
      const code =
        error instanceof DeliverableError
          ? error.code
          : error instanceof HistoryAuthError
            ? error.code
            : error instanceof z.ZodError
              ? "INVALID_REQUEST"
              : "STORAGE_UNAVAILABLE";
      const status =
        error instanceof DeliverableError
          ? error.status
          : error instanceof HistoryAuthError
            ? error.code === "HISTORY_UNAVAILABLE"
              ? 503
              : error.code === "FORBIDDEN"
                ? 403
                : 401
            : error instanceof z.ZodError
              ? 400
              : 503;
      return Response.json({ error: { code } }, { status, headers });
    }
  }
  return {
    GET: (r: Request) => run(r, "list"),
    POST: (r: Request) => run(r, "create"),
    upload: (r: Request) => run(r, "upload"),
    confirm: (r: Request) => run(r, "confirm"),
    access: (r: Request) => run(r, "access"),
  };
}
