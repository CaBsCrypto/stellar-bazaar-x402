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
    version: "0.2.0",
    protocol: "MCP",
    transport: "streamable-http",
    mode: "read-only",
    endpoint: "/api/mcp",
    tools: [
      "get_bazaar_capabilities",
      "list_services",
      "search_services",
      "get_service",
      "validate_service_card",
    ],
    paidCall: false,
    signing: false,
    custody: false,
  });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}
