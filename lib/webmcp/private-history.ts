import type { ModelContextRegistry, WebMCPToolDefinition } from "./types";
import { registerBazaarTools } from "./register";
import { appendActivity } from "../activity-client";
import { historyConnection } from "../history-connection";
export function connectPrivateHistory(
  registry: ModelContextRegistry,
  options: {
    writeToken: string;
    agentId: string;
    taskId: string;
    taskTitle: string;
    baseUrl: string;
    onFailure?: () => void;
  },
) {
  let connected = true,
    finished = false,
    sequence = 0;
  const names: string[] = [];
  const report = async (
    kind:
      | "task-started"
      | "search"
      | "service-inspected"
      | "request-started"
      | "delivery-reported"
      | "task-completed"
      | "error",
    title: string,
    operationId?: string,
    result?: unknown,
  ) => {
    if (!connected) return;
    const status = await appendActivity(options.baseUrl, options, {
      eventId:
        String(Date.now()) +
        ":" +
        String(++sequence).padStart(8, "0") +
        ":" +
        crypto.randomUUID(),
      taskId: options.taskId,
      agentId: options.agentId,
      mode: "fixture",
      kind,
      title,
      operationId,
      ...(result !== undefined ? { result } : {}),
    });
    if (connected && status === "failed") options.onFailure?.();
    return status;
  };
  const started = report("task-started", options.taskTitle);
  const add = (tool: WebMCPToolDefinition) => {
    names.push(tool.name);
    registry.registerTool(tool);
  };
  const privateRegistry: ModelContextRegistry = {
    registerTool: (tool) =>
      add({
        ...tool,
        name: tool.name.replace("bazaar_", "bazaar_private_"),
        description:
          tool.description +
          " Private task connection; bounded reference behavior only.",
        execute: async (input) => {
          if (!connected || finished)
            return {
              isError: true,
              text: "Private connection closed or task finished",
            };
          await started;
          if (!connected)
            return { isError: true, text: "Private connection closed" };
          const operationId = crypto.randomUUID();
          await report(
            tool.name.includes("search") || tool.name.includes("list")
              ? "search"
              : tool.name.includes("execute")
                ? "request-started"
                : "service-inspected",
            tool.name,
            operationId,
          );
          try {
            // Existing tools dispatch public UI events. Suppress those in the private execution by using their explicit private registration option.
            if (!connected)
              return { isError: true, text: "Private connection closed" };
            const result = await tool.execute(input);
            if (!connected)
              return { isError: true, text: "Private connection closed" };
            const r = result as { isError?: boolean; data?: unknown };
            await report(
              r?.isError ? "error" : "delivery-reported",
              r?.isError ? "Herramienta con error" : "Respuesta recibida",
              operationId,
              tool.name.includes("execute") ? r.data : undefined,
            );
            return result;
          } catch {
            await report("error", "Herramienta interrumpida", operationId);
            return { isError: true, text: "Private tool failed" };
          }
        },
      }),
  };
  try {
    registerBazaarTools(privateRegistry, { privateExecution: true });
    add({
      name: "bazaar_private_connection",
      description: "Read private task connection instructions, no credentials.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () =>
        connected
          ? {
              data: {
                ...historyConnection,
                taskId: options.taskId,
                agentId: options.agentId,
              },
            }
          : { isError: true },
    });
    add({
      name: "bazaar_private_finish_task",
      description:
        "Mark this task complete after all its operations; performs no payment.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        if (!connected) return { isError: true };
        await started;
        if (!connected) return { isError: true };
        const status = await report("task-completed", "Tarea terminada");
        finished = true;
        return { data: { recorded: status === "recorded" } };
      },
    });
  } catch (error) {
    connected = false;
    for (const name of names) registry.unregisterTool?.(name);
    throw error;
  }
  return () => {
    connected = false;
    for (const name of names) registry.unregisterTool?.(name);
  };
}
