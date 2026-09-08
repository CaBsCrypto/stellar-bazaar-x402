import { z } from "zod";
import { safeJson, type OperationHistoryRecord } from "./operation-history.ts";
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
export const activitySchema = z
  .object({
    eventId: id,
    taskId: id,
    agentId: id.optional(),
    operationId: id.optional(),
    mode: z.enum(["fixture", "mock", "testnet"]),
    kind: z.enum([
      "task-started",
      "search",
      "service-inspected",
      "service-selected",
      "request-started",
      "payment-reported",
      "delivery-reported",
      "task-completed",
      "error",
    ]),
    title: z.string().min(1).max(160),
    serviceId: id.optional(),
    result: z.unknown().optional(),
  })
  .strict()
  .refine(
    (value) =>
      safeJson(value) && JSON.stringify(value.result ?? null).length <= 8192,
    "Unsupported content",
  );
export type ActivityInput = z.infer<typeof activitySchema>;
export type ActivityEvent = ActivityInput & {
  recordedAt: string;
  evidence: "agent-reported";
};
export type TaskSummary = {
  id: string;
  title: string;
  agentId?: string;
  mode: string;
  updatedAt: string;
  status: "active" | "completed" | "error" | "legacy";
  steps: number;
  purchases: number;
};
export function summarizeTasks(
  events: ActivityEvent[],
  records: OperationHistoryRecord[],
): TaskSummary[] {
  const groups = new Map<
    string,
    { events: ActivityEvent[]; records: OperationHistoryRecord[] }
  >();
  const group = (id: string) => {
    if (!groups.has(id)) groups.set(id, { events: [], records: [] });
    return groups.get(id)!;
  };
  for (const e of events) group(e.taskId).events.push(e);
  for (const r of records) group(r.taskId ?? "legacy:" + r.id).records.push(r);
  return [...groups]
    .map(([id, g]) => {
      const ordered = g.events
        .toReversed()
        .toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      const last = ordered.at(-1);
      const first = ordered.find((e) => e.kind === "task-started");
      const purchase = g.records[0];
      return {
        id,
        title: first?.title ?? purchase?.service.title ?? last?.title ?? id,
        agentId: first?.agentId ?? last?.agentId ?? purchase?.agentId,
        mode:
          new Set([
            ...g.events.map((e) => e.mode),
            ...g.records.map((r) => r.mode),
          ]).size > 1
            ? "mixto"
            : (first?.mode ?? last?.mode ?? purchase?.mode ?? "mock"),
        updatedAt: [
          ...g.events.map((e) => e.recordedAt),
          ...g.records.map((r) => r.recordedAt),
        ]
          .sort()
          .at(-1)!,
        status: !last
          ? "legacy"
          : last.kind === "task-completed"
            ? "completed"
            : last.kind === "error"
              ? "error"
              : "active",
        steps: ordered.length,
        purchases: g.records.length,
      } as TaskSummary;
    })
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
}
