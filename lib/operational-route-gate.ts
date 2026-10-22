import {splitReadonlyIngress,splitHistoryQueryValid} from './split-ingress-policy.ts';
import { pilotRoutePolicy, publicBazaarApi } from './pilot-route-policy.ts';
import { workspacePublicOrigin } from './workspace-public-origin.ts';
import { publicOperationalMcpTools } from './operational-pressure.ts';
import { assertMarketGuardianCronRequest, trustedMarketGuardianDeploymentOrigin } from './market-guardian-cron.ts';
import { WorkspaceError } from './workspace-types.ts';
import {marketOperatorDiagnosticKind,marketDiagnosticOperatorMatches,marketDiagnosticBodyless} from './market-operator-diagnostic-origin.ts';
import {BAZAAR_INTEGRATION_TOOL,BAZAAR_INTEGRATION_RESOURCE_URI} from './bazaar-integration-contract.ts';
import {MARKET_RUNTIME_CONFIGURATION_PATH,marketRuntimeConfigurationRequestFailure} from './market-runtime-configuration-request.ts';

export type EarlyRouteResult = { code: string; status: number } | undefined;
export function routeBodyLimit(path: string) {
  if (['/api/account/wallet/challenge','/api/account/wallet/complete'].includes(path)) return 1024;
  if (path === '/api/mcp'||path==='/api/chatgpt/mcp') return 65536;
  if (path === '/api/workspaces' || /^\/api\/workspaces\/[^/]+\/access$/.test(path)) return 1024;
  if (path === '/api/market/operations-budget' || path === '/api/market/agent-permissions') return 8192;
  if (/^\/api\/market\/orders\/[^/]+\/x402$/.test(path)) return 65536;
  if (/^\/api\/market\/orders\/[^/]+$/.test(path)) return 18000;
  return 16384;
}
/** Runs before Redis. This is an exposure and format gate; native handlers authenticate. */
export function earlyRouteGate(request: Request): EarlyRouteResult {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if(path===MARKET_RUNTIME_CONFIGURATION_PATH)return marketRuntimeConfigurationRequestFailure(request,process.env);
  if (pilotRoutePolicy(path, method) === 'deny') return { code: 'PILOT_ROUTE_DISABLED', status: 404 };
  if (!path.startsWith('/api/')) return;
  const authorization = request.headers.get('authorization');
  if(path==='/api/chatgpt/mcp'&&authorization!==null)return {code:'INVALID_REQUEST',status:400};
  const publicApi = publicBazaarApi(path, method);
  if (authorization !== null && !/^Bearer [a-zA-Z0-9_-]{32,128}$/.test(authorization)) return { code: 'UNAUTHORIZED', status: 401 };
  if (!publicApi && path !== '/api/mcp' && !authorization) return { code: 'UNAUTHORIZED', status: 401 };
  if (!publicApi && path !== '/api/mcp' && process.env.BAZAAR_ENABLE_OPEN_WORKSPACES !== 'true') return { code: 'WORKSPACE_UNAVAILABLE', status: 503 };
  const operatorDiagnostic=!!marketOperatorDiagnosticKind(request);
  if(operatorDiagnostic&&!marketDiagnosticOperatorMatches(request))return {code:'UNAUTHORIZED',status:401};
  let expected: string | undefined;
  if(!operatorDiagnostic)try { expected = workspacePublicOrigin() ?? process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN; } catch { return { code: 'WORKSPACE_UNAVAILABLE', status: 503 }; }
  if (path === '/api/market/guardian/tick' && method === 'GET') {
    // A scheduler uses the immutable deployment hostname, without browser Origin.
    // Prove its existing operator credential before allowing that exact exception.
    try { assertMarketGuardianCronRequest(request); } catch (error) {
      return error instanceof WorkspaceError ? { code: error.code, status: error.status } : { code: 'INVALID_REQUEST', status: 400 };
    }
    if (!expected || url.origin !== expected && url.origin !== trustedMarketGuardianDeploymentOrigin()) return { code: 'INVALID_REQUEST', status: 400 };
    return;
  }
  const origin = request.headers.get('origin');
  if (!operatorDiagnostic&&(!expected || url.origin !== expected || origin && origin !== expected)) return { code: 'INVALID_REQUEST', status: 400 };
  if (url.search) {
    if(operatorDiagnostic){
      // Exact operator GET/path/query and cryptographic proof already checked.
      // Continue through the common size/body gates below, never return early.
    } else if(splitReadonlyIngress(path,method)?.action==='history'){
      if(!splitHistoryQueryValid(url.searchParams))return {code:'INVALID_REQUEST',status:400};
    } else if(path==='/api/activity'&&method==='GET') {
      const params=url.searchParams,allowed=['view','limit','cursor','taskId','agentId','from','to','status','operationId','download'];
      if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))return {code:'INVALID_REQUEST',status:400};
      const limit=params.get('limit');if(limit!==null&&(!/^[1-9]\d?$/.test(limit)||Number(limit)>20))return {code:'INVALID_REQUEST',status:400};
      for(const key of ['taskId','agentId','operationId']) {const value=params.get(key);if(value!==null&&!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value))return {code:'INVALID_REQUEST',status:400};}
      for(const key of ['from','to']) {const value=params.get(key);if(value!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))))return {code:'INVALID_REQUEST',status:400};}
      const cursor=params.get('cursor');if(cursor!==null&&!/^[a-zA-Z0-9_-]{1,1024}$/.test(cursor))return {code:'INVALID_REQUEST',status:400};
      if(params.has('view')&&!['tasks','events','operations'].includes(params.get('view')!)||params.has('status')&&!['active','completed','error','legacy'].includes(params.get('status')!)||params.has('download')&&(params.get('download')!=='1'||!params.has('operationId')))return {code:'INVALID_REQUEST',status:400};
    } else if (path === '/api/operations' && method === 'GET') {
      const params=url.searchParams;
      if([...params.keys()].some(key=>!['limit','cursor'].includes(key)||params.getAll(key).length!==1)) return {code:'INVALID_REQUEST',status:400};
      const limit=params.get('limit');if(limit!==null&&(!/^[1-9]\d?$/.test(limit)||Number(limit)>20))return {code:'INVALID_REQUEST',status:400};
      const cursor=params.get('cursor');if(cursor!==null&&(!/^[a-zA-Z0-9_-]{1,2048}$/.test(cursor)||Buffer.byteLength(cursor)>2048))return {code:'INVALID_REQUEST',status:400};
    } else if (path === '/api/market/review' && method === 'GET') {
      const params=url.searchParams;
      if([...params.keys()].some(key=>!['page','pageSize'].includes(key)||params.getAll(key).length!==1))return {code:'INVALID_REQUEST',status:400};
      for(const [key,maximum] of [['page',10000],['pageSize',20]] as const) {
        const value=params.get(key);
        if(value!==null&&(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>maximum))return {code:'INVALID_REQUEST',status:400};
      }
    } else if (['/api/market/catalog','/api/market/orders','/api/market/services'].includes(path) && method === 'GET') {
      const params=url.searchParams, allowed=path==='/api/market/services'?['limit','cursor','mineCursor']:path==='/api/market/catalog'?['limit','cursor','q']:['limit','cursor'];
      if ([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1)) return {code:'INVALID_REQUEST',status:400};
      const limit=params.get('limit'); if(limit!==null&&(!/^[1-9]\d?$/.test(limit)||Number(limit)>20)) return {code:'INVALID_REQUEST',status:400};
      const query=params.get('q');if(query!==null&&query.length>200)return {code:'INVALID_REQUEST',status:400};
      for(const key of ['cursor','mineCursor']) { const value=params.get(key); if(value!==null&&(!/^[a-zA-Z0-9_-]{1,512}$/.test(value)||Buffer.byteLength(value)>512)) return {code:'INVALID_REQUEST',status:400}; }
    } else if (!['/api/discovery/search', '/api/discovery/resources'].includes(path)) return { code: 'INVALID_REQUEST', status: 400 };
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d{1,10}$/.test(contentLength) || Number(contentLength) > routeBodyLimit(path))) return { code: 'REQUEST_TOO_LARGE', status: 413 };
  if(operatorDiagnostic&&!marketDiagnosticBodyless(request))return {code:'INVALID_REQUEST',status:400};
  if (['POST', 'PUT', 'PATCH'].includes(method) && request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return { code: 'INVALID_CONTENT_TYPE', status: 415 };
}

/** Unknown or dishonest Content-Length still cannot send an oversized body to auth Redis. */
export async function earlyBodyGate(request: Request): Promise<EarlyRouteResult> {
  if (request.method !== 'POST' || !new URL(request.url).pathname.startsWith('/api/')) return;
  const max = routeBodyLimit(new URL(request.url).pathname), reader = request.clone().body?.getReader();
  if (!reader) return { code: 'INVALID_REQUEST', status: 400 };
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > max) { void reader.cancel(); return { code: 'REQUEST_TOO_LARGE', status: 413 }; } chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { code: 'INVALID_REQUEST', status: 400 };
    if(new URL(request.url).pathname==='/api/chatgpt/mcp'){
      if(body.jsonrpc!=='2.0'||!['initialize','notifications/initialized','tools/list','tools/call','resources/list','resources/read'].includes(body.method))return {code:'INVALID_REQUEST',status:400};
      if(body.method==='tools/call'&&![BAZAAR_INTEGRATION_TOOL,'list_services','search_services','get_service'].includes(body.params?.name))return {code:'INVALID_REQUEST',status:400};
      if(body.method==='resources/read'&&body.params?.uri!==BAZAAR_INTEGRATION_RESOURCE_URI)return {code:'INVALID_REQUEST',status:400};
    }
    if (new URL(request.url).pathname === '/api/mcp' && body.method === 'tools/call' && typeof body.params?.name === 'string' &&
        !publicOperationalMcpTools.has(body.params.name) && !/^Bearer [a-zA-Z0-9_-]{32,128}$/.test(request.headers.get('authorization') ?? '')) return { code: 'UNAUTHORIZED', status: 401 };
  } catch { return { code: 'INVALID_REQUEST', status: 400 }; }
}
