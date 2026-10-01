import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {withPrivateMcp} from '../examples/private-mcp-client.mjs';

// Actual installed SDK over loopback HTTP. No credentials, external service or payment.
const counts = {initialize: 0, notifications: 0, sse: 0, tools: 0, lostCall: 0};
const server = createServer(async (request, response) => {
  if (request.method === 'GET') {
    counts.sse++;
    response.writeHead(200, {'Content-Type': 'text/event-stream'});
    response.end(': synthetic successful EOF\n\n'); return;
  }
  let bytes = ''; for await (const chunk of request) bytes += chunk;
  const body = JSON.parse(bytes);
  if (body.method === 'notifications/initialized') {counts.notifications++; response.writeHead(202); response.end(); return;}
  if (body.method === 'tools/call') {counts.lostCall++; response.destroy(); return;}
  let result;
  if (body.method === 'initialize') {
    counts.initialize++; result = {protocolVersion: body.params.protocolVersion, capabilities: {tools: {}}, serverInfo: {name: 'synthetic-no-reconnect', version: '1'}};
  } else {
    assert.equal(body.method, 'tools/list'); counts.tools++;
    result = {tools: [{name: 'lost_call', description: 'Synthetic response loss', inputSchema: {type: 'object'}}]};
  }
  response.writeHead(200, {'Content-Type': 'application/json'});
  response.end(JSON.stringify({jsonrpc: '2.0', id: body.id, result}));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  await withPrivateMcp(origin, 'synthetic-access-for-transport-only', async client => {
    assert.equal((await client.listTools()).tools.length, 1);
    await assert.rejects(client.callTool({name: 'lost_call', arguments: {}}));
    // Keep the client open beyond the SDK's former 1-second default delay.
    await new Promise(ok => setTimeout(ok, 1700));
    assert.deepEqual(counts, {initialize: 1, notifications: 1, sse: 1, tools: 1, lostCall: 1});
  });
  console.log(JSON.stringify({ok: true, actualInstalledSdk: true, loopbackHttp: true, successfulSseEofRequests: counts.sse, lostPostRequests: counts.lostCall, automaticReconnects: 0, externalRequests: 0}));
} finally {await new Promise(ok => server.close(ok));}
