import { NextResponse, type NextRequest } from 'next/server';
import { pilotRoutePolicy } from './lib/pilot-route-policy';

const privacy = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
export function proxy(request: NextRequest) {
  if (process.env.BAZAAR_WORKSPACE_ADMISSION !== 'invite-only') return NextResponse.next();
  const action = pilotRoutePolicy(request.nextUrl.pathname, request.method);
  if (action === 'deny') return NextResponse.json({ error: { code: 'PILOT_ROUTE_DISABLED' } }, { status: 404, headers: privacy });
  if (action === 'redirect') {
    const destination = request.nextUrl.clone(); destination.pathname = '/pilot'; destination.search = '';
    const response = NextResponse.redirect(destination, 307);
    for (const [name, value] of Object.entries(privacy)) response.headers.set(name, value);
    return response;
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const publicCatalog = process.env.BAZAAR_ENABLE_MARKETPLACE === 'true' && (
      request.method === 'GET' && ['/api/discovery/resources','/api/discovery/search'].includes(request.nextUrl.pathname) ||
      request.method === 'OPTIONS' && request.nextUrl.pathname === '/api/discovery/search'
    );
    if (process.env.BAZAAR_ENABLE_OPEN_WORKSPACES !== 'true' && !(request.nextUrl.pathname === '/api/mcp' && request.method === 'GET')) {
      return NextResponse.json({ error: { code: 'WORKSPACE_UNAVAILABLE' } }, { status: 503, headers: privacy });
    }
    if (!publicCatalog && request.nextUrl.pathname !== '/api/mcp' && !/^Bearer [a-zA-Z0-9_-]{32,128}$/.test(request.headers.get('authorization') ?? '')) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401, headers: privacy });
    }
  }
  const response = NextResponse.next();
  if (!request.nextUrl.pathname.startsWith('/_next/static/')) for (const [name, value] of Object.entries(privacy)) response.headers.set(name, value);
  return response;
}
