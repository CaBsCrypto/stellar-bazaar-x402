import { services } from "@/lib/catalog";
import { workflowBundles } from "@/lib/workflow-bundles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const spec = {
    schemaVersion: "webmcp.specification/v1",
    specification: "W3C Web Machine Learning Community Group (Draft)",
    name: "stellar-bazaar-webmcp",
    title: "Stellar Bazaar x402 — Agentic Discovery & Micropayment WebMCP Protocol",
    description: "Standard W3C in-browser and HTTP context specification for discovering, executing, and publishing AI services with Stellar Testnet x402 micropayments.",
    version: "1.0.0",
    network: "stellar:testnet",
    license: "Apache-2.0",
    transport: {
      inBrowser: "navigator.modelContext / document.modelContext",
      httpStreamable: "/api/mcp",
      specManifest: "/api/webmcp/spec",
    },
    capabilities: {
      readOnlyDiscovery: true,
      x402Payments: true,
      dynamicRegistration: true,
      proofOfDelivery: true,
      agentPolicyGuard: true,
      supportedAssets: ["USDC", "XLM", "EURC"],
    },
    tools: [
      {
        name: "bazaar_list_services",
        description: "List all active AI agent services and tools available in Stellar Bazaar, with network, pricing, execution mode and category tags.",
        inputSchema: {
          type: "object",
          properties: {
            includePilots: { type: "boolean", description: "Whether to include pilot/experimental cards" },
          },
        },
      },
      {
        name: "bazaar_search_services",
        description: "Search, filter, and rank available AI services in Stellar Bazaar by query keywords, category tag, or max budget.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query string (e.g. 'finance', 'nlp', 'image')" },
            tag: { type: "string", description: "Filter by tag or category (e.g. 'data', 'finance', 'ai')" },
            maxPrice: { type: "number", description: "Maximum price filter in USD/XLM" },
          },
        },
      },
      {
        name: "bazaar_get_service",
        description: "Get full technical details, input schema, pricing and payment requirements for a specific service ID.",
        inputSchema: {
          type: "object",
          properties: {
            serviceId: { type: "string", description: "The unique service ID in Stellar Bazaar" },
          },
          required: ["serviceId"],
        },
      },
      {
        name: "bazaar_list_workflow_bundles",
        description: "List all pre-composed autonomous multi-step workflow bundles available in the ecosystem.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
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
      },
      {
        name: "bazaar_get_payment_flow",
        description: "Inspect the end-to-end x402 micropayment pipeline, on-chain receipts, escrow terms, and settlement stages for a service.",
        inputSchema: {
          type: "object",
          properties: {
            serviceId: { type: "string", description: "The service ID to audit payment terms for" },
          },
          required: ["serviceId"],
        },
      },
      {
        name: "bazaar_publish_service",
        description: "Publish and upload a new AI service or tool to the Stellar Bazaar marketplace registry directly from the agent.",
        inputSchema: {
          type: "object",
          properties: {
            serviceCard: {
              type: "object",
              description: "The complete ServiceCard v0 specification object for the new service",
            },
            providerKey: {
              type: "string",
              description: "Optional provider authentication/signing key for ownership management",
            },
          },
          required: ["serviceCard"],
        },
      },
      {
        name: "bazaar_execute_service",
        description: "Run an explicitly local reference fixture, or recover verified historical delivery evidence. Paid external calls require a buyer-controlled signer and are not initiated by this browser tool.",
        inputSchema: {
          type: "object",
          properties: {
            serviceId: { type: "string", description: "The service ID to execute (e.g. 'swap-risk-quote', 'script-creator')" },
            input: { type: "object", description: "The parameter payload matching the service card input schema" },
          },
          required: ["serviceId", "input"],
        },
      },
    ],
    catalogSummary: {
      totalServices: services.length,
      totalBundles: workflowBundles.length,
      sampleServiceIds: services.map((s) => s.id),
    },
  };

  return Response.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
