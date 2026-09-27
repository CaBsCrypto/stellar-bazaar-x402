import type { ModelContextRegistry, WebMCPToolDefinition, WebMCPActivityLog } from "./types.ts";

export const initWebMCPPolyfill = initWebMCP;

const activityLogs: WebMCPActivityLog[] = [];
const browserRegistries = new WeakMap<object, ModelContextRegistry>();
const nativeSnapshots = new WeakMap<object, WebMCPToolDefinition[]>();

function nativeToolList(value: unknown): WebMCPToolDefinition[] {
  const list = Array.isArray(value) ? value : value && typeof value === "object" && "tools" in value ? value.tools : undefined;
  if (!Array.isArray(list) || list.some(tool => !tool || typeof tool.name !== "string")) {
    throw new Error("Unsupported native WebMCP tool list");
  }
  return list;
}

function readNativeTools(context: ModelContextRegistry): WebMCPToolDefinition[] {
  if (!context.getTools) return [];
  const result: unknown = context.getTools();
  if (result && typeof result === "object" && "then" in result) {
    // The browser provider awaits discovery before any registration. Do not
    // interpret an unresolved list as an empty registry.
    void Promise.resolve(result).catch(() => undefined);
    const snapshot = nativeSnapshots.get(context);
    if (!snapshot) throw new Error("Native WebMCP discovery requires asynchronous initialization");
    return snapshot;
  }
  const tools = nativeToolList(result);
  nativeSnapshots.set(context, tools);
  return tools;
}

export async function initWebMCPAsync(): Promise<ModelContextRegistry> {
  if (typeof window !== "undefined") {
    const context = navigator.modelContext ?? document.modelContext;
    if (context?.getTools) nativeSnapshots.set(context, nativeToolList(await context.getTools()));
  }
  return initWebMCP();
}

export function recordWebMCPActivity(log: WebMCPActivityLog) {
  activityLogs.unshift(log);
  if (activityLogs.length > 50) {
    activityLogs.pop();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("webmcp-activity", { detail: log }));
    window.__WEBMCP_EMULATOR__?.onActivityLog?.(log);
  }
}

class WebMCPPolyfill implements ModelContextRegistry {
  private tools = new Map<string, WebMCPToolDefinition>();

  constructor() {
    if (typeof window !== "undefined") {
      window.__WEBMCP_EMULATOR__ = {
        tools: this.tools,
        executeTool: async (name: string, input: Record<string, unknown>) => {
          const tool = this.tools.get(name);
          if (!tool) {
            const errLog: WebMCPActivityLog = {
              id: "act_" + Math.random().toString(36).slice(2, 9),
              timestamp: new Date().toISOString(),
              toolName: name,
              input,
              durationMs: 0,
              status: "error",
              error: `Tool '${name}' not found.`,
            };
            recordWebMCPActivity(errLog);
            throw new Error(`[WebMCP Polyfill] Tool '${name}' not found.`);
          }

          const start = performance.now();
          try {
            const result = await tool.execute(input);
            const durationMs = Math.round(performance.now() - start);
            const log: WebMCPActivityLog = {
              id: "act_" + Math.random().toString(36).slice(2, 9),
              timestamp: new Date().toISOString(),
              toolName: name,
              input,
              output: result,
              durationMs,
              status: "success",
            };
            recordWebMCPActivity(log);
            return result;
          } catch (err: unknown) {
            const durationMs = Math.round(performance.now() - start);
            const errorMessage = err instanceof Error ? err.message : String(err);
            const log: WebMCPActivityLog = {
              id: "act_" + Math.random().toString(36).slice(2, 9),
              timestamp: new Date().toISOString(),
              toolName: name,
              input,
              durationMs,
              status: "error",
              error: errorMessage,
            };
            recordWebMCPActivity(log);
            throw err;
          }
        },
        listTools: () => {
          return Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));
        },
        getActivityLogs: () => [...activityLogs],
      };
    }
  }

  registerTool(tool: WebMCPToolDefinition): void {
    if (!tool || !tool.name || typeof tool.execute !== "function") {
      console.error("[WebMCP Polyfill] Invalid tool definition:", tool);
      return;
    }
    this.tools.set(tool.name, tool);
    console.info(`[WebMCP] 🛠️ Registered tool: ${tool.name}`);
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  getTools(): WebMCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  provideContext(context: { tools?: WebMCPToolDefinition[] }): void {
    if (context?.tools && Array.isArray(context.tools)) {
      this.tools.clear();
      for (const tool of context.tools) {
        this.registerTool(tool);
      }
    }
  }
}

/**
 * Initializes the WebMCP environment. If the native browser API (
 * navigator.modelContext or document.modelContext) is present, it will be used.
 * Otherwise, installs a polyfill and attaches debugging/emulation helpers to window.__WEBMCP_EMULATOR__.
 */
export function initWebMCP(): ModelContextRegistry {
  if (typeof window === "undefined") {
    return new WebMCPPolyfill();
  }
  const existingRegistry = browserRegistries.get(window);
  if (existingRegistry) return existingRegistry;

  // Always create emulator instance to back UI simulation and logging
  const polyfill = new WebMCPPolyfill();

  const nativeContext = navigator.modelContext ?? document.modelContext;
  if (nativeContext && typeof nativeContext.registerTool === "function") {
    const owned = new Map<string, WebMCPToolDefinition>();
    const registry: ModelContextRegistry = {
      registerTool: (tool) => {
        if (!tool?.name || typeof tool.execute !== "function") throw new Error("Invalid WebMCP tool definition");
        if (owned.has(tool.name) || readNativeTools(nativeContext).some(existing => existing.name === tool.name)) {
          throw new Error(`Tool already registered: ${tool.name}`);
        }
        // A rejected native registration must never appear in the emulator.
        nativeContext.registerTool(tool);
        owned.set(tool.name, tool);
        polyfill.registerTool(tool);
      },
      unregisterTool: (name) => {
        const ownTool = owned.get(name);
        if (!ownTool) return false;
        const current = readNativeTools(nativeContext).find(tool => tool.name === name);
        const replaced = current && typeof current.execute === "function" && current.execute !== ownTool.execute;
        if (!replaced && nativeContext.unregisterTool) nativeContext.unregisterTool(name);
        owned.delete(name);
        polyfill.unregisterTool(name);
        return !replaced;
      },
      getTools: () => {
        const combined = new Map(readNativeTools(nativeContext).map(tool => [tool.name, tool]));
        for (const tool of polyfill.getTools()) combined.set(tool.name, tool);
        return [...combined.values()];
      },
      // Context replacement may only replace this wrapper's own tools.
      provideContext: (ctx) => {
        for (const name of [...owned.keys()]) registry.unregisterTool?.(name);
        for (const tool of ctx.tools ?? []) registry.registerTool(tool);
      },
    };
    browserRegistries.set(window, registry);
    return registry;
  }

  if (!window.modelContext) {
    window.modelContext = polyfill;
    try {
      Object.defineProperty(navigator, "modelContext", {
        value: polyfill,
        configurable: true,
        writable: true,
      });
    } catch {
      // Ignored if navigator is read-only
    }
    console.info("[WebMCP] Polyfill initialized on window.modelContext & navigator.modelContext");
  }

  browserRegistries.set(window, window.modelContext);
  return window.modelContext;
}
