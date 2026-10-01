import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

assert.equal(process.version, 'v22.18.0');
let auditBytes = null, redisCalls = 0;
const relay = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  if (request.url === '/native-rejection') { assert.equal(request.headers.authorization, 'Bearer isolated-loopback-only'); auditBytes = JSON.parse(Buffer.concat(chunks).toString()).requestBytes; }
  else { assert.equal(request.url, '/'); redisCalls++; }
  response.end('{"recorded":true}');
});
await new Promise(done => relay.listen(0, '127.0.0.1', done)); const relayOrigin = 'http://127.0.0.1:' + relay.address().port;
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|PATHEXT|PROGRAMDATA)$/i.test(name)));
const program = `
  import assert from 'node:assert/strict';
  import http from 'node:http'; import net from 'node:net';
  await (await fetch(process.env.BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN, {method:'POST',body:'{}'})).arrayBuffer();
  assert.throws(() => fetch('https://external.invalid'), {message:'EXTERNAL_NETWORK_DISABLED'});
  assert.throws(() => http.request('http://external.invalid'), {message:'EXTERNAL_NETWORK_DISABLED'});
  assert.throws(() => net.connect({host:'external.invalid',port:443}), {message:'EXTERNAL_NETWORK_DISABLED'});
  const app = http.createServer((request,response) => response.end('native-route'));
  await new Promise(done => app.listen(0,'127.0.0.1',done));
  console.log(JSON.stringify({origin:'http://127.0.0.1:'+app.address().port,guarded:true}));
`;
const child = spawn(process.execPath, ['--import', new URL('./workspace-native-next-preload.mjs', import.meta.url).href, '--input-type=module', '--eval', program], { cwd: process.cwd(), env: { ...environment, NODE_ENV: 'production', BAZAAR_NATIVE_NEXT_VALIDATION: '1', BAZAAR_WORKSPACE_ISOLATED_RELAY_ORIGIN: relayOrigin, BAZAAR_NATIVE_PROXY_SECRET: 'synthetic-proxy-secret' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
try {
  const ready = await new Promise((done, reject) => {
    let data = ''; const timer = setTimeout(() => reject(Error('PRELOAD_TEST_TIMEOUT')), 5000);
    child.stdout.on('data', chunk => { data += chunk; if (data.includes('\n')) { clearTimeout(timer); done(JSON.parse(data.trim())); } });
    child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(Error('PRELOAD_TEST_EXIT_' + code + '_' + stderr)); });
  });
  assert.equal(ready.guarded, true); assert.equal(redisCalls, 1);
  const counted = await fetch(ready.origin + '/api/native', { headers: { 'x-bazaar-native-proxy': 'synthetic-proxy-secret' } }); assert.equal(await counted.text(), 'native-route');
  await assert.rejects(fetch(ready.origin + '/api/native', { method: 'POST', body: 'denied-direct-body' }));
  assert.equal(auditBytes, Buffer.byteLength('denied-direct-body')); assert.equal(redisCalls, 1);
} finally { if (child.exitCode === null) { const finished = new Promise(done => child.once('exit', done)); child.kill(); await finished; } relay.closeAllConnections(); await new Promise(done => relay.close(done)); }
console.log(JSON.stringify({ ok: true, category: 'local native preload transport doubles only', runtime: process.version, redisRelayFetchWorks: true, externalFetchHttpAndSocketBlockedBeforeConnect: true, nativeProxySecretRequired: true, directNativeAttemptBodyAudited: true, externalRequests: 0 }));
