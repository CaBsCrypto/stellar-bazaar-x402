import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export function originOnly(raw) {
  const u = new URL(raw);
  if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname))) || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('Invalid origin');
  return u.origin;
}
export async function withPrivateMcp(origin, token, action) {
  const endpoint = new URL('/api/mcp', originOnly(origin));
  const client = new Client({ name:'bazaar-private-terminal-example', version:'1' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (url, init) => {
      if (new URL(url instanceof Request ? url.url : String(url)).origin !== endpoint.origin) throw Error('Cross-origin request denied');
      return fetch(url, { ...init, redirect:'error' });
    },
  });
  try { await client.connect(transport); return await action(client); }
  finally { await client.close().catch(()=>{}); }
}
export function toolBody(response) {
  return response.structuredContent ?? JSON.parse(response.content.find(item=>item.type==='text').text);
}
