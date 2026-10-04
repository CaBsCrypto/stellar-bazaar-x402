// An exposure boundary, not authorization. Native handlers still verify owners.
export function pilotRoutePolicy(path: string, method: string): 'allow' | 'redirect' | 'deny' {
  if (process.env.BAZAAR_ENABLE_MARKETPLACE === 'true') {
    if (['GET','HEAD'].includes(method) && path === '/') return 'allow';
    if (['GET','HEAD'].includes(method) && path === '/MARKETPLACE_PILOT.md') return 'allow';
    if (['GET','HEAD'].includes(method) && ['/catalogo','/hub','/publish'].includes(path)) return 'allow';
    if (['GET','HEAD'].includes(method) && /^\/resources\/[a-z0-9-]+$/.test(path)) return 'allow';
    if (method === 'GET' && ['/api/discovery/resources','/api/discovery/search'].includes(path)) return 'allow';
    if (method === 'OPTIONS' && path === '/api/discovery/search') return 'allow';
    if (['GET','POST'].includes(method) && ['/api/market/services','/api/market/orders'].includes(path)) return 'allow';
    if (method === 'POST' && ['/api/market/review','/api/market/control'].includes(path)) return 'allow';
    if (/^\/api\/market\/(services|orders)\/[a-f0-9-]{36}$/i.test(path) && (method === 'POST' || method === 'GET' && path.startsWith('/api/market/orders/'))) return 'allow';
    if (['GET','HEAD'].includes(method) && /^\/(images|icons|fonts)\//.test(path)) return 'allow';
  }
  if ((method === 'GET' || method === 'HEAD') && path === '/') return 'redirect';
  if (method === 'GET' || method === 'HEAD') {
    if (['/pilot', '/history', '/agent-chat', '/favicon.ico'].includes(path) || path.startsWith('/_next/static/')) return 'allow';
  }
  if (path === '/api/mcp' && ['GET', 'POST', 'DELETE'].includes(method)) return 'allow';
  if (path === '/api/workspaces' && method === 'POST') return 'allow';
  if (/^\/api\/workspaces\/[a-f0-9-]{36}\/access$/i.test(path) && method === 'POST') return 'allow';
  if (['/api/operations', '/api/activity', '/api/conversations', '/api/agent-tasks'].includes(path) && ['GET', 'POST'].includes(method)) return 'allow';
  if (path === '/api/activity/connection' && method === 'POST') return 'allow';
  if (/^\/api\/conversations\/[a-f0-9-]{36}\/messages$/i.test(path) && ['GET', 'POST'].includes(method)) return 'allow';
  if (/^\/api\/agent-tasks\/[a-f0-9-]{36}\/response$/i.test(path) && method === 'POST') return 'allow';
  if (path === '/api/deliveries' && method === 'GET') return 'allow';
  return 'deny';
}
