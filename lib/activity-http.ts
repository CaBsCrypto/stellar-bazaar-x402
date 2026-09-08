import { createHash } from "node:crypto";
import {
  authenticateHistory,
  HistoryAuthError,
} from "./operation-history-auth.ts";
import {
  configuredHistoryStore,
  HistoryStoreError,
} from "./operation-history-store.ts";
import { configuredActivityStore } from "./activity-store.ts";
import { activitySchema, summarizeTasks } from "./activity.ts";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
function fail(code: string, status: number) {
  return Response.json({ error: { code } }, { status, headers });
}
function errorResponse(e: unknown) {
  return e instanceof HistoryAuthError
    ? fail(
        e.code,
        e.code === "HISTORY_UNAVAILABLE"
          ? 503
          : e.code === "FORBIDDEN"
            ? 403
            : 401,
      )
    : e instanceof HistoryStoreError
      ? fail(e.code, e.code === "HISTORY_UNAVAILABLE" ? 503 : 409)
      : fail("HISTORY_UNAVAILABLE", 503);
}
export function createActivityHandlers(
  deps: {
    authenticate?: typeof authenticateHistory;
    operations?: typeof configuredHistoryStore;
    events?: typeof configuredActivityStore;
  } = {},
) {
  const auth = deps.authenticate ?? authenticateHistory,
    operations = deps.operations ?? configuredHistoryStore,
    events = deps.events ?? configuredActivityStore;
  return {
    async GET(request: Request) {
      try {
        const principal = auth(request.headers.get("authorization"));
        const q = new URL(request.url).searchParams;
        if (
          [...q.keys()].some(
            (k) =>
              ![
                "view",
                "limit",
                "cursor",
                "taskId",
                "agentId",
                "from",
                "to",
                "status",
                "operationId",
                "download",
              ].includes(k),
          )
        )
          return fail("INVALID_QUERY", 400);
        const limit = Number(q.get("limit") ?? 20),
          view = q.get("view") ?? "tasks";
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100 ||
          !["tasks", "events", "operations"].includes(view)
        )
          return fail("INVALID_QUERY", 400);
        for (const key of ["taskId", "agentId", "operationId"])
          if (
            q.has(key) &&
            !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(q.get(key)!)
          )
            return fail("INVALID_QUERY", 400);
        for (const key of ["from", "to"])
          if (
            q.has(key) &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(q.get(key)!) ||
              !Number.isFinite(Date.parse(q.get(key)!)))
          )
            return fail("INVALID_QUERY", 400);
        if (
          q.has("status") &&
          !["active", "completed", "error", "legacy"].includes(q.get("status")!)
        )
          return fail("INVALID_QUERY", 400);
        if (q.has("download") && q.get("download") !== "1")
          return fail("INVALID_QUERY", 400);
        const scopeQuery = new URLSearchParams(q);
        scopeQuery.delete("cursor");
        scopeQuery.sort();
        const scope = createHash("sha256")
          .update(principal.ownerId + scopeQuery.toString())
          .digest("hex");
        let snapshot = new Date().toISOString(),
          offset = 0;
        let heads:
          | { event: string | null; operation: string | null }
          | undefined;
        if (q.has("cursor")) {
          try {
            const raw = q.get("cursor")!;
            if (raw.length > 1024) throw Error();
            const c = JSON.parse(Buffer.from(raw, "base64url").toString());
            if (
              c.scope !== scope ||
              !Number.isInteger(c.offset) ||
              c.offset < 0 ||
              c.offset > 11000 ||
              typeof c.snapshot !== "string" ||
              new Date(c.snapshot).toISOString() !== c.snapshot
            )
              throw Error();
            if (
              !c.heads ||
              ![c.heads.event, c.heads.operation].every(
                (v) => v === null || (typeof v === "string" && v.length <= 160),
              )
            )
              throw Error();
            snapshot = c.snapshot;
            offset = c.offset;
            heads = c.heads;
          } catch {
            return fail("INVALID_CURSOR", 400);
          }
        }
        const [allRecords, allEvents] = await Promise.all([
          operations().all(principal.ownerId),
          events().all(principal.ownerId),
        ]);
        if (q.get("download") === "1") {
          const record = allRecords.find((r) => r.id === q.get("operationId"));
          if (!record) return fail("NOT_FOUND", 404);
          const artifact = record.delivery.artifact;
          if (artifact?.kind === "external")
            return fail("PROVIDER_ACCESS_REQUIRED", 409);
          if (!artifact && record.delivery.result === undefined)
            return fail("RESULT_UNAVAILABLE", 404);
          const filename =
            artifact?.kind === "file" ? artifact.filename : "result.json";
          const bytes =
            artifact?.kind === "file"
              ? Buffer.from(artifact.base64, "base64")
              : Buffer.from(JSON.stringify(record.delivery.result, null, 2));
          return new Response(bytes, {
            headers: {
              ...headers,
              "Content-Type": "application/octet-stream",
              "Content-Disposition": 'attachment; filename="' + filename + '"',
              "Content-Security-Policy": "sandbox",
            },
          });
        }
        if (
          heads &&
          ((heads.event !== null &&
            !allEvents.some((e) => e.eventId === heads!.event)) ||
            (heads.operation !== null &&
              !allRecords.some((r) => r.id === heads!.operation)))
        )
          return fail("INVALID_CURSOR", 400);
        heads ??= {
          event: allEvents[0]?.eventId ?? null,
          operation: allRecords[0]?.id ?? null,
        };
        const records =
          heads.operation === null
            ? []
            : allRecords.slice(
                allRecords.findIndex((r) => r.id === heads!.operation),
              );
        const ev =
          heads.event === null
            ? []
            : allEvents.slice(
                allEvents.findIndex((e) => e.eventId === heads!.event),
              );
        const tasks = summarizeTasks(ev, records).filter(
          (t) =>
            (!q.has("agentId") || t.agentId === q.get("agentId")) &&
            (!q.has("status") || t.status === q.get("status")) &&
            (!q.has("from") || t.updatedAt.slice(0, 10) >= q.get("from")!) &&
            (!q.has("to") || t.updatedAt.slice(0, 10) <= q.get("to")!),
        );
        const ids = new Set(tasks.map((t) => t.id));
        const task = q.get("taskId");
        const items: unknown[] =
          view === "tasks"
            ? tasks.filter((t) => !task || t.id === task)
            : view === "events"
              ? ev
                  .filter(
                    (e) => ids.has(e.taskId) && (!task || e.taskId === task),
                  )
                  .reverse()
                  .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
              : records
                  .filter(
                    (r) =>
                      ids.has(r.taskId ?? "legacy:" + r.id) &&
                      (!task || (r.taskId ?? "legacy:" + r.id) === task),
                  )
                  .sort(
                    (a, b) =>
                      b.recordedAt.localeCompare(a.recordedAt) ||
                      a.id.localeCompare(b.id),
                  );
        const page = items.slice(offset, offset + limit).map((item) => {
          if (view !== "operations") return item;
          const r = item as (typeof records)[number];
          if (r.delivery.artifact?.kind !== "file") return r;
          return {
            ...r,
            delivery: {
              ...r.delivery,
              artifact: {
                kind: "file",
                filename: r.delivery.artifact.filename,
                mediaType: r.delivery.artifact.mediaType,
              },
            },
          };
        });
        const nextCursor =
          offset + limit < items.length
            ? Buffer.from(
                JSON.stringify({
                  scope,
                  snapshot,
                  heads,
                  offset: offset + limit,
                }),
              ).toString("base64url")
            : null;
        return Response.json(
          { version: "2", view, items: page, nextCursor, snapshot },
          { headers },
        );
      } catch (e) {
        return errorResponse(e);
      }
    },
    async POST(request: Request) {
      try {
        const url = new URL(request.url),
          origin = request.headers.get("origin");
        if ((origin && origin !== url.origin) || url.search)
          return fail("INVALID_REQUEST", 400);
        const principal = auth(request.headers.get("authorization"), true);
        if (
          request.headers.get("content-type")?.split(";")[0] !==
          "application/json"
        )
          return fail("INVALID_EVENT", 415);
        const reader = request.body?.getReader();
        if (!reader) return fail("INVALID_EVENT", 400);
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16384) {
            await reader.cancel();
            return fail("INVALID_EVENT", 413);
          }
          chunks.push(value);
        }
        let input;
        try {
          input = activitySchema.parse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          );
        } catch {
          return fail("INVALID_EVENT", 400);
        }
        const saved = await events().append(principal.ownerId, input);
        return Response.json(
          { version: "2", ...saved },
          { status: saved.created ? 201 : 200, headers },
        );
      } catch (e) {
        return errorResponse(e);
      }
    },
  };
}
