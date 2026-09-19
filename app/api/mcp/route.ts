import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createOnboardingMcpServer } from "@/lib/mcp-onboarding-server";
import { GET as readOperations } from "@/app/api/operations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  // Credential context belongs to one request; never share it between transports.
  const server = createOnboardingMcpServer(async () => {
    const response = await readOperations(new Request(new URL("/api/operations", request.url), {
      headers: { Authorization: request.headers.get("Authorization") ?? "" },
    }));
    return { ok: response.ok, body: await response.json() };
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
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
      "get_operation_history",
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
