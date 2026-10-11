import { NextResponse, type NextRequest } from 'next/server.js';
import { pilotRoutePolicy, pilotRedirectPath, routeBoundaryEnabled } from './lib/pilot-route-policy.ts';
import { earlyRouteGate, earlyBodyGate } from './lib/operational-route-gate.ts';
import { measuredHandler } from './lib/acceptance-meter.ts';

const privacy = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
async function boundary(request: NextRequest) {
  if (!routeBoundaryEnabled()) return NextResponse.next();
  const action = pilotRoutePolicy(request.nextUrl.pathname, request.method);
  if (action === 'deny') return NextResponse.json({ error: { code: 'PILOT_ROUTE_DISABLED' } }, { status: 404, headers: privacy });
  if (action === 'redirect') {
    const destination = request.nextUrl.clone(); destination.pathname = pilotRedirectPath(); destination.search = '';
    const response = NextResponse.redirect(destination, 307);
    for (const [name, value] of Object.entries(privacy)) response.headers.set(name, value);
    return response;
  }
  const failure = earlyRouteGate(request) ?? await earlyBodyGate(request);
  if (failure) return NextResponse.json({ error: { code: failure.code } }, { status: failure.status, headers: privacy });
  const response = NextResponse.next();
  if (!request.nextUrl.pathname.startsWith('/_next/static/')) for (const [name, value] of Object.entries(privacy)) response.headers.set(name, value);
  return response;
}
// Proxy has no Redis calls and never reserves an API budget a second time.
export const proxy = measuredHandler(boundary, { source: 'proxy', budget: false });
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|images/|icons/|fonts/).*)'] };
