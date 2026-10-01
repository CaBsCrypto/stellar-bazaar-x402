import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { readdirSync } from 'node:fs';

// Loaded by Node before the real Next CLI. It never imports route handlers or
// replaces configuredWorkspaceStore. All outbound network is the Redis relay;
// every incoming Next request must have passed the shared application proxy.
if (process.env.NODE_ENV !== 'production' || process.env.BAZAAR_NATIVE_NEXT_VALIDATION !== '1' || process.version !== 'v22.18.0') throw Error('NATIVE_VALIDATION_ENVIRONMENT_REQUIRED');
if (readdirSync(process.cwd()).some(name => /^\.env(?:\.|$)/i.test(name) && name.toLowerCase() !== '.env.example')) throw Error('ENV_FILES_FORBIDDEN');
const relay = new URL(process.env.BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN), proxySecret = process.env.BAZAAR_NATIVE_PROXY_SECRET;
if (relay.protocol !== 'http:' || relay.hostname !== '127.0.0.1' || !relay.port || relay.pathname !== '/' || relay.search || relay.hash || relay.username || relay.password || !proxySecret) throw Error('NATIVE_RELAY_REQUIRED');
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== relay.origin || !['/', '/native-rejection'].includes(url.pathname) || url.search || url.hash) throw Error('EXTERNAL_NETWORK_DISABLED');
  return nativeFetch(input, { ...init, redirect: 'error' });
};
for (const api of [http, https]) for (const name of ['request', 'get']) api[name] = () => { throw Error('EXTERNAL_NETWORK_DISABLED'); };
const nativeConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0], normalized = Array.isArray(first) ? first[0] : first;
  const options = normalized && typeof normalized === 'object' ? normalized : { port: normalized, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (options.path || String(options.port) !== relay.port || options.host !== '127.0.0.1') throw Error('EXTERNAL_NETWORK_DISABLED');
  return nativeConnect.apply(this, args);
};
const nativeCreateServer = http.createServer;
http.createServer = function (...args) {
  const listenerIndex = args.findIndex(arg => typeof arg === 'function');
  if (listenerIndex < 0) throw Error('NATIVE_REQUEST_LISTENER_REQUIRED');
  const listener = args[listenerIndex];
  args[listenerIndex] = async function (request, response) {
    if (request.headers['x-bazaar-native-proxy'] !== proxySecret) {
      let requestBytes = 0;
      try {
        for await (const chunk of request) { requestBytes += chunk.length; if (requestBytes > 65536) break; }
        await globalThis.fetch(new URL('/native-rejection', relay), { method: 'POST', headers: { authorization: 'Bearer isolated-loopback-only', 'content-type': 'application/json' }, body: JSON.stringify({ requestBytes }), signal: AbortSignal.timeout(5000) });
      } finally { response.destroy(); }
      return;
    }
    delete request.headers['x-bazaar-native-proxy']; return listener.call(this, request, response);
  };
  return nativeCreateServer.apply(this, args);
};
syncBuiltinESMExports();
