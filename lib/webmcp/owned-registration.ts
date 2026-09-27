import type { ModelContextRegistry, WebMCPToolDefinition } from "./types";

// A mount owns only registrations which this mount completed successfully.
export function createOwnedRegistration(registry: ModelContextRegistry) {
  const owned = new Set<string>();
  const dispose = () => {
    for (const name of [...owned]) {
      owned.delete(name);
      try { registry.unregisterTool?.(name); } catch { /* Continue releasing this mount's other tools. */ }
    }
  };
  const scoped: ModelContextRegistry = {
    registerTool(tool: WebMCPToolDefinition) {
      if (registry.getTools?.().some(existing => existing.name === tool.name)) {
        throw new Error(`Tool already registered: ${tool.name}`);
      }
      registry.registerTool(tool);
      owned.add(tool.name);
    },
  };
  return { registry: scoped, dispose };
}
