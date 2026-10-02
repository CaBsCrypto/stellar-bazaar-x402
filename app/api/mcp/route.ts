import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createOnboardingMcpServer } from "@/lib/mcp-onboarding-server";
import { GET as readOperations } from "@/app/api/operations/route";
import { providerMcpContext } from "@/lib/mcp-provider-context";
import { readBoundedSubmission } from "@/lib/provider-submission-http";
import { MCP_MODE, MCP_TOOLS, MCP_VERSION, MCP_WRITES } from "@/lib/mcp-tool-contract";
import { workspaceMcpContext } from "@/lib/mcp-workspace-context";
import { workspaceHeaders } from "@/lib/workspace-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { await readBoundedSubmission(request.clone(), 64 * 1024); }
  catch (error) { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid or oversized MCP request" } }, { status: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, headers: workspaceHeaders }); }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  // Credential context belongs to one request; never share it between transports.
  const server = createOnboardingMcpServer(async () => {
    const historyHeaders = new Headers();
    for (const name of ["authorization", "origin", "host", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "forwarded", "x-vercel-forwarded-for"]) {
      const value = request.headers.get(name); if (value !== null) historyHeaders.set(name, value);
    }
    const response = await readOperations(new Request(new URL("/api/operations", request.url), {
      headers: historyHeaders,
    }));
    const wait = response.headers.get("retry-after");
    return { ok: response.ok, status:response.status, body: await response.json(), ...(wait && /^\d+$/.test(wait) ? {retryAfter:Number(wait)} : {}) };
  }, providerMcpContext(request), workspaceMcpContext(request));
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  for (const [name, value] of Object.entries(workspaceHeaders)) response.headers.set(name, value);
  return response;
}

export function GET() {
  return Response.json({
    ok: true,
    name: "stellar-bazaar-discovery",
    version: MCP_VERSION,
    protocol: "MCP",
    transport: "streamable-http",
    mode: MCP_MODE,
    endpoint: "/api/mcp",
    tools: MCP_TOOLS,
    writes: MCP_WRITES,
    paidCall: false,
    signing: false,
    custody: false,
  });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}
