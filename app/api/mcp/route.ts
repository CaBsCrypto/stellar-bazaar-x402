import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createOnboardingMcpServer } from "@/lib/mcp-onboarding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createOnboardingMcpServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export function GET() {
  return Response.json({
    ok: true,
    name: "stellar-bazaar-discovery",
    version: "0.4.0",
    protocol: "MCP",
    transport: "streamable-http",
    mode: "read-only",
    endpoint: "/api/mcp",
    tools: [
      "get_bazaar_capabilities",
      "list_services",
      "search_services",
      "get_service",
      "list_workflow_bundles",
      "get_workflow_bundle",
      "validate_service_card",
      "register_service",
      "update_service",
      "delete_service",
      "list_my_services",
    ],
    writes: ["register_service", "update_service", "delete_service", "list_my_services"],
    paidCall: false,
    signing: false,
    custody: false,
  });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}
