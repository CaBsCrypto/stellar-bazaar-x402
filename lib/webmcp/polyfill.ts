import { ModelContextRegistry, WebMCPToolDefinition } from "./types";

class WebMCPPolyfill implements ModelContextRegistry {
  private tools = new Map<string, WebMCPToolDefinition>();

  constructor() {
    if (typeof window !== "undefined") {
      window.__WEBMCP_EMULATOR__ = {
        tools: this.tools,
        executeTool: async (name: string, input: Record<string, unknown>) => {
          const tool = this.tools.get(name);
          if (!tool) {
            throw new Error(`[WebMCP Polyfill] Tool '${name}' not found.`);
          }
          return await tool.execute(input);
        },
        listTools: () => {
          return Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));
        },
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

  if (navigator.modelContext && typeof navigator.modelContext.registerTool === "function") {
    console.info("[WebMCP] Using native navigator.modelContext");
    return navigator.modelContext;
  }

  if (document.modelContext && typeof document.modelContext.registerTool === "function") {
    console.info("[WebMCP] Using native document.modelContext");
    return document.modelContext;
  }

  if (!window.modelContext) {
    const polyfill = new WebMCPPolyfill();
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

  return window.modelContext;
}
