import { ModelContextRegistry, WebMCPToolDefinition } from "./types";
import { services } from "../catalog";
import { rankServices, validateServiceCard } from "../discovery";
import { workflowBundles } from "../workflow-bundles";
import type { ServiceCard } from "../types";

/**
 * Registers all Stellar Bazaar tools to the active ModelContext registry (native or polyfilled).
 */
export function registerBazaarTools(registry: ModelContextRegistry): void {
  // 1. Search Services Tool
  const searchServicesTool: WebMCPToolDefinition<{ query?: string; tag?: string; maxPrice?: number }> = {
    name: "bazaar_search_services",
    description: "Search and rank available paid and free AI services in Stellar Bazaar by query keywords, category tag, or max budget.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string (e.g. 'finance', 'nlp', 'image')" },
        tag: { type: "string", description: "Filter by tag or category (e.g. 'data', 'finance', 'ai')" },
        maxPrice: { type: "number", description: "Maximum price filter in USD/XLM" },
      },
    },
    execute: async (input) => {
      const searchParam = input.query || input.tag || "";
      let ranked = rankServices(services, searchParam);

      if (input.tag) {
        ranked = ranked.filter((r) => r.service.tags.includes(input.tag!));
      }
      if (input.maxPrice !== undefined) {
        ranked = ranked.filter((r) => Number(r.service.payment.amount) <= input.maxPrice!);
      }

      return {
        type: "json",
        data: {
          total: ranked.length,
          services: ranked.map((r) => ({
            id: r.service.id,
            name: r.service.name,
            description: r.service.description,
            kind: r.service.kind,
            amount: r.service.payment.amount,
            asset: r.service.payment.asset,
            tags: r.service.tags,
            routeTemplate: r.service.routeTemplate,
            provider: r.service.provider,
            score: r.score,
            reasons: r.reasons,
          })),
        },
      };
    },
  };

  // 2. Get Service Details Tool
  const getServiceTool: WebMCPToolDefinition<{ serviceId: string }> = {
    name: "bazaar_get_service",
    description: "Get full technical details, input schema, pricing and payment requirements for a specific service ID.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "The unique service ID in Stellar Bazaar" },
      },
      required: ["serviceId"],
    },
    execute: async (input) => {
      const service = services.find((s) => s.id === input.serviceId);
      if (!service) {
        return {
          type: "json",
          isError: true,
          data: { error: `Service not found: ${input.serviceId}` },
        };
      }
      return {
        type: "json",
        data: service,
      };
    },
  };

  // 3. List Workflow Bundles Tool
  const listWorkflowBundlesTool: WebMCPToolDefinition = {
    name: "bazaar_list_workflow_bundles",
    description: "List all pre-composed autonomous multi-step workflow bundles available in the ecosystem.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      return {
        type: "json",
        data: {
          bundles: workflowBundles.map((b) => ({
            id: b.id,
            title: b.title,
            objective: b.objective,
            stagesCount: b.stages.length,
            aggregatePrice: b.aggregatePrice,
            status: b.status,
          })),
        },
      };
    },
  };

  // 4. Validate Service Card Tool
  const validateServiceCardTool: WebMCPToolDefinition<{ serviceCard: ServiceCard }> = {
    name: "bazaar_validate_service_card",
    description: "Validate if a custom JSON service card meets Stellar Bazaar standards and schema invariants.",
    inputSchema: {
      type: "object",
      properties: {
        serviceCard: {
          type: "object",
          description: "The complete service card JSON object to validate",
        },
      },
      required: ["serviceCard"],
    },
    execute: async (input) => {
      const validation = validateServiceCard(input.serviceCard);
      return {
        type: "json",
        data: validation,
      };
    },
  };

  // Register all tools
  registry.registerTool(searchServicesTool as WebMCPToolDefinition);
  registry.registerTool(getServiceTool as WebMCPToolDefinition);
  registry.registerTool(listWorkflowBundlesTool);
  registry.registerTool(validateServiceCardTool as unknown as WebMCPToolDefinition);
}
