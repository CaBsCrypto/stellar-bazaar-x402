import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, writeFile, mkdir, rm,open} from 'node:fs/promises';
import {join, resolve, sep, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes, randomUUID, createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {Account,Address,Keypair,Networks,Operation,SorobanDataBuilder,Transaction,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {basicNodeSigner} from '@stellar/stellar-sdk/contract';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {syncDeliveryContract} from '../lib/delivery-contract.ts';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {USDC_TESTNET_PAYMENT_IDENTITY} from '../lib/payment-assets.ts';
import {createGuionistaIntent, executeGuionistaIntent, failGuionistaIntent} from '../examples/guionista-marketplace-worker.mjs';
import {verifyHostedBuyerContracts,verifyHostedSellerReplays} from './x402-hosted-contract-checks.mjs';
import {buyerProtocol,createMarketplaceBuyerIntent,runMarketplaceBuyerIntent,recoverBuyerIntent,createBoundedBuyerFetch,createBuyerSpendBudget,assertBuyerTransfer,createSealedBuyerJournal} from '../examples/marketplace-x402-buyer.mjs';
import {orderMemo} from '../lib/marketplace-identity.ts';
import {validateMarketState} from '../lib/marketplace-store.ts';
import {formatHumanHistoryUrl} from '../lib/operation-history-client.ts';

// Native production Next + Redis/Soroban/facilitator protocol doubles, actual external worker
// and algorithmic provider route. No production credentials, DNS proof or funds.
const sha = value => createHash('sha256').update(value).digest('hex');
const coreOnly=process.argv.includes('--core-only'),reportIndex=process.argv.indexOf('--report-name');
const reportName=reportIndex<0?(coreOnly?'native-core-local.json':'native-local.json'):process.argv[reportIndex+1];
assert.ok(typeof reportName==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(reportName),'INVALID_PUBLIC_REPORT_NAME');
const reportPath='docs/evidence/sprint-x402-agent/'+reportName;
// A named candidate run preserves earlier reports, including a failed attempt.
if(reportIndex>=0){try{await readFile(reportPath);throw Error('PUBLIC_REPORT_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}}
const candidateArgument=process.argv.indexOf('--candidate-sha'),candidateSha=candidateArgument<0?undefined:process.argv[candidateArgument+1],sourceSha=(await promisify(execFile)('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim();
const sourcePaths=['app','components','lib','examples','scripts','package.json','package-lock.json','next.config.ts','next.config.js','next.config.mjs','tsconfig.json','proxy.ts','public','providers'];
if(candidateArgument>=0){assert.match(candidateSha??'',/^[a-f0-9]{40}$/,'INVALID_CANDIDATE_SHA');assert.equal(candidateSha,sourceSha,'CANDIDATE_SHA_MISMATCH');const dirty=(await promisify(execFile)('git',['status','--porcelain','--untracked-files=all','--',...sourcePaths],{windowsHide:true})).stdout.trim();assert.equal(dirty,'','COMMITTED_CANDIDATE_SOURCE_IS_DIRTY');assert(!coreOnly,'CORE_ONLY_CANNOT_BIND_FINAL_CANDIDATE');}
const sourceBinding={candidateCommitted:!!candidateSha,finalShaRequired:!candidateSha,...(candidateSha?{verification:'Exact committed HEAD and source paths clean before and after all fixture effects.',verifiedPaths:sourcePaths}:{})};
const baselinePath='docs/evidence/sprint-marketplace/usdc-counter-reconciliation.json',baselineRaw=await readFile(baselinePath,'utf8'),retainedBaseline=JSON.parse(baselineRaw).totals.storage;
const limits = {api: 120, redis: 400, commandsUpperBound: 2400, storedBytes: 49164, outboundBytes: 16 * 1048576, inboundBytes: 32 * 1048576};
const directory = await mkdtemp(join(tmpdir(), 'bazaar-x402-native-double-'));
const suffix = randomBytes(16).toString('hex');
const prefix = 'bazaar-market:pilot-' + suffix, wsPrefix = 'bazaar-workspace:pilot-' + suffix, reviewPrefix = 'bazaar-review:pilot-' + suffix;
const identities = Array.from({length: 3}, () => Object.fromEntries(['bootstrap', 'human', 'agent'].map(role => [role, randomBytes(32).toString('base64url')])));
const operator = randomBytes(32).toString('base64url'), providerToken = randomBytes(32).toString('base64url'), payer = Keypair.random(), destination = Keypair.random().publicKey();
const data = new Map(), indexes = new Map(), transactions = new Map(), sequences = new Map(), journal = [], serverMeter = [];
const requestEvidence=[];
let child, client, failure, redisRequests = 0, redisCommandsUpperBound = 0, ledgerRequests = 0, ledgerSubmissions = 0, apiRequests = 0, pageRequests = 0,facilitatorRequests=0,facilitatorSettlements=0,rpcRequests=0,buyerRpcRequests=0;
let outboundBytes = 0, inboundBytes = 0, redisOutboundBytes = 0, redisInboundBytes = 0, externalOutboundBytes = 0, externalInboundBytes = 0, maximumStoredBytes = 0, providerRequests = 0, proofHttpRequests = 0;
let buyerRpcOutboundBytes=0,buyerRpcInboundBytes=0,providerOutboundBytes=0,providerInboundBytes=0,proofOutboundHeaderBytes=0,proofInboundHeaderBytes=0,seededBaseline;
const allocation={workspace:7000,market:18000,review:9000,catalog:5000,settlement:10164},storagePeaks={workspace:0,market:0,review:0,catalog:0,settlement:0},currentStorage={...storagePeaks};
const headerBytes=headers=>[...new Headers(headers)].reduce((sum,[key,value])=>sum+Buffer.byteLength(key+': '+value+'\r\n'),0);
let nextNonce=0;
const storeSource = await readFile('lib/workspace-store.ts', 'utf8');
const scripts = Object.fromEntries(['READ', 'COMMIT'].map(name => [name, storeSource.match(new RegExp(`export const ${name}_WORKSPACE_LUA = \x60([\\s\\S]*?)\x60;`))[1].replaceAll('\r\n', '\n')]));
function storage() {
  const bytes = [...data].reduce((sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(value), 0) + [...indexes].reduce((sum, [key, members]) => sum + Buffer.byteLength(key) + [...members].reduce((n, value) => n + Buffer.byteLength(value), 0), 0);
  const buckets={workspace:0,market:0,review:0,catalog:0,settlement:0};for(const[key,value]of data){const bucket=key.startsWith(wsPrefix+':')?'workspace':key.startsWith(reviewPrefix+':')?'review':key.startsWith(prefix+':catalog:')?'catalog':key.startsWith(prefix+':x402-settlements:')?'settlement':'market';buckets[bucket]+=Buffer.byteLength(key)+Buffer.byteLength(value);}for(const[key,members]of indexes)buckets.catalog+=Buffer.byteLength(key)+[...members].reduce((sum,value)=>sum+Buffer.byteLength(value),0);for(const[name,amount]of Object.entries(buckets)){currentStorage[name]=amount;storagePeaks[name]=Math.max(storagePeaks[name],amount);assert(amount<=allocation[name],'Storage bucket exceeded: '+name);}
  maximumStoredBytes = Math.max(maximumStoredBytes, bytes); assert(bytes <= limits.storedBytes, 'Measured stored bytes exceeded acceptance limit'); return bytes;
}
function account(publicKey) {
  assert([payer.publicKey(), destination].includes(publicKey));
  return {account_id: publicKey, sequence: sequences.get(publicKey) ?? '0', subentry_count: 1, num_sponsoring: 0, num_sponsored: 0,
    balances: [{asset_type: 'native', balance: '1000', selling_liabilities: '0', buying_liabilities: '0'}, {asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_TESTNET_PAYMENT_IDENTITY.issuer, balance: '100', limit: '100000', is_authorized: true, selling_liabilities: '0', buying_liabilities: '0'}],
    thresholds: {med_threshold: 1}, signers: [{key: publicKey, type: 'ed25519_public_key', weight: 1}]};
}
function rawSimulation(transaction){
 const operation=transaction.operations[0],entry=operation.auth?.[0]??new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(payer.publicKey()).toScAddress(),nonce:xdr.Int64.fromString(String(++nextNonce)),signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(operation.func.invokeContract()),subInvocations:[]})});
 return {latestLedger:1000,minResourceFee:'100',transactionData:new SorobanDataBuilder().build().toXDR('base64'),results:[{auth:[entry.toXDR('base64')],xdr:xdr.ScVal.scvVoid().toXDR('base64')}]};
}
const sponsor=Keypair.random();
function settledTransaction(transactionXdr){const parsed=new Transaction(transactionXdr,Networks.TESTNET),operation=parsed.operations[0],tx=new TransactionBuilder(new Account(sponsor.publicKey(),String(facilitatorSettlements)),{fee:'200',networkPassphrase:Networks.TESTNET}).addOperation(Operation.invokeHostFunction({func:operation.func,auth:operation.auth})).setTimeout(60).build();tx.sign(sponsor);return tx;}
const relay = createServer(async (req, res) => {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {size += chunk.length; assert(size <= 1048576); chunks.push(chunk);}
    const body = Buffer.concat(chunks).toString(); let result;
    if(req.url.startsWith('/facilitator/')){
      assert.equal(req.headers.authorization,'Bearer offline-fixture');facilitatorRequests++;
      const payload=JSON.parse(body);assert.equal(payload.x402Version,2);assertBuyerTransfer(payload.paymentPayload.payload.transaction,payload.paymentRequirements,payer.publicKey());
      if(req.url==='/facilitator/verify')result={isValid:true,payer:payer.publicKey()};
      else{assert.equal(req.url,'/facilitator/settle');assert(++facilitatorSettlements<=2);const tx=settledTransaction(payload.paymentPayload.payload.transaction),transaction=tx.hash().toString('hex');assert(!transactions.has(transaction));transactions.set(transaction,{status:'SUCCESS',envelopeXdr:tx.toXDR()});result={success:true,payer:payer.publicKey(),network:'stellar:testnet',transaction};}
      const reply=JSON.stringify(result);externalOutboundBytes+=Buffer.byteLength(body);externalInboundBytes+=Buffer.byteLength(reply);res.writeHead(200,{'content-type':'application/json'});res.end(reply);return;
    }
    if(req.url==='/rpc'){
      rpcRequests++;const request=JSON.parse(body);assert.equal(request.jsonrpc,'2.0');
      if(request.method==='getTransaction'){assert.equal(request.id,'market-x402-read');result=transactions.get(request.params.hash);assert(result);}
      else{buyerRpcRequests++;assert.equal(request.id,1);if(request.method==='getLatestLedger')result={sequence:1000};else{assert.equal(request.method,'simulateTransaction');result=rawSimulation(new Transaction(request.params.transaction,Networks.TESTNET));}}
      const reply=JSON.stringify({jsonrpc:'2.0',id:request.id,result});externalOutboundBytes+=Buffer.byteLength(body);externalInboundBytes+=Buffer.byteLength(reply);res.writeHead(200,{'content-type':'application/json'});res.end(reply);return;
    }
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
      } else if (script.includes('-- x402-catalog-withdraw-cas-v1')) {
        const old=data.get(keys[0]);result=old!==undefined&&old===args[0]?1:0;if(result)data.set(keys[0],args[1]);
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
const providerApp = express(); providerApp.use((req, res, next) => {
  if(req.method==='GET'&&req.path==='/.well-known/stellar-bazaar-provider.txt'){assert(++proofHttpRequests<=2);proofOutboundHeaderBytes+=headerBytes(req.headers);res.on('finish',()=>{proofInboundHeaderBytes+=headerBytes(res.getHeaders());});}
  else{assert.equal(req.method, 'POST'); assert.equal(req.path, '/v1/marketplace-text'); assert(++providerRequests <= 1);}next();
}); registerMarketplaceTextRoutes(providerApp);
const providerServer = providerApp.listen(0, '127.0.0.1'); await new Promise(done => providerServer.once('listening', done));
const providerOrigin = 'https://provider.example.com', providerLocalOrigin = 'http://127.0.0.1:' + providerServer.address().port;
const adapter = join(directory, 'adapter.mjs');
await writeFile(adapter, `import dns from 'node:dns/promises';import https from 'node:https';import http from 'node:http';import{syncBuiltinESMExports}from'node:module';
dns.lookup=async hostname=>{if(hostname!=='provider.example.com')throw Error('EXTERNAL_DNS_DISABLED');return[{address:'8.8.8.8',family:4}];};
https.request=(options,callback)=>{if(options.hostname!=='provider.example.com'||options.path!=='/.well-known/stellar-bazaar-provider.txt'||options.method!=='GET')throw Error('EXTERNAL_HTTPS_DISABLED');return http.request({hostname:'127.0.0.1',port:${providerServer.address().port},path:options.path,method:'GET',headers:options.headers},callback);};syncBuiltinESMExports();
const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);let path;if(u.origin==='https://redis-double.invalid')path=u.pathname;else if(u.origin==='https://horizon-testnet.stellar.org')path='/horizon'+u.pathname+u.search;else if(u.origin==='https://channels.openzeppelin.com'&&u.pathname.startsWith('/x402/testnet/'))path='/facilitator/'+u.pathname.split('/').at(-1);else if(u.origin==='https://soroban-testnet.stellar.org')path='/rpc';else throw Error('EXTERNAL_FETCH_DISABLED');const response=await original(${JSON.stringify(relayOrigin)}+path,init);return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});};`);
const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--import=' + pathToFileURL(adapter).href,
  BAZAAR_ACCEPTANCE_METER: 'true', BAZAAR_ACCEPTANCE_SALE: 'true',BAZAAR_ACCEPTANCE_X402:'true',BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON:JSON.stringify(allocation),BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON:JSON.stringify({'native-guionista-usdc-legacy':2250,'native-guionista-x402-text':2250}),BAZAAR_ACCEPTANCE_SETTLEMENT_KEY:prefix+':x402-settlements:state', BAZAAR_ACCEPTANCE_CATALOG_CARD_ID:'native-guionista-x402-text', BAZAAR_ENABLE_OPEN_WORKSPACES: 'true', BAZAAR_WORKSPACE_BACKEND: 'redis', BAZAAR_WORKSPACE_PREFIX: wsPrefix, BAZAAR_WORKSPACE_PUBLIC_ORIGIN: 'https://pilot.example', BAZAAR_WORKSPACE_ADMISSION: 'invite-only', BAZAAR_WORKSPACE_INVITE_HASHES_JSON: JSON.stringify(identities.map(v => sha(v.bootstrap))), BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_MINUTE: '120', BAZAAR_WORKSPACE_GLOBAL_REQUESTS_PER_DAY: '1000', BAZAAR_WORKSPACE_REDIS_REST_URL: 'https://redis-double.invalid', BAZAAR_WORKSPACE_REDIS_REST_TOKEN: 'local-double-only',
  BAZAAR_ENABLE_MARKETPLACE: 'true', BAZAAR_ENABLE_MARKET_PURCHASES: 'true',BAZAAR_X402_MARKETPLACE_ENABLED:'true',STELLAR_X402_FACILITATOR_API_KEY:'offline-fixture', BAZAAR_MARKET_PREFIX: prefix, BAZAAR_DYNAMIC_PREFIX: prefix + ':catalog', BAZAAR_MARKET_REVIEW_SECRET: randomBytes(32).toString('hex'), BAZAAR_MARKET_OPERATOR_HASH: sha(operator), BAZAAR_ENABLE_SELF_LISTING_INTAKE: 'true', BAZAAR_PROVIDER_REVIEW_BACKEND: 'redis', BAZAAR_REVIEW_PREFIX: reviewPrefix, BAZAAR_REVIEW_REDIS_REST_URL: 'https://redis-double.invalid', BAZAAR_REVIEW_REDIS_REST_TOKEN: 'local-double-only', BAZAAR_ENABLE_PROVIDER_ACTIVATION: 'true', X402_PILOT_PAYMENTS_ENABLED: 'false', X402_LEGACY_PAYMENTS_ENABLED: 'false'});
const port = 3293, origin = 'http://127.0.0.1:' + port,publicOrigin='https://pilot.example';
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
  outboundBytes += Buffer.byteLength(String(init.body ?? ''));for(const[key,value]of headers)outboundBytes+=Buffer.byteLength(key+': '+value+'\r\n');
  const response = await fetch(input, {...init, headers, redirect: 'error', signal: AbortSignal.timeout(12000)});
  const raw=await response.clone().text(); assert(Buffer.byteLength(raw)<=1048576); inboundBytes+=Buffer.byteLength(raw);for(const[key,value]of response.headers)inboundBytes+=Buffer.byteLength(key+': '+value+'\r\n');
  if(response.status>=500&&!['MARKET_PAUSED','ADMISSIONS_PAUSED'].includes(JSON.parse(raw).error?.code))console.error(JSON.stringify({nativeFailurePath:url.pathname,status:response.status,code:JSON.parse(raw).error?.code,storagePeaks,lastMeter:serverMeter.at(-1)}));
  if(api){let action;try{const body=init.body&&JSON.parse(init.body);action=body?.action;if(url.pathname==='/api/mcp')action=body?.method==='tools/call'?body.params?.name:body?.method;if(url.pathname.endsWith('/x402'))action=headers.has('payment-signature')?'signed-payment':'challenge';}catch{}requestEvidence.push({requestId:response.headers.get('x-bazaar-acceptance-request-id'),method:init.method??'GET',pathTemplate:url.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,'{operationId}'),...(action?{action}:{}),status:response.status,requestPayloadBytes:Buffer.byteLength(String(init.body??''))+[...headers].reduce((sum,[key,value])=>sum+Buffer.byteLength(key+': '+value+'\r\n'),0),responsePayloadBytes:Buffer.byteLength(raw)+[...response.headers].reduce((sum,[key,value])=>sum+Buffer.byteLength(key+': '+value+'\r\n'),0)});}
  if (api) {if(response.headers.get('x-bazaar-acceptance-meter')!=='v2'||response.headers.get('x-bazaar-redis-uncertain')!=='false')console.error(JSON.stringify({nativeFailurePath:url.pathname,status:response.status,code:JSON.parse(raw).error?.code,meter:response.headers.get('x-bazaar-acceptance-meter'),uncertain:response.headers.get('x-bazaar-redis-uncertain'),failure,lastMeter:serverMeter.at(-1)}));assert.equal(response.headers.get('x-bazaar-acceptance-meter'), 'v2'); assert.equal(response.headers.get('x-bazaar-redis-uncertain'), 'false');}
  return response;
}
async function http(path, token, body, expected = 200,extraHeaders={}) {
  const response = await appFetch(origin + path, {method: body === undefined ? 'GET' : 'POST', headers: {...(token ? {authorization: 'Bearer ' + token} : {}), ...(body === undefined ? {} : {'content-type': 'application/json'}),...extraHeaders}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const raw = await response.text(); const value = JSON.parse(raw); if(response.status!==expected)console.error(JSON.stringify({localFailurePath:path.split('?')[0],status:response.status,code:value.error?.code,proofHttpRequests,failure,lastMeter:serverMeter.at(-1)}));assert.equal(response.status, expected, JSON.stringify(value)); return value;
}
try {
  env.BAZAAR_ACCEPTANCE_CATALOG_CARD_ID='native-guionista-usdc-legacy';await start(); const creationIntents = identities.map(v => ({creationId: randomUUID(), humanAccessHash: sha(v.human), agentAccessHash: sha(v.agent)}));
  const workspaces=[];for (const [i, identity] of identities.entries())workspaces.push((await http('/api/workspaces', identity.bootstrap, creationIntents[i], 201)).record);
  const delivery = syncDeliveryContract();
  const legacyCard = {version: 'bazaar.service-card/v0', id: 'native-guionista-usdc-legacy', name: 'Guionista histórico Classic', description: 'Synthetic earlier Classic service; records are seeded fixtures.', kind: 'http', url: providerOrigin, routeTemplate: '/v1/marketplace-text', input: [{name: 'topic', type: 'string', required: true}, {name: 'tone', type: 'string', required: true}, {name: 'durationSeconds', type: 'number', required: true}], network: 'stellar:testnet', payment: {scheme: 'exact', asset: 'USDC', amount: '0.01', destination, identity: {...USDC_TESTNET_PAYMENT_IDENTITY}}, provider: {name: 'Synthetic external seller'}, tags: ['guionista', 'testnet'], delivery: {...delivery, result: {...delivery.result, contentType: 'text/plain'}}};
  const legacySubmissionId=randomUUID();await http('/api/market/services',identities[0].human,{submissionId:legacySubmissionId,card:legacyCard,controlProof:{method:'http-well-known',domain:'provider.example.com'}},201);
  process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF=JSON.parse(data.get(reviewPrefix+':state')).state.records.find(v=>v.submission.submissionId===legacySubmissionId).submission.control.expectedRecord;
  await http('/api/market/review',operator,{submissionId:legacySubmissionId,action:'verify-http'});await http('/api/market/review',operator,{submissionId:legacySubmissionId,action:'approve',reason:'Synthetic earlier service control double.'});await http('/api/market/review',operator,{submissionId:legacySubmissionId,action:'activate'});
  const historical=[0,1].map(i=>{const operationId=randomUUID(),cardHash=computeCanonicalServiceCardHash(legacyCard),input={topic:'Earlier Classic fixture '+i,tone:'educativo',durationSeconds:20},now=new Date().toISOString(),text='Historical text preserved exactly.';return {operationId,buyerOwnerId:workspaces[1].ownerId,sellerOwnerId:workspaces[0].ownerId,serviceId:legacyCard.id,cardHash,card:structuredClone(legacyCard),input,payer:payer.publicKey(),destination,amount:'0.01',settlement:{...USDC_TESTNET_PAYMENT_IDENTITY},memoHash:orderMemo(workspaces[1].ownerId,operationId,cardHash,input),phase:i?'delivery-failed':'delivered',transactionHash:sha('historical-classic-'+i),paymentVerifiedAt:now,attemptId:randomUUID(),agentId:workspaces[0].agentId,createdAt:now,updatedAt:now,...(i?{failure:'Historical delivery failure.'}:{delivery:{text,sha256:sha(text),recordedAt:now,reference:'bazaar-order:'+operationId}})};});
  const marketEnvelope=JSON.parse(data.get(prefix+':state'));marketEnvelope.state.orders.push(...historical);validateMarketState(marketEnvelope.state);data.set(prefix+':state',JSON.stringify(marketEnvelope));storage();seededBaseline={...currentStorage};const historicalHashes=historical.map(v=>sha(JSON.stringify(v)));
  await stop();env.BAZAAR_ACCEPTANCE_CATALOG_CARD_ID='native-guionista-x402-text';await start();
  const card={...structuredClone(legacyCard),id:'native-guionista-x402-text',name:'Guionista algorítmico x402',description:'Actual algorithmic provider with native x402 HTTP purchase; all external ledgers are explicit local doubles.',payment:{...structuredClone(legacyCard.payment),marketplace:{protocol:buyerProtocol,resourceTemplate:'/api/market/orders/{operationId}/x402'}},delivery:{...delivery,mode:'async',result:{...delivery.result,contentType:'text/plain',terminalStatuses:['delivered','delivery-failed']},status:{required:true,urlTemplate:'/api/market/orders/{operationId}',pollAfterMs:1000},retention:{durable:true,resultTtlHours:24},retry:{retryable:false,maxAttempts:1,failureSemantics:'terminal-error'}}};
  const submissionId = randomUUID(), cardHash = computeCanonicalServiceCardHash(card);
  await http('/api/market/services', identities[0].human, {submissionId, card, controlProof: {method: 'http-well-known', domain: 'provider.example.com'}}, 201);
  // Native proof handler executes against the actual provider well-known route.
  // DNS and pinned HTTPS transports are localhost doubles, not ownership evidence.
  const envelope = JSON.parse(data.get(reviewPrefix + ':state')), submission = envelope.state.records.find(v=>v.submission.submissionId===submissionId).submission;
  process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF=submission.control.expectedRecord;
  await http('/api/market/review',operator,{submissionId,action:'verify-http'});assert.equal(proofHttpRequests,2);
  await http('/api/market/review', operator, {submissionId, action: 'approve', reason: 'Local synthetic acceptance only; domain proof is explicitly doubled.'});
  await http('/api/market/review', operator, {submissionId, action: 'activate'});
  const catalog = await http('/api/market/services', identities[1].agent); assert.equal(catalog.services.length, 2); assert.equal(catalog.services.find(v=>v.card.id===card.id).cardHash, cardHash);
  const publicCatalog = await http('/api/discovery/resources'); assert.deepEqual(publicCatalog.results.find(v => v.id === card.id).payment.identity, USDC_TESTNET_PAYMENT_IDENTITY);
  assert((await http('/api/discovery/search?query=guionista')).results.some(v => v.resource.id === card.id));
  const page = await appFetch(origin + '/resources/' + card.id); assert.equal(page.status, 200); const html = await page.text(); assert(html.includes('/history?service=' + card.id));assert(html.includes('Tu agente compra por x402'));assert(!html.includes('Comprar desde mi espacio'));assert(html.includes('USDC'));
  const budget=createBuyerSpendBudget({persistReservations:async value=>{const file=await open(join(directory,'synthetic-spend-reservations.json'),'w',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}}}),buyerSnapshots=[],buyerJournals=new Map(),journalKey=randomBytes(32);
  const seal=async bytes=>{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',journalKey,nonce);return Buffer.concat([nonce,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);};
  const unseal=async bytes=>{assert(bytes.length>=28);const decipher=createDecipheriv('aes-256-gcm',journalKey,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]);};
  const registerBuyerIntent=async intent=>{const journal=createSealedBuyerJournal({path:join(directory,intent.operationId+'.journal'),seal,unseal});await journal.initialize(intent);buyerJournals.set(intent.operationId,journal);};
  const buyerOptions={agentToken:identities[1].agent,signer:{address:payer.publicKey(),...basicNodeSigner(payer,Networks.TESTNET)},reserveSpend:value=>budget.reserve(value),persistIntent:async value=>{const journal=buyerJournals.get(value.operationId);assert(journal,'BUYER_JOURNAL_NOT_INITIALIZED');await journal.append(value);buyerSnapshots.push(structuredClone(value));},marketFetch:createBoundedBuyerFetch({origin:publicOrigin,fetchImpl:async(input,init)=>{const url=new URL(input);assert.equal(url.origin,publicOrigin);const response=await appFetch(origin+url.pathname,init);return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});}}),rpcFetch:createBoundedBuyerFetch({origin:'https://soroban-testnet.stellar.org',beforeRequest:async evidence=>{buyerRpcOutboundBytes+=evidence.requestBytes;},onResponse:async evidence=>{buyerRpcInboundBytes+=evidence.responseBytes;},onUncertain:async evidence=>{buyerRpcInboundBytes+=evidence.responseBytes;},fetchImpl:async(input,init)=>{assert.equal(new URL(input).origin,'https://soroban-testnet.stellar.org');const response=await fetch(relayOrigin+'/rpc',{...init,redirect:'error'});return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});}})};
  const first=createMarketplaceBuyerIntent({origin:publicOrigin,card,payer:payer.publicKey(),input:{topic:'Una comunidad de desarrolladores',tone:'educativo',durationSeconds:20}}),firstPayload={operationId:first.operationId,serviceId:card.id,cardHash,payer:first.payer,input:first.input,paymentProtocol:buyerProtocol};
  await registerBuyerIntent(first);let loseResponse=true;const firstOptions={...buyerOptions,marketFetch:async(input,init)=>{if(init.headers?.['payment-signature']){const saved=await buyerJournals.get(first.operationId).read();assert.equal(saved.phase,'payment-started');assert.equal(saved.paymentSignature,init.headers['payment-signature']);}const response=await buyerOptions.marketFetch(input,init);if(loseResponse&&init.headers?.['payment-signature']&&response.status===202){loseResponse=false;throw Error('LOCAL_PAYMENT_RESPONSE_LOST');}return response;}};
  await assert.rejects(runMarketplaceBuyerIntent(first,firstOptions),/LOCAL_PAYMENT_RESPONSE_LOST/);assert.equal(first.phase,'payment-uncertain');assert.equal((await recoverBuyerIntent(first,buyerOptions)).phase,'paid');assert.equal(facilitatorSettlements,1);
  assert.equal(facilitatorSettlements,1);
  client = new Client({name: 'native-external-guionista-worker', version: '2'});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/api/mcp'), {requestInit: {headers: {authorization: 'Bearer ' + identities[0].agent}}, fetch: appFetch, reconnectionOptions: {maxRetries: 0}}));
  const names = (await client.listTools()).tools.map(tool => tool.name); assert(names.includes('uncertain_market_order'));
  const workerOptions = {providerToken, persistIntent: async intent => {journal.push(structuredClone(intent));}, callTool: (name, args) => client.callTool({name, arguments: args}, undefined, {timeout: 12000}),
    providerFetch: async (input, init) => {const url = new URL(input); assert.equal(url.origin, providerOrigin); assert.equal(url.pathname, '/v1/marketplace-text');providerOutboundBytes+=Buffer.byteLength(init.body)+headerBytes(init.headers);const response=await fetch(providerLocalOrigin + url.pathname, {...init, redirect: 'error', signal: AbortSignal.timeout(5000)});providerInboundBytes+=Buffer.byteLength(await response.clone().text())+headerBytes(response.headers);return response;}};
  const workerIntent = createGuionistaIntent({operationId: first.operationId, cardHash, serviceId: card.id, providerOrigin});
  const delivered = await executeGuionistaIntent(workerIntent, workerOptions); assert.equal(delivered.phase, 'delivered'); assert.equal(providerRequests, 1); assert.equal(delivered.delivery.sha256, sha(delivered.delivery.text)); assert(delivered.delivery.text.includes(first.input.topic));
  assert.deepEqual(journal.map(v => v.phase), ['claim-started', 'claimed', 'provider-started', 'generated', 'delivery-started', 'delivered']);
  const deliveredContractReplays=await verifyHostedSellerReplays({worker:workerIntent,order:delivered,client});assert.equal(providerRequests,1);
  const second=createMarketplaceBuyerIntent({origin:publicOrigin,card,payer:payer.publicKey(),input:{...first.input,topic:'Fallo declarado de aceptación'}});
  await registerBuyerIntent(second);
  assert.equal((await runMarketplaceBuyerIntent(second,buyerOptions)).order.phase,'paid');
  const secondWorker=createGuionistaIntent({operationId:second.operationId,cardHash,serviceId:card.id,providerOrigin});
  const failureReason='Fallo declarado de entrega; el pago sigue confirmado.';
  const failed = await failGuionistaIntent(secondWorker, workerOptions, failureReason);
  const secondPayload={...firstPayload,operationId:second.operationId,input:second.input};
  const buyerContractChecks=await verifyHostedBuyerContracts({intent:second,create:secondPayload,order:failed,fetcher:buyerOptions.marketFetch,agentToken:identities[1].agent,includeMutations:true});
  const failedContractReplays=await verifyHostedSellerReplays({worker:secondWorker,order:failed,client,failureReason});
  assert.equal(failed.phase, 'delivery-failed'); assert(failed.paymentVerifiedAt); assert.equal(failed.delivery, undefined); assert.equal(providerRequests, 1); assert.equal(facilitatorSettlements, 2);assert.equal(ledgerSubmissions,0);assert.equal((await recoverBuyerIntent(first,buyerOptions)).delivery.text,workerIntent.text);assert.equal((await recoverBuyerIntent(second,buyerOptions)).phase,'delivery-failed');
  const buyerHistory = (await http('/api/market/orders', identities[1].human)).orders, sellerHistory = (await http('/api/market/orders', identities[0].human)).orders;
  assert.deepEqual(buyerHistory.map(v => v.perspective), ['purchase', 'purchase','purchase','purchase']); assert.deepEqual(sellerHistory.map(v => v.perspective), ['sale', 'sale','sale','sale']);
  assert.deepEqual(buyerHistory.map(({perspective, ...v}) => v), sellerHistory.map(({perspective, ...v}) => v));
  await http('/api/market/orders/' + first.operationId, 'q'.repeat(43), undefined, 401);
  await http('/api/market/orders/'+first.operationId,identities[2].agent,undefined,404);assert.equal((await http('/api/market/orders',identities[2].human)).orders.length,0);assert(!JSON.stringify(sellerHistory).includes(first.paymentSignature));
  await client.close(); client = undefined; await stop(); await start();
  const recoveredJournal=await buyerJournals.get(first.operationId).read();assert.equal(recoveredJournal.paymentSignature,first.paymentSignature);assert.equal((await recoverBuyerIntent(recoveredJournal,buyerOptions)).delivery.text,workerIntent.text);assert.equal(recoveredJournal.paymentSignature,first.paymentSignature);assert.equal(facilitatorSettlements,2);
  assert.deepEqual((await http('/api/market/orders', identities[1].human)).orders, buyerHistory); assert.deepEqual((await http('/api/market/orders', identities[0].human)).orders, sellerHistory);
  await http('/api/market/control', operator, {action: 'pause'}); await stop(); await start();
  await http('/api/market/orders', identities[1].agent, {...firstPayload, operationId: randomUUID()}, 503);
  await http('/api/workspaces', identities[0].bootstrap, {...creationIntents[0], creationId: randomUUID()}, 503);
  await http('/api/workspaces', identities[0].bootstrap, creationIntents[0]);
  assert.deepEqual((await http('/api/market/orders', identities[1].human)).orders, buyerHistory);
  await http('/api/market/orders/'+first.operationId+'/x402',identities[1].agent,{},200,{'payment-signature':first.paymentSignature});assert.equal(facilitatorSettlements,2);assert.deepEqual(JSON.parse(data.get(prefix+':state')).state.orders.filter(v=>!v.paymentProtocol).map(v=>sha(JSON.stringify(v))),historicalHashes);
  if(!coreOnly){
  const oldAHuman=identities[0].human,oldAAgent=identities[0].agent,oldBHuman=identities[1].human;identities[0].human=randomBytes(32).toString('base64url');identities[0].agent=randomBytes(32).toString('base64url');identities[1].human=randomBytes(32).toString('base64url');
  workspaces[0]=(await http('/api/workspaces/'+workspaces[0].workspaceId+'/access',identities[0].bootstrap,{action:'rotate',role:'human',accessHash:sha(identities[0].human),expectedGeneration:workspaces[0].generation})).record;
  workspaces[0]=(await http('/api/workspaces/'+workspaces[0].workspaceId+'/access',identities[0].bootstrap,{action:'rotate',role:'agent',accessHash:sha(identities[0].agent),expectedGeneration:workspaces[0].generation})).record;
  workspaces[1]=(await http('/api/workspaces/'+workspaces[1].workspaceId+'/access',identities[1].bootstrap,{action:'rotate',role:'human',accessHash:sha(identities[1].human),expectedGeneration:workspaces[1].generation})).record;
  for(const token of [oldAHuman,oldAAgent,oldBHuman])await http('/api/market/orders',token,undefined,401);
  assert.deepEqual((await http('/api/market/orders',identities[0].human)).orders,sellerHistory);
  const magicLink=new URL(formatHumanHistoryUrl(publicOrigin,identities[1].human)),recoveredAccess=new URLSearchParams(magicLink.hash.slice(1)).get('token');assert.equal(magicLink.search,'');assert.equal(magicLink.pathname,'/history');assert.equal(recoveredAccess,identities[1].human);assert.deepEqual((await http('/api/market/orders',recoveredAccess)).orders,buyerHistory);
  await http('/api/market/services/'+submissionId,identities[0].human,{action:'withdraw'});await stop();env.BAZAAR_ACCEPTANCE_CATALOG_CARD_ID=legacyCard.id;await start();await http('/api/market/services/'+legacySubmissionId,identities[0].human,{action:'withdraw'});
  const revoked=await http('/api/workspaces/'+workspaces[0].workspaceId+'/access',identities[0].bootstrap,{action:'revoke',expectedGeneration:workspaces[0].generation});assert.equal(revoked.record.revoked,true);await http('/api/market/orders',identities[0].human,undefined,401);await http('/api/market/orders',identities[0].agent,undefined,401);
  assert.deepEqual((await http('/api/market/orders',identities[1].human)).orders,buyerHistory);assert.equal((await http('/api/market/services',identities[1].human)).services.length,0);assert.deepEqual(JSON.parse(data.get(prefix+':state')).state.orders.filter(v=>!v.paymentProtocol).map(v=>sha(JSON.stringify(v))),historicalHashes);
  }
  await stop(); assert.equal(failure, undefined); storage();
  const measured = serverMeter.reduce((sum,row)=>({redis:sum.redis+row.redis,commandsUpperBound:sum.commandsUpperBound+row.commandsUpperBound,outbound:sum.outbound+row.outboundPayloadBytes,inbound:sum.inbound+row.inboundPayloadBytes,horizon:sum.horizon+row.external.horizon,proofHttp:sum.proofHttp+row.external['proof-http'],proofDns:sum.proofDns+row.external['proof-dns'],facilitator:sum.facilitator+row.external.facilitator,rpc:sum.rpc+row.external.rpc,externalOut:sum.externalOut+row.externalOutboundPayloadBytes,externalIn:sum.externalIn+row.externalInboundPayloadBytes}),{redis:0,commandsUpperBound:0,outbound:0,inbound:0,horizon:0,proofHttp:0,proofDns:0,facilitator:0,rpc:0,externalOut:0,externalIn:0});
  assert.equal(measured.redis,redisRequests);assert.equal(measured.commandsUpperBound,redisCommandsUpperBound);assert.equal(measured.outbound,redisOutboundBytes);assert.equal(measured.inbound,redisInboundBytes);assert.equal(measured.horizon,ledgerRequests);assert.equal(ledgerRequests,0);assert.equal(measured.facilitator,facilitatorRequests);assert.equal(measured.rpc+buyerRpcRequests,rpcRequests);assert.equal(facilitatorRequests,4);assert.equal(rpcRequests,8);assert.equal(measured.proofHttp,proofHttpRequests);assert.equal(measured.proofDns,2);
  assert(serverMeter.some(row => row.source === 'ssr' && row.redis > 0)); assert(!serverMeter.some(row => row.uncertain));
  externalOutboundBytes=measured.externalOut+buyerRpcOutboundBytes+providerOutboundBytes+proofOutboundHeaderBytes;externalInboundBytes=measured.externalIn+buyerRpcInboundBytes+providerInboundBytes+proofInboundHeaderBytes;
  assert(outboundBytes + redisOutboundBytes + externalOutboundBytes <= limits.outboundBytes); assert(inboundBytes + redisInboundBytes + externalInboundBytes <= limits.inboundBytes);
  const totalHttpRequests=apiRequests+pageRequests+facilitatorRequests+rpcRequests+proofHttpRequests+providerRequests;assert(totalHttpRequests<=limits.api,'Aggregate application and external HTTP request budget exceeded');
  const retainedBaselineAdditionalBytes=Object.fromEntries(Object.keys(storagePeaks).map(name=>[name,Math.max(0,(retainedBaseline[name]??0)-seededBaseline[name])])),projectedStoragePeaks=Object.fromEntries(Object.entries(storagePeaks).map(([name,amount])=>[name,amount+retainedBaselineAdditionalBytes[name]])),projectedStoredBytes=Object.values(projectedStoragePeaks).reduce((sum,amount)=>sum+amount,0);for(const[name,amount]of Object.entries(projectedStoragePeaks))assert(amount<=allocation[name],'Retained historical baseline projection exceeds '+name+' allocation');assert(projectedStoredBytes<=limits.storedBytes,'Retained historical baseline projection exceeds total allocation');
  assert.equal((await promisify(execFile)('git',['rev-parse','HEAD'],{windowsHide:true})).stdout.trim(),sourceSha,'SOURCE_HEAD_CHANGED_DURING_NATIVE_RUN');if(candidateSha)assert.equal((await promisify(execFile)('git',['status','--porcelain','--untracked-files=all','--',...sourcePaths],{windowsHide:true})).stdout.trim(),'','CANDIDATE_SOURCE_CHANGED_DURING_NATIVE_RUN');
  const totals={apiRequests:totalHttpRequests,redisRestExchanges:redisRequests,redisCommandsUpperBound,storedBytes:projectedStoredBytes,outboundPayloadBytes:outboundBytes+redisOutboundBytes+externalOutboundBytes,inboundPayloadBytes:inboundBytes+redisInboundBytes+externalInboundBytes,paymentSubmissionIntents:facilitatorSettlements,friendbotClaims:0,trustlineSubmissions:0,usdcFaucetClaims:0};
  const groups=new Map();for(const request of requestEvidence){const meter=serverMeter.find(row=>row.requestId===request.requestId);assert(meter,'API request missing its native server counter');const key=[request.method,request.pathTemplate,request.action??'',request.status].join('|'),group=groups.get(key)??{method:request.method,pathTemplate:request.pathTemplate,...(request.action?{action:request.action}:{}),status:request.status,requestCount:0,maximum:{redisRestExchanges:0,redisCommandsUpperBound:0,redisOutboundPayloadBytes:0,redisInboundPayloadBytes:0,externalOutboundPayloadBytes:0,externalInboundPayloadBytes:0,requestPayloadBytes:0,responsePayloadBytes:0,external:{}}};group.requestCount++;const sample={redisRestExchanges:meter.redis,redisCommandsUpperBound:meter.commandsUpperBound,redisOutboundPayloadBytes:meter.outboundPayloadBytes,redisInboundPayloadBytes:meter.inboundPayloadBytes,externalOutboundPayloadBytes:meter.externalOutboundPayloadBytes,externalInboundPayloadBytes:meter.externalInboundPayloadBytes,requestPayloadBytes:request.requestPayloadBytes,responsePayloadBytes:request.responsePayloadBytes};for(const[name,number]of Object.entries(sample))group.maximum[name]=Math.max(group.maximum[name],number);for(const[kind,count]of Object.entries(meter.external))group.maximum.external[kind]=Math.max(group.maximum.external[kind]??0,count);groups.set(key,group);}
  const report={status:coreOnly?'PASS_NATIVE_X402_CORE_LOCAL':'PASS_NATIVE_X402_LOCAL',sourceSha,sourceBinding,buyerJournalRecovery:true,buyerJournal:'Synthetic AES-GCM with fsync; key only in local process memory. Actual Windows DPAPI synthetic sealing is covered separately in buyer unit tests.',buildId:(await readFile('.next/BUILD_ID','utf8')).trim(),runtime:process.version,nativeNext:true,externalMcpClient:true,actualAlgorithmicProvider:true,serverMeterMatchesProtocol:true,totals,coverage:{agentHttp:true,redis:true,facilitator:true,horizon:true,rpc:true,provider:true},counts:{applicationApiRequests:apiRequests,pageRequests,facilitatorRequests,facilitatorSettlements,rpcRequests,buyerRpcRequests,horizonRequests:ledgerRequests,providerRequests,proofHttpRequests,proofDnsRequests:measured.proofDns},payloadAccounting:{definition:'Request bodies and explicit headers; response bodies and exposed headers. Proof request/response headers observed at the local provider; no duplicate server/fetch body charges.',applicationOutboundBytes:outboundBytes,applicationInboundBytes:inboundBytes,redisOutboundBytes,redisInboundBytes,externalOutboundBytes,externalInboundBytes,buyerRpcOutboundBytes,buyerRpcInboundBytes,providerOutboundBytes,providerInboundBytes,proofOutboundHeaderBytes,proofInboundHeaderBytes},requestProfiles:[...groups.values()],ssrProfiles:serverMeter.filter(row=>row.source==='ssr').map(({requestId,...row})=>row),storageAllocation:allocation,storagePeaks,storageProjection:{sourceArtifact:baselinePath,sourceArtifactSha256:sha(baselineRaw),sourceArtifactStatus:'INCOMPLETE_EVIDENCE',retainedBaseline,seededBaseline,retainedBaselineAdditionalBytes,projectedStoragePeaks,nativeMeasuredStoredBytes:maximumStoredBytes,projectedStoredBytes,description:'Conservative additional capacity charged for retained history size. Synthetic local records are not exact production records; this does not certify current live Redis contents.'},automaticRetries:0,remoteRequests:0,limits,domainProof:'Native provider control with localhost DNS/HTTPS transport doubles, not hosted ownership evidence.',payment:'Two signed SAC transfers and rebuilt sponsor transactions against local RPC/facilitator doubles. No funds moved.',storage:'SDK Redis protocol double; pre-existing two Classic orders are seeded local fixtures, not migrated production records.',processReplacement:true,purchasePausePreservesHistory:true,successfulDeliveryExact:true,verifiedPaymentWithFailedDelivery:true,discoveryApiAndSsrMetered:true,privateBuyerSellerHistory:true,historicalClassicPreserved:true,historicalRecordHashes:historicalHashes,paymentResponseLossRecoveredByRead:true,singleProviderInvocation:true,legacyX402RoutesRemainDisabled:true,accessRotation:!coreOnly,oldCredentialsRejected:!coreOnly,magicLinkShapeAndServerRecovery:!coreOnly,accessRotationPreservesHistory:!coreOnly,magicLinkServerRecoversOrders:!coreOnly,sellerRevocationPreservesBuyerAccess:!coreOnly,syntheticServicesWithdrawn:!coreOnly,magicLinkUiGate:'PENDING_BROWSER_CAPTURE',syntheticServicesRetired:!coreOnly,sellerRevoked:!coreOnly,buyerAccessPreserved:!coreOnly,limitations:[candidateSha?'Source binding verified against committed SHA '+candidateSha+' with clean source paths before and after the local fixture run.':'Final source SHA must be rebound after committing the reviewed candidate.','Browser/MagicLink UI/static network and native 200% zoom remain separate gates.','Facilitator internals are explicit local doubles; live service telemetry remains opaque.','Per-request maxima are observations with synthetic RPC footprints, not guarantees for live payloads.']};
  report.hostedContractCheckModule={buyer:buyerContractChecks,deliveredSeller:deliveredContractReplays,failedSeller:failedContractReplays};
  await mkdir('docs/evidence/sprint-x402-agent',{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,sourceSha,buildId:report.buildId,totals,counts:report.counts,storagePeaks,projectedStoragePeaks,closing:{sellerRevoked:!coreOnly,buyerAccessPreserved:!coreOnly,syntheticServicesRetired:!coreOnly}}));
} catch(error){
  await mkdir('docs/evidence/sprint-x402-agent',{recursive:true});await writeFile(reportPath,JSON.stringify({status:coreOnly?'STOPPED_NATIVE_X402_CORE_LOCAL':'STOPPED_NATIVE_X402_LOCAL',reason:'NATIVE_ASSERTION_OR_BOUND_FAILURE',automaticRetries:0,remoteRequests:0,observed:{applicationApiRequests:apiRequests,redisRestExchanges:redisRequests,redisCommandsUpperBound,storedBytes:maximumStoredBytes,facilitatorSettlements,rpcRequests},storageAllocation:allocation,storagePeaks,canExecute:false},null,2)+'\n');throw error;
} finally {
  await client?.close().catch(() => {}); await stop();
  relay.closeAllConnections(); await new Promise(done => relay.close(done)); providerServer.closeAllConnections(); await new Promise(done => providerServer.close(done));
  if (priorProviderEnv.enabled === undefined) delete process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED; else process.env.BAZAAR_MARKETPLACE_TEXT_ENABLED = priorProviderEnv.enabled;
  if (priorProviderEnv.token === undefined) delete process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256; else process.env.BAZAAR_MARKETPLACE_WORKER_TOKEN_SHA256 = priorProviderEnv.token;
  if(priorProviderEnv.proof===undefined)delete process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF;else process.env.BAZAAR_MARKETPLACE_CONTROL_PROOF=priorProviderEnv.proof;
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('bazaar-x402-native-double-')); await rm(directory, {recursive: true, force: true});
}
