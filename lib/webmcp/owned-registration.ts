import type { ModelContextRegistry, WebMCPToolDefinition } from "./types";

// Internal adapter capability; not part of the browser WebMCP API.
export const removeOwnedTool = Symbol("removeOwnedTool");
export type OwnedRegistry = ModelContextRegistry & {
  [removeOwnedTool]?: (tool: WebMCPToolDefinition) => void;
};

// A mount owns only registrations which this mount completed successfully.
export function createOwnedRegistration(registry: OwnedRegistry) {
  const owned = new Map<string, WebMCPToolDefinition>();
  const dispose = () => {
    for (const [name, tool] of owned) {
      owned.delete(name);
      try {
        // A name can be reused by another mount after our registration.
        // Without a current identity match, removal is not ours to perform.
        if (registry[removeOwnedTool]) {
          registry[removeOwnedTool](tool);
        } else if (registry.getTools?.().find(current => current.name === name) === tool) {
          registry.unregisterTool?.(name);
        }
      } catch { /* Continue releasing this mount's other tools. */ }
    }
  };
  const scoped: ModelContextRegistry = {
    registerTool(tool: WebMCPToolDefinition) {
      if (registry.getTools?.().some(existing => existing.name === tool.name)) {
        throw new Error(`Tool already registered: ${tool.name}`);
      }
      registry.registerTool(tool);
      owned.set(tool.name, tool);
    },
  };
  return { registry: scoped, dispose };
}
