import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createOnboardingMcpServer } from "@/lib/mcp-onboarding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let globalServerInstance: ReturnType<typeof createOnboardingMcpServer> | null = null;

function getSharedMcpServer() {
  if (!globalServerInstance) {
    globalServerInstance = createOnboardingMcpServer();
  }
  return globalServerInstance;
}

export async function POST(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = getSharedMcpServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export function GET() {
  return Response.json({
    ok: true,
    name: "stellar-bazaar-discovery",
    version: "0.5.0",
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
    ],
    writes: [],
    paidCall: false,
    signing: false,
    custody: false,
  });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}
