// An exposure boundary, not authorization. Native handlers still verify owners.
export function pilotRoutePolicy(path: string, method: string): 'allow' | 'redirect' | 'deny' {
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
