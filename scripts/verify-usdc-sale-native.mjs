import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {join, resolve, sep, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {Keypair, Networks, TransactionBuilder} from '@stellar/stellar-sdk';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {createGuionistaIntent, executeGuionistaIntent, failGuionistaIntent} from '../examples/guionista-marketplace-worker.mjs';

// Native production Next + Redis/Horizon protocol doubles, actual external worker
// and algorithmic provider route. No production credentials, DNS proof or funds.
const sha = value => createHash('sha256').update(value).digest('hex');
const limits = {api: 120, redis: 400, commandsUpperBound: 2400, storedBytes: 49164, outboundBytes: 16 * 1048576, inboundBytes: 32 * 1048576};
const directory = await mkdtemp(join(tmpdir(), 'bazaar-usdc-native-double-'));
const suffix = randomBytes(16).toString('hex');
const prefix = 'bazaar-market:pilot-' + suffix, wsPrefix = 'bazaar-workspace:pilot-' + suffix, reviewPrefix = 'bazaar-review:pilot-' + suffix;
const identities = Array.from({length: 2}, () => Object.fromEntries(['bootstrap', 'human', 'agent'].map(role => [role, randomBytes(32).toString('base64url')])));
const operator = randomBytes(32).toString('base64url'), providerToken = randomBytes(32).toString('base64url'), payer = Keypair.random(), destination = Keypair.random().publicKey();
const data = new Map(), indexes = new Map(), transactions = new Map(), sequences = new Map(), journal = [], serverMeter = [];
let child, client, failure, redisRequests = 0, redisCommandsUpperBound = 0, ledgerRequests = 0, ledgerSubmissions = 0, apiRequests = 0, pageRequests = 0;
let outboundBytes = 0, inboundBytes = 0, redisOutboundBytes = 0, redisInboundBytes = 0, externalOutboundBytes = 0, externalInboundBytes = 0, maximumStoredBytes = 0, providerRequests = 0, proofHttpRequests = 0;
const storeSource = await readFile('lib/workspace-store.ts', 'utf8');
const scripts = Object.fromEntries(['READ', 'COMMIT'].map(name => [name, storeSource.match(new RegExp(`export const ${name}_WORKSPACE_LUA = \x60([\\s\\S]*?)\x60;`))[1].replaceAll('\r\n', '\n')]));
function storage() {
  const bytes = [...data].reduce((sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(value), 0) + [...indexes].reduce((sum, [key, members]) => sum + Buffer.byteLength(key) + [...members].reduce((n, value) => n + Buffer.byteLength(value), 0), 0);
  maximumStoredBytes = Math.max(maximumStoredBytes, bytes); assert(bytes <= limits.storedBytes, 'Measured stored bytes exceeded acceptance limit'); return bytes;
}
function account(publicKey) {
  assert([payer.publicKey(), destination].includes(publicKey));
  return {account_id: publicKey, sequence: sequences.get(publicKey) ?? '0', subentry_count: 1, num_sponsoring: 0, num_sponsored: 0,
    balances: [{asset_type: 'native', balance: '1000', selling_liabilities: '0', buying_liabilities: '0'}, {asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_TESTNET_PAYMENT_IDENTITY.issuer, balance: '100', limit: '100000', is_authorized: true, selling_liabilities: '0', buying_liabilities: '0'}],
    thresholds: {med_threshold: 1}, signers: [{key: publicKey, type: 'ed25519_public_key', weight: 1}]};
}
const relay = createServer(async (req, res) => {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {size += chunk.length; assert(size <= 1048576); chunks.push(chunk);}
    const body = Buffer.concat(chunks).toString(); let result;
    if (req.url.startsWith('/horizon/')) {
      assert(++ledgerRequests <= 24); const path = req.url.slice('/horizon'.length);
      if (path.startsWith('/accounts/')) result = account(path.split('/').at(-1));
      else if (path.startsWith('/ledgers?')) result = {_embedded: {records: [{base_reserve_in_stroops: 5000000}]}};
      else if (path === '/transactions' && req.method === 'POST') {
        assert(++ledgerSubmissions <= 2); const tx = TransactionBuilder.fromXDR(new URLSearchParams(body).get('tx'), Networks.TESTNET), hash = tx.hash().toString('hex');
        assert.equal(tx.sequence, String(BigInt(sequences.get(tx.source) ?? '0') + 1n)); assert(!transactions.has(hash));
        assert.equal(tx.operations[0].asset.code, 'USDC'); assert.equal(tx.operations[0].asset.issuer, USDC_TESTNET_PAYMENT_IDENTITY.issuer); assert.equal(tx.operations[0].destination, destination);
        sequences.set(tx.source, tx.sequence); transactions.set(hash, {hash, successful: true, envelope_xdr: tx.toXDR()}); result = {hash};
      } else {result = transactions.get(path.split('/').at(-1)); assert(result);}
      const reply=JSON.stringify(result); externalOutboundBytes+=Buffer.byteLength(body); externalInboundBytes+=Buffer.byteLength(reply);
      res.writeHead(200, {'content-type': 'application/json'}); res.end(reply); return;
    }
    assert.equal(req.headers.authorization, 'Bearer local-double-only'); assert(++redisRequests <= limits.redis);
    const command = JSON.parse(body), name = command[0]; redisOutboundBytes += Buffer.byteLength(body);
    if (name === 'get') {redisCommandsUpperBound++; result = data.get(command[1]) ?? null;}
    else if (name === 'smembers') {redisCommandsUpperBound++; result = [...(indexes.get(command[1]) ?? [])];}
    else if (name === 'mget') {redisCommandsUpperBound++; result = command.slice(1).map(key => data.get(key) ?? null);}
    else {
      assert.equal(name, 'eval'); const script = command[1], count = Number(command[2]), keys = command.slice(3, 3 + count), args = command.slice(3 + count);
      assert(keys.every(key => [prefix, wsPrefix, reviewPrefix].some(p => key.startsWith(p + ':'))));
      assert(!/\b(for|while|repeat)\b/.test(script)); redisCommandsUpperBound += 1 + (script.match(/redis\.call\s*\(/g)?.length ?? 0);
      if (script === scripts.READ) result = keys.map(key => data.get(key) ?? '');
      else if (script === scripts.COMMIT) {
        result = keys.some((key, i) => (data.get(key) ?? '') !== args[i]) ? 0 : 1;
        if (result) {data.set(keys[0], args[3]); if (args[4]) data.set(keys[1], args[4]); data.set(keys[2], 'workspace-v1');}
      } else if (script.includes("redis.call('EXISTS'")) {
        result = data.has(keys[0]) ? 0 : 1;
        if (result) {data.set(keys[0], args[0]); const members = indexes.get(keys[1]) ?? new Set(); members.add(args[1]); indexes.set(keys[1], members);}
      } else if (script.includes('card.withdrawn=true')) {
        const value = data.get(keys[0]); result = value ? 1 : 0; if (value) data.set(keys[0], JSON.stringify({...JSON.parse(value), withdrawn: true}));
      } else {
        const old = data.get(keys[0]); result = (args[0] === 'missing' ? old !== undefined : old !== args[1]) ? 0 : 1; if (result) data.set(keys[0], args[2]);
      }
      storage();
    }
    assert(redisCommandsUpperBound <= limits.commandsUpperBound);
    const reply = JSON.stringify({result}); redisInboundBytes += Buffer.byteLength(reply);
    res.writeHead(200, {'content-type': 'application/json'}); res.end(reply);
  } catch {failure = 'DOUBLE_REJECTED'; res.writeHead(503); res.end('{"error":"DOUBLE_REJECTED"}');}
});
await new Promise(done => relay.listen(0, '127.0.0.1', done)); const relayOrigin = 'http://127.0.0.1:' + relay.address().port;
const {default: express} = await import(pathToFileURL(resolve('../provider-guionista-recovered/node_modules/express/index.js')).href);
const {registerMarketplaceTextRoutes} = await import(pathToFileURL(resolve('../provider-guionista-recovered/dist/src/marketplace-routes.js')).href);
const priorProviderEnv = {enabled: process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED, token: process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256, proof:process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF};
process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED = 'true'; process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256 = sha(providerToken);
const providerApp = express(); providerApp.use((req, _res, next) => {
  if(req.method==='GET'&&req.path==='/.well-known/stellar-bazaar-provider.txt')assert(++proofHttpRequests<=1);
  else{assert.equal(req.method, 'POST'); assert.equal(req.path, '/v1/marketplace-text'); assert(++providerRequests <= 1);}next();
}); registerMarketplaceTextRoutes(providerApp);
const providerServer = providerApp.listen(0, '127.0.0.1'); await new Promise(done => providerServer.once('listening', done));
const providerOrigin = 'https://provider.example.com', providerLocalOrigin = 'http://127.0.0.1:' + providerServer.address().port;
const adapter = join(directory, 'adapter.mjs');
await writeFile(adapter, `import dns from 'node:dns/promises';import https from 'node:https';import http from 'node:http';import{syncBuiltinESMExports}from'node:module';
dns.lookup=async hostname=>{if(hostname!=='provider.example.com')throw Error('EXTERNAL_DNS_DISABLED');return[{address:'8.8.8.8',family:4}];};
https.request=(options,callback)=>{if(options.hostname!=='provider.example.com'||options.path!=='/.well-known/stellar-bazaar-provider.txt'||options.method!=='GET')throw Error('EXTERNAL_HTTPS_DISABLED');return http.request({hostname:'127.0.0.1',port:${providerServer.address().port},path:options.path,method:'GET',headers:options.headers},callback);};syncBuiltinESMExports();
const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(u.origin==='https://redis-double.invalid')return original(${JSON.stringify(relayOrigin)}+u.pathname,init);if(u.origin==='https://horizon-testnet.stellar.org')return original(${JSON.stringify(relayOrigin)}+'/horizon'+u.pathname+u.search,init);throw Error('EXTERNAL_FETCH_DISABLED');};`);
const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--import=' + pathToFileURL(adapter).href,
  BAZAAR_ACCEPTANCE_METER: 'true', BAZAAR_ACCEPTANCE_SALE: 'true', BAZAAR_ACCEPTANCE_CATALOG_CARD_ID:'native-guionista-usdc-text', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: wsPrefix, BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://pilot.example', BAZAAR_WORKSPACE_ADMISSION: 'invite-only', BAZAAR_WORKSPACE_INVITE_HASHES_JSON: JSON.stringify(identities.map(v => sha(v.bootstrap))), BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE: '120', BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY: '1000', BAZAAR_WORKSPACE_REDIS_REST_URL: 'https://redis-double.invalid', BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'local-double-only',
  BAZAAR_ENABLE_MARKETPLACE: 'true', BAZAAR_ENABLE_MARKET_PURCHASES: 'true', BAZAAR_MARKET_PREFIX: prefix, BAZAAR_DYNAMIC_PREFIX: prefix + ':catalog', BAZAAR_MARKET_REVIEW_SECRET: randomBytes(32).toString('hex'), BAZAAR_MARKET_OPERATOR_HASH: sha(operator), BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'true', BAZAAR_PROVIDER_REVIEW_BACKEND: 'redis', BAZAAR_REVIEW_PREFIX: reviewPrefix, BAZAAR_REVIEW_REDIS_REST_URL: 'https://redis-double.invalid', BAZAAR_REVIEW_REDIS_REST_TOKEN: 'local-double-only', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'true', X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false'});
const port = 3292, origin = 'http://127.0.0.1:' + port;
const server = join(directory, 'server.mjs'); await writeFile(server, `import next from ${JSON.stringify(pathToFileURL(resolve('node_modules/next/dist/server/next.js')).href)};import{createServer}from'node:http';const app=next({dev:false,dir:${JSON.stringify(process.cwd())},hostname:'pilot.example',port:443});await app.prepare();createServer(app.getRequestHandler()).listen(${port},'127.0.0.1',()=>console.log('Ready'));`);
async function start() {
  child = spawn(process.execPath, [server], {env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}); let logs = '', partial = '';
  child.stdout.on('data', chunk => {logs += chunk; partial += chunk; const lines = partial.split('\n'); partial = lines.pop(); for (const line of lines) {const position = line.indexOf('{"acceptanceMeter":'); if (position >= 0) try {serverMeter.push(JSON.parse(line.slice(position)));} catch {failure = 'METER_PARSE_FAILED';}}});
  child.stderr.on('data', chunk => {logs += chunk;});
  const deadline = Date.now() + 20000;
  while (!logs.includes('Ready')) {if (child.exitCode !== null || Date.now() > deadline) throw Error('NEXT_NOT_READY: ' + logs.slice(-1000)); await new Promise(done => setTimeout(done, 100));}
}
async function stop() {const running=child;child=undefined;if(running&&running.exitCode===null&&running.signalCode===null){running.kill();await new Promise(done=>running.once('exit',done));}}
async function appFetch(input, init = {}) {
  const url = new URL(input instanceof Request ? input.url : String(input)); assert.equal(url.origin, origin); const api = url.pathname.startsWith('/api/');
  if (api) assert(++apiRequests <= limits.api); else pageRequests++;
  const headers = new Headers(init.headers); headers.set('host', 'pilot.example'); headers.set('x-forwarded-host', 'pilot.example'); headers.set('x-forwarded-proto', 'https');
  outboundBytes += Buffer.byteLength(String(init.body ?? ''));
  const response = await fetch(input, {...init, headers, redirect: 'error', signal: AbortSignal.timeout(12000)});
  const raw=await response.clone().text(); assert(Buffer.byteLength(raw)<=1048576); inboundBytes+=Buffer.byteLength(raw);
  if (api) {assert.equal(response.headers.get('x-bazaar-acceptance-meter'), 'v1'); assert.equal(response.headers.get('x-bazaar-redis-uncertain'), 'false');}
  return response;
}
async function http(path, token, body, expected = 200) {
  const response = await appFetch(origin + path, {method: body === undefined ? 'GET' : 'POST', headers: {...(token ? {authorization: 'Bearer ' + token} : {}), ...(body === undefined ? {} : {'content-type': 'application/json'})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const raw = await response.text(); const value = JSON.parse(raw); if(response.status!==expected)console.error(JSON.stringify({localFailurePath:path.split('?')[0],status:response.status,code:value.error?.code,proofHttpRequests,failure,lastMeter:serverMeter.at(-1)}));assert.equal(response.status, expected, JSON.stringify(value)); return value;
}
async function pay(intent) {
  await http('/api/market/orders', identities[1].human, intent, 201);
  const draft = (await http('/api/market/orders/' + intent.operationId, identities[1].human, {action: 'prepare'})).payment;
  assert.deepEqual(draft.identity, USDC_TESTNET_PAYMENT_IDENTITY); assert.equal(draft.asset, 'USDC');
  const tx = TransactionBuilder.fromXDR(draft.unsignedXdr, Networks.TESTNET); tx.sign(payer);
  return {signedXdr: tx.toXDR(), order: (await http('/api/market/orders/' + intent.operationId, identities[1].human, {action: 'pay', signedXdr: tx.toXDR()})).order};
}
try {
  await start(); const creationIntents = identities.map(v => ({creationId: randomUUID(), humanAccessHash: sha(v.human), agentAccessHash: sha(v.agent)}));
  for (const [i, identity] of identities.entries()) await http('/api/workspaces', identity.bootstrap, creationIntents[i], 201);
  const delivery = syncDeliveryContract();
  const card = {version: 'bazaar.service-card/v0', id: 'native-guionista-usdc-text', name: 'Guionista algorítmico USDC', description: 'Actual standalone algorithmic text provider; domain and Stellar ledger evidence are local doubles.', kind: 'http', url: providerOrigin, routeTemplate: '/v1/marketplace-text', input: [{name: 'topic', type: 'string', required: true}, {name: 'tone', type: 'string', required: true}, {name: 'durationSeconds', type: 'number', required: true}], network: 'stellar:testnet', payment: {scheme: 'exact', asset: 'USDC', amount: '0.01', destination, identity: {...USDC_TESTNET_PAYMENT_IDENTITY}}, provider: {name: 'Synthetic external seller'}, tags: ['guionista', 'testnet'], delivery: {...delivery, result: {...delivery.result, contentType: 'text/plain'}}};
  const submissionId = randomUUID(), cardHash = computeCanonicalServiceCardHash(card);
  await http('/api/market/services', identities[0].human, {submissionId, card, controlProof: {method: 'http-well-known', domain: 'provider.example.com'}}, 201);
  // Native proof handler executes against the actual provider well-known route.
  // DNS and pinned HTTPS transports are localhost doubles, not ownership evidence.
  const envelope = JSON.parse(data.get(reviewPrefix + ':state')), submission = envelope.state.records[0].submission;
  process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF=submission.control.expectedRecord;
  await http('/api/market/review',operator,{submissionId,action:'verify-http'});assert.equal(proofHttpRequests,1);
  await http('/api/market/review', operator, {submissionId, action: 'approve', reason: 'Local synthetic acceptance only; domain proof is explicitly doubled.'});
  await http('/api/market/review', operator, {submissionId, action: 'activate'});
  const catalog = await http('/api/market/services', identities[1].human); assert.equal(catalog.services.length, 1); assert.equal(catalog.services[0].cardHash, cardHash);
  const publicCatalog = await http('/api/discovery/resources'); assert.deepEqual(publicCatalog.results.find(v => v.id === card.id).payment.identity, USDC_TESTNET_PAYMENT_IDENTITY);
  assert((await http('/api/discovery/search?query=guionista')).results.some(v => v.resource.id === card.id));
  const page = await appFetch(origin + '/resources/' + card.id); assert.equal(page.status, 200); const html = await page.text(); assert(html.includes('/history?service=' + card.id));
  const first = {operationId: randomUUID(), serviceId: card.id, cardHash, payer: payer.publicKey(), input: {topic: 'Una comunidad de desarrolladores', tone: 'educativo', durationSeconds: 20}};
  const firstPayment = await pay(first); assert.equal(firstPayment.order.phase, 'paid'); await http('/api/market/orders', identities[1].human, first, 201);
  await http('/api/market/orders', identities[1].human, {...first, input: {...first.input, topic: 'Changed content'}}, 409);
  await http('/api/market/orders/' + first.operationId, identities[1].human, {action: 'pay', signedXdr: firstPayment.signedXdr}, 409); assert.equal(ledgerSubmissions, 1);
  client = new Client({name: 'native-external-guionista-worker', version: '2'});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/api/mcp'), {requestInit: {headers: {authorization: 'Bearer ' + identities[0].agent}}, fetch: appFetch, reconnectionOptions: {maxRetries: 0}}));
  const names = (await client.listTools()).tools.map(tool => tool.name); assert(names.includes('uncertain_market_order'));
  const workerOptions = {providerToken, persistIntent: async intent => {journal.push(structuredClone(intent));}, callTool: (name, args) => client.callTool({name, arguments: args}, undefined, {timeout: 12000}),
    providerFetch: async (input, init) => {const url = new URL(input); assert.equal(url.origin, providerOrigin); assert.equal(url.pathname, '/v1/marketplace-text'); externalOutboundBytes+=Buffer.byteLength(init.body);const response=await fetch(providerLocalOrigin + url.pathname, {...init, redirect: 'error', signal: AbortSignal.timeout(5000)});externalInboundBytes+=Buffer.byteLength(await response.clone().text());return response;}};
  const workerIntent = createGuionistaIntent({operationId: first.operationId, cardHash, serviceId: card.id, providerOrigin});
  const delivered = await executeGuionistaIntent(workerIntent, workerOptions); assert.equal(delivered.phase, 'delivered'); assert.equal(providerRequests, 1); assert.equal(delivered.delivery.sha256, sha(delivered.delivery.text)); assert(delivered.delivery.text.includes(first.input.topic));
  assert.deepEqual(journal.map(v => v.phase), ['claim-started', 'claimed', 'provider-started', 'generated', 'delivery-started', 'delivered']);
  const replay = await client.callTool({name: 'deliver_market_order', arguments: {operationId: first.operationId, attemptId: workerIntent.attemptId, text: workerIntent.text}}); assert(!replay.isError); assert.equal(providerRequests, 1);
  const second = {...first, operationId: randomUUID(), input: {...first.input, topic: 'Fallo declarado de aceptación'}};
  assert.equal((await pay(second)).order.phase, 'paid');
  const failed = await failGuionistaIntent(createGuionistaIntent({operationId: second.operationId, cardHash, serviceId: card.id, providerOrigin}), workerOptions, 'Fallo declarado de entrega; el pago sigue confirmado.');
  assert.equal(failed.phase, 'delivery-failed'); assert(failed.paymentVerifiedAt); assert.equal(failed.delivery, undefined); assert.equal(providerRequests, 1); assert.equal(ledgerSubmissions, 2);
  const buyerHistory = (await http('/api/market/orders', identities[1].human)).orders, sellerHistory = (await http('/api/market/orders', identities[0].human)).orders;
  assert.deepEqual(buyerHistory.map(v => v.perspective), ['purchase', 'purchase']); assert.deepEqual(sellerHistory.map(v => v.perspective), ['sale', 'sale']);
  assert.deepEqual(buyerHistory.map(({perspective, ...v}) => v), sellerHistory.map(({perspective, ...v}) => v));
  await http('/api/market/orders/' + first.operationId, 'q'.repeat(43), undefined, 401);
  await client.close(); client = undefined; await stop(); await start();
  assert.deepEqual((await http('/api/market/orders', identities[1].human)).orders, buyerHistory); assert.deepEqual((await http('/api/market/orders', identities[0].human)).orders, sellerHistory);
  await http('/api/market/control', operator, {action: 'pause'}); await stop(); await start();
  await http('/api/market/orders', identities[1].human, {...first, operationId: randomUUID()}, 503);
  await http('/api/workspaces', identities[0].bootstrap, {...creationIntents[0], creationId: randomUUID()}, 503);
  await http('/api/workspaces', identities[0].bootstrap, creationIntents[0]);
  assert.deepEqual((await http('/api/market/orders', identities[1].human)).orders, buyerHistory);
  await stop(); assert.equal(failure, undefined); storage();
  const totals = serverMeter.reduce((sum, row) => ({redis: sum.redis + row.redis, commandsUpperBound: sum.commandsUpperBound + row.commandsUpperBound, outbound: sum.outbound + row.outboundPayloadBytes, inbound: sum.inbound + row.inboundPayloadBytes, horizon: sum.horizon + row.external.horizon,proofHttp:sum.proofHttp+row.external['proof-http'],proofDns:sum.proofDns+row.external['proof-dns']}), {redis: 0, commandsUpperBound: 0, outbound: 0, inbound: 0, horizon: 0,proofHttp:0,proofDns:0});
  assert.equal(totals.redis, redisRequests); assert.equal(totals.commandsUpperBound, redisCommandsUpperBound); assert.equal(totals.outbound, redisOutboundBytes); assert.equal(totals.inbound, redisInboundBytes); assert.equal(totals.horizon, ledgerRequests);
  assert.equal(totals.proofHttp,proofHttpRequests);assert.equal(totals.proofDns,1);
  assert(serverMeter.some(row => row.source === 'ssr' && row.redis > 0)); assert(!serverMeter.some(row => row.uncertain));
  assert(outboundBytes + redisOutboundBytes + externalOutboundBytes <= limits.outboundBytes); assert(inboundBytes + redisInboundBytes + externalInboundBytes <= limits.inboundBytes);
  const report = {status: 'PASS', buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), runtime: process.version, nativeNext: true, externalMcpClient: true, actualAlgorithmicProvider: true, serverMeterMatchesProtocol: true, apiRequests, pageRequests, redisRequests, redisCommandsUpperBound, ledgerRequests, ledgerSubmissions, providerRequests, proofHttpRequests,proofDnsRequests:totals.proofDns, maximumStoredBytes, outboundPayloadBytes: outboundBytes + redisOutboundBytes + externalOutboundBytes, inboundPayloadBytes: inboundBytes + redisInboundBytes + externalInboundBytes, automaticRetries: 0, externalRequests: 0, limits, domainProof: 'native verify-http with actual provider well-known route and localhost DNS/HTTPS protocol doubles; not hosted ownership evidence', payment: 'two direct Circle USDC signed transactions against local Horizon double; no funds moved', storage: 'Redis SDK protocol double only; not real durability evidence', processReplacement: true, purchasePausePreservesHistory: true, successfulDeliveryExact: true, verifiedPaymentWithFailedDelivery: true, discoveryApiAndSsrMetered: true, privateBuyerSellerHistory: true, limitations: ['Freighter human signing and hosted HTTPS proof remain separate acceptance gates', 'Browser/static network bytes are not measured by this local protocol run']};
  await mkdir('docs/evidence/sprint-marketplace', {recursive: true}); await writeFile('docs/evidence/sprint-marketplace/usdc-native-local.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally {
  await client?.close().catch(() => {}); await stop();
  relay.closeAllConnections(); await new Promise(done => relay.close(done)); providerServer.closeAllConnections(); await new Promise(done => providerServer.close(done));
  if (priorProviderEnv.enabled === undefined) delete process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED; else process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED = priorProviderEnv.enabled;
  if (priorProviderEnv.token === undefined) delete process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256; else process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256 = priorProviderEnv.token;
  if(priorProviderEnv.proof===undefined)delete process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF;else process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF=priorProviderEnv.proof;
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('bazaar-usdc-native-double-')); await rm(directory, {recursive: true, force: true});
}
