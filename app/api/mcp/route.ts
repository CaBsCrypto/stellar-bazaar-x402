import {z} from "zod";
import {randomUUID,createHash} from "node:crypto";
import {demoIngress} from "@/lib/demo-http";
import {demoEnabled} from "@/lib/demo-wallet";
import {configuredWorkspaceStore} from "@/lib/workspace-store";
import {authenticateWorkspaceRequest,workspaceFailure} from "@/lib/workspace-http";
import { measuredHandler } from '../../../lib/acceptance-meter.ts';
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

async function handlePOST(request: Request) {
  try {await demoIngress(request);} catch(e){return workspaceFailure(e);}
  try { await readBoundedSubmission(request.clone(), 64 * 1024); }
  catch (error) { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid or oversized MCP request" } }, { status: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, headers: workspaceHeaders }); }
  const queryTools=new Set(['get_bazaar_capabilities','list_services','search_services','get_service','list_workflow_bundles','get_workflow_bundle','get_bazaar_skills','list_market_services']);
  const rpc=await request.clone().json().catch(()=>null);
  let queryPrincipal;
  let queryRequestId:string|undefined;
  let queryWallet:string|undefined;
  const observe=demoEnabled()&&request.headers.has('authorization')&&rpc?.method==='tools/call'&&queryTools.has(rpc?.params?.name);
  if(observe){try{queryRequestId=z.string().uuid().parse(request.headers.get('x-bazaar-query-id')??randomUUID());queryPrincipal=await authenticateWorkspaceRequest(request);queryWallet=(await configuredWorkspaceStore().walletIdentity(queryPrincipal)).identity.wallet?.wallet;}catch(e){return workspaceFailure(e);}}
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
  }, providerMcpContext(request), workspaceMcpContext(request), request);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  if(queryPrincipal){try{
    const raw=await response.clone().text(),body=JSON.parse(raw),requestId=queryRequestId!,store=configuredWorkspaceStore();
    await store.forPrincipal(queryPrincipal).recordQuery(queryPrincipal.ownerId,{requestId,tool:rpc.params.name,agentId:queryPrincipal.agentId,...(queryWallet?{wallet:queryWallet}:{}),recordedAt:new Date().toISOString(),outcome:body.error||body.result?.isError?'error':'ok',inputHash:createHash('sha256').update(JSON.stringify(rpc.params)).digest('hex'),resultHash:createHash('sha256').update(raw).digest('hex'),evidence:'bazaar-observed'});
  }catch(e){return workspaceFailure(e);}}
  for (const [name, value] of Object.entries(workspaceHeaders)) response.headers.set(name, value);
  return response;
}

function handleGET() {
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

function handleDELETE() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}

export const POST = measuredHandler(handlePOST);

export const GET = measuredHandler(handleGET);

export const DELETE = measuredHandler(handleDELETE);
