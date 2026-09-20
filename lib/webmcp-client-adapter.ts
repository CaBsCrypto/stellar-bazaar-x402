import { initWebMCPPolyfill } from "./webmcp/polyfill.ts";
import { registerBazaarTools } from "./webmcp/register.ts";
import type { ModelContextRegistry, WebMCPToolDefinition, WebMCPActivityLog } from "./webmcp/types.ts";

export interface WebMCPClientConfig {
  autoRegister?: boolean;
  enableLogging?: boolean;
  onActivityLog?: (log: WebMCPActivityLog) => void;
}

export class WebMCPClientAdapter {
  private registry: ModelContextRegistry;
  private config: WebMCPClientConfig;
  private initialized = false;

  constructor(config: WebMCPClientConfig = {}) {
    this.config = config;
    this.registry = initWebMCPPolyfill();
  }

  /**
   * Initializes the WebMCP environment and registers Bazaar tools.
   */
  public init(): { registeredCount: number; tools: WebMCPToolDefinition[] } {
    if (this.initialized) {
      const tools = this.registry.getTools?.() ?? [];
      return { registeredCount: tools.length, tools };
    }

    if (typeof window !== "undefined" && this.config.onActivityLog) {
      if (window.__WEBMCP_EMULATOR__) {
        window.__WEBMCP_EMULATOR__.onActivityLog = this.config.onActivityLog;
      }
    }

    if (this.config.autoRegister !== false) {
      registerBazaarTools(this.registry);
    }

    this.initialized = true;
    const tools = this.registry.getTools?.() ?? [];
    return { registeredCount: tools.length, tools };
  }

  /**
   * Returns list of currently registered WebMCP tools.
   */
  public listTools(): WebMCPToolDefinition[] {
    this.init();
    return this.registry.getTools?.() ?? [];
  }

  /**
   * Executes a tool by name with input parameters.
   */
  public async executeTool(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
    this.init();
    const tools = this.listTools();
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`TOOL_NOT_FOUND: WebMCP tool "${name}" is not registered.`);
    }

    const start = Date.now();
    try {
      const result = await tool.execute(input);
      const durationMs = Date.now() - start;

      const log: WebMCPActivityLog = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        toolName: name,
        input,
        output: result,
        durationMs,
        status: "success",
      };

      this.config.onActivityLog?.(log);
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      const log: WebMCPActivityLog = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        toolName: name,
        input,
        durationMs,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };

      this.config.onActivityLog?.(log);
      throw err;
    }
  }
}
