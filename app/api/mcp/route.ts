import {z} from "zod";
import {randomUUID,createHash} from "node:crypto";
import {demoIngress,inheritDemoIngress} from "@/lib/demo-http";
import {demoEnabled} from "@/lib/demo-wallet";
import {configuredWorkspaceStore} from "@/lib/workspace-store";
import {authenticateWorkspaceRequest,assertWorkspaceRequest,workspaceFailure} from "@/lib/workspace-http";
import { measuredHandler } from '../../../lib/acceptance-meter.ts';
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createOnboardingMcpServer } from "@/lib/mcp-onboarding-server";
import { GET as readOperations } from "@/app/api/operations/route";
import { providerMcpContext } from "@/lib/mcp-provider-context";
import { readBoundedSubmission } from "@/lib/provider-submission-http";
import { MCP_MODE, MCP_TOOLS, MCP_VERSION, MCP_WRITES } from "@/lib/mcp-tool-contract";
import { workspaceMcpContext } from "@/lib/mcp-workspace-context";
import { workspaceHeaders } from "@/lib/workspace-http";
import {isBazaarIntegrationRequest} from '@/lib/bazaar-integration-mcp.ts';
import {BAZAAR_INTEGRATION_RESOURCE_URI} from '@/lib/bazaar-integration-contract.ts';
import {isCompactWorkspaceTransport} from '@/lib/quota-registry-patch.ts';
import {WorkspaceError} from '@/lib/workspace-types.ts';

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
    const response = await readOperations(inheritDemoIngress(request,new Request(new URL("/api/operations", request.url), {
      headers: historyHeaders,
    })));
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

function requestsEventStreamOnly(accept: string | null) {
  const ranges = (accept ?? "").split(",").map((range) => {
    const [mediaType, ...parameters] = range.trim().toLowerCase().split(";");
    const qualityParameters = parameters.map((parameter) => parameter.trim()).filter((parameter) => /^q\s*=/.test(parameter));
    const rawQuality = qualityParameters[0]?.split("=")[1]?.trim();
    const quality = qualityParameters.length === 0 ? 1 : qualityParameters.length === 1 && /^[01](?:\.\d{0,3})?$/.test(rawQuality ?? "") && Number(rawQuality) <= 1 ? Number(rawQuality) : 0;
    return { mediaType: mediaType.trim(), quality };
  });
  const qualityFor = (mediaType: string) => Math.max(-1, ...ranges.filter((range) => range.mediaType === mediaType).map((range) => range.quality));
  // An explicit exclusion takes precedence over less specific JSON wildcards.
  const jsonQuality = ["application/json", "application/*", "*/*"].map(qualityFor).find((quality) => quality >= 0) ?? 0;
  return qualityFor("text/event-stream") > 0 && jsonQuality === 0;
}

async function handleGET(request: Request) {
  try {
    await demoIngress(request);
    // The stateless transport has no standalone SSE stream. The SDK treats 405
    // as an unsupported stream and continues using POST JSON-RPC requests.
    if (requestsEventStreamOnly(request.headers.get("accept"))) {
      return new Response(null, { status: 405, headers: { ...workspaceHeaders, Allow: "POST" } });
    }
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
      integration:'/api/integration',
      integrationResource:BAZAAR_INTEGRATION_RESOURCE_URI,
      integrationGuide:'/INTEGRATION.md',
    }, { headers: workspaceHeaders });
  } catch (error) {
    return workspaceFailure(error);
  }
}

function handleDELETE() {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}

const measuredPOST = measuredHandler(handlePOST);
const staticProtocolMethods=new Set(['initialize','notifications/initialized','tools/list']);
/** Static SDK metadata grants no account access. Only the explicitly bounded
 * compact deployment skips ingress; every tool callback keeps native guards. */
function compactStaticProtocol(rpc:unknown){
  return process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&['compact-registry-v1','compact-registry-v2'].includes(process.env.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE??'')&&
    rpc!==null&&typeof rpc==='object'&&!Array.isArray(rpc)&&'method' in rpc&&typeof rpc.method==='string'&&staticProtocolMethods.has(rpc.method)&&
    isCompactWorkspaceTransport();
}
export async function POST(request:Request){
  // Static integration documentation is independent of storage availability,
  // private history and financial ingress. All other calls retain native guards.
  let rpc:unknown;try{rpc=await readBoundedSubmission(request.clone(),64*1024);}catch{return measuredPOST(request);}
  let staticProtocol=false;try{staticProtocol=compactStaticProtocol(rpc);if(staticProtocol){assertWorkspaceRequest(request,true);if(Buffer.byteLength(request.url)+Buffer.byteLength(JSON.stringify([...request.headers]))>32*1024)throw new WorkspaceError('CONTINUOUS_CONTROL_TRANSPORT_BUDGET',503,60);}}catch(error){return workspaceFailure(error);}
  if(!isBazaarIntegrationRequest(rpc)&&!staticProtocol)return measuredPOST(request);
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  const server=createOnboardingMcpServer(undefined,undefined,undefined,request);
  await server.connect(transport);const response=await transport.handleRequest(request);
  for(const[name,value]of Object.entries(workspaceHeaders))response.headers.set(name,value);
  if(staticProtocol){
    if(Buffer.byteLength(JSON.stringify([...response.headers]))>32*1024)return workspaceFailure(new WorkspaceError('CONTINUOUS_CONTROL_TRANSPORT_BUDGET',503,60));
    const reader=response.clone().body?.getReader();let bytes=0;
    if(reader)try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>128*1024){void reader.cancel();return workspaceFailure(new WorkspaceError('CONTINUOUS_CONTROL_TRANSPORT_BUDGET',503,60));}}}finally{reader.releaseLock();}
  }
  return response;
}

export const GET = measuredHandler(handleGET);

export const DELETE = measuredHandler(handleDELETE);
