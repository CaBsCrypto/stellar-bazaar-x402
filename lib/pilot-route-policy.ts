// An exposure boundary, not authorization. Native handlers still verify owners.
export function routeBoundaryEnabled() {
  return process.env.BAZAAR_ROUTE_BOUNDARY === 'true' || process.env.BAZAAR_WORKSPACE_ADMISSION === 'invite-only';
}
export function pilotRedirectPath() {
  return process.env.BAZAAR_PUBLIC_DEMO === 'true' ? '/demo' : '/pilot';
}
export function publicBazaarApi(path: string, method: string) {
  return method === 'GET' && ['/api/discovery/resources', '/api/discovery/search', '/api/market/catalog'].includes(path) ||
    method === 'OPTIONS' && path === '/api/discovery/search' || path === '/api/mcp' && method === 'GET';
}
export function pilotRoutePolicy(path: string, method: string): 'allow' | 'redirect' | 'deny' {
  if (process.env.BAZAAR_PUBLIC_DEMO === 'true') {
    if (['GET','HEAD'].includes(method) && path === '/') return 'redirect';
    if (['GET','HEAD'].includes(method) && ['/DEMO_TESTNET.md','/AGENT_CONNECTION.md'].includes(path)) return 'allow';
    if (['GET','HEAD'].includes(method) && ['/demo','/storage','/demo-qr.svg','/bazaar-qr.svg'].includes(path)) return 'allow';
    if (method === 'GET' && ['/api/account/identity','/api/account/queries'].includes(path)) return 'allow';
    if (method === 'POST' && ['/api/account/wallet/challenge','/api/account/wallet/complete'].includes(path)) return 'allow';
  }
  if (process.env.BAZAAR_ENABLE_MARKETPLACE === 'true') {
    if (['/api/discovery/resources','/api/discovery/search'].includes(path)) return 'deny';
    if (['GET','HEAD'].includes(method) && path === '/') return 'allow';
    if (['GET','HEAD'].includes(method) && ['/MARKETPLACE_PILOT.md','/WORKSPACE_AGENT.md','/PROVIDER_ONBOARDING.md','/HISTORY_CONNECTION.md','/BUYER.md','/BUYER_AGENT_KIT.md','/SELLER_AGENT_KIT.md','/llms.txt','/mcp.json'].includes(path)) return 'allow';
    if (['GET','HEAD'].includes(method) && /^\/skills\/(buyer|seller|recovery)\/SKILL\.md$/.test(path)) return 'allow';
    if (['GET','HEAD'].includes(method) && ['/catalogo','/hub','/open','/publish'].includes(path)) return 'allow';
    if (['GET','HEAD'].includes(method) && /^\/resources\/[a-z0-9-]+$/.test(path)) return 'allow';
    if (method === 'GET' && ['/api/discovery/resources','/api/discovery/search','/api/market/catalog'].includes(path)) return 'allow';
    if (method === 'OPTIONS' && path === '/api/discovery/search') return 'allow';
    if (['GET','POST'].includes(method) && ['/api/market/services','/api/market/orders','/api/market/agent-permissions','/api/market/operations-budget'].includes(path)) return 'allow';
    if (method === 'POST' && path === '/api/market/capacity') return 'allow';
    if (method === 'POST' && /^\/api\/market\/orders\/[a-f0-9-]{36}\/x402$/i.test(path)) return 'allow';
    if (['GET','POST'].includes(method) && /^\/api\/market\/orders\/[a-f0-9-]{36}\/deliveries$/i.test(path)) return 'allow';
    if (method === 'POST' && /^\/api\/market\/orders\/[a-f0-9-]{36}\/deliveries\/confirm$/i.test(path)) return 'allow';
    if (['GET','POST'].includes(method) && path === '/api/market/guardian') return 'allow';
    if (method === 'GET' && path === '/api/market/guardian/tick') return 'allow';
    if (['GET','HEAD'].includes(method) && path === '/market-operations') return 'allow';
    if (method === 'POST' && ['/api/market/review','/api/market/control'].includes(path)) return 'allow';
    if (/^\/api\/market\/(services|orders)\/[a-f0-9-]{36}$/i.test(path) && ['POST','GET'].includes(method)) return 'allow';
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
