import { pilotRoutePolicy, publicBazaarApi } from './pilot-route-policy.ts';
import { workspacePublicOrigin } from './workspace-public-origin.ts';
import { publicOperationalMcpTools } from './operational-pressure.ts';

export type EarlyRouteResult = { code: string; status: number } | undefined;
export function routeBodyLimit(path: string) {
  if (path === '/api/mcp') return 65536;
  if (path === '/api/workspaces' || /^\/api\/workspaces\/[^/]+\/access$/.test(path)) return 1024;
  if (path === '/api/market/operations-budget' || path === '/api/market/agent-permissions') return 8192;
  if (/^\/api\/market\/orders\/[^/]+\/x402$/.test(path)) return 65536;
  if (/^\/api\/market\/orders\/[^/]+$/.test(path)) return 18000;
  return 16384;
}
/** Runs before Redis. This is an exposure and format gate; native handlers authenticate. */
export function earlyRouteGate(request: Request): EarlyRouteResult {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (pilotRoutePolicy(path, method) === 'deny') return { code: 'PILOT_ROUTE_DISABLED', status: 404 };
  if (!path.startsWith('/api/')) return;
  const authorization = request.headers.get('authorization');
  const publicApi = publicBazaarApi(path, method);
  if (authorization !== null && !/^Bearer [a-zA-Z0-9_-]{32,128}$/.test(authorization)) return { code: 'UNAUTHORIZED', status: 401 };
  if (!publicApi && path !== '/api/mcp' && !authorization) return { code: 'UNAUTHORIZED', status: 401 };
  if (!publicApi && path !== '/api/mcp' && process.env.BAZAAR_ENABLE_OPEN_WORKSPACES !== 'true') return { code: 'WORKSPACE_UNAVAILABLE', status: 503 };
  let expected: string | undefined;
  try { expected = workspacePublicOrigin() ?? process.env.BAZAAR_WORKSPACE_LOCAL_ORIGIN; } catch { return { code: 'WORKSPACE_UNAVAILABLE', status: 503 }; }
  const origin = request.headers.get('origin');
  if (!expected || url.origin !== expected || origin && origin !== expected) return { code: 'INVALID_REQUEST', status: 400 };
  if (url.search) {
    if (['/api/market/catalog','/api/market/orders','/api/market/services'].includes(path) && method === 'GET') {
      const params=url.searchParams, allowed=path==='/api/market/services'?['limit','cursor','mineCursor']:['limit','cursor'];
      if ([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1)) return {code:'INVALID_REQUEST',status:400};
      const limit=params.get('limit'); if(limit!==null&&(!/^[1-9]\d?$/.test(limit)||Number(limit)>20)) return {code:'INVALID_REQUEST',status:400};
      for(const key of ['cursor','mineCursor']) { const value=params.get(key); if(value!==null&&(!/^[a-zA-Z0-9_-]{1,512}$/.test(value)||Buffer.byteLength(value)>512)) return {code:'INVALID_REQUEST',status:400}; }
    } else if (!['/api/discovery/search', '/api/discovery/resources'].includes(path)) return { code: 'INVALID_REQUEST', status: 400 };
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d{1,10}$/.test(contentLength) || Number(contentLength) > routeBodyLimit(path))) return { code: 'REQUEST_TOO_LARGE', status: 413 };
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
    if (new URL(request.url).pathname === '/api/mcp' && body.method === 'tools/call' && typeof body.params?.name === 'string' &&
        !publicOperationalMcpTools.has(body.params.name) && !/^Bearer [a-zA-Z0-9_-]{32,128}$/.test(request.headers.get('authorization') ?? '')) return { code: 'UNAUTHORIZED', status: 401 };
  } catch { return { code: 'INVALID_REQUEST', status: 400 }; }
}
