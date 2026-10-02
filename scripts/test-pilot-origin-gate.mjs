import assert from 'node:assert/strict';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createActivityHandlers } from '../lib/activity-http.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';

const names = ['BAZAAR_ENABLE_OPEN_WORKSPACES', 'BAZAAR_WORKSPACE_BACKEND', 'BAZAAR_WORKSPACE_PREFIX', 'BAZAAR_WORKSPACE_PUBLIC_ORIGIN', 'BAZAAR_WORKSPACE_ADMISSION'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
let authCalls = 0;
const authenticate = async () => { authCalls++; throw new Error('Unexpected authentication'); };
try {
  Object.assign(process.env, { BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: 'bazaar-workspace:pilot-' + 'a'.repeat(32), BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://pilot.example', BAZAAR_WORKSPACE_ADMISSION: 'invite-only' });
  const history = createHistoryHandlers({ authenticate });
  const activity = createActivityHandlers({ authenticate });
  const deliveries = createDeliverableHandlers({ auth: authenticate });
  for (const [handler, path] of [[history.GET, '/api/operations'], [history.POST, '/api/operations'], [activity.GET, '/api/activity'], [activity.POST, '/api/activity'], [deliveries.GET, '/api/deliveries']]) {
    for (const headers of [{}, { origin: 'https://pilot.example' }]) {
      const response = await handler(new Request('https://wrong.example' + path, { headers }));
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(authCalls, 0, 'URL authority must be rejected before credential resolution');
    }
  }
  delete process.env.BAZAAR_WORKSPACE_PUBLIC_ORIGIN;
  assert.equal((await history.GET(new Request('https://pilot.example/api/operations'))).status, 503);
  assert.equal(authCalls, 0, 'Missing pilot origin must fail closed before authentication');
  console.log(JSON.stringify({ ok: true, rejectedWrongAuthorityWithAndWithoutOrigin: true, authCalls, scope: 'history/activity/delivery pre-auth origin rejection', externalRequests: 0 }));
} finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
