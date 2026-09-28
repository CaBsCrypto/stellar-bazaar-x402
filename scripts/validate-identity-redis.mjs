// Explicit operator runner. No dotenv, signer, payments, retries, deletion, scans or remote deployment.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, realpathSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { preparePrivateDirectory, savePrivatePair, verifyPrivateDirectory } from './history-private-files.mjs';
import { generateHistoryKeypair, authenticateHistory } from '../lib/operation-history-auth.ts';
import { createHistoryStore, APPEND_OPERATION_LUA } from '../lib/operation-history-store.ts';
import { createHistoryHandlers } from '../lib/operation-history-http.ts';
import { createDeliverableStore, RESERVE_DELIVERY_LUA } from '../lib/deliverable-store.ts';
import { createDeliverableHandlers } from '../lib/deliverable-http.ts';
import { createActivityHandlers } from '../lib/activity-http.ts';
import { reviewDeliveries } from '../lib/review-deliveries.ts';
const [mode, directory, envFile, portArg='3262', upstreamArg='3219'] = process.argv.slice(2);
if (!['prepare','preflight','seed','check','serve'].includes(mode) || !directory) throw Error('Usage: validate-identity-redis.mjs prepare <new-private-dir> | preflight|seed|check|serve <private-dir> <env-file> [port] [upstream]');
const hash=x=>createHash('sha256').update(x).digest('hex');
const account=c=>({ownerId:c.ownerId,readTokenHash:c.readTokenHash,writeTokenHash:c.writeTokenHash});
if(mode==='prepare') {
 const root=preparePrivateDirectory(directory), a=generateHistoryKeypair(), b=generateHistoryKeypair();
 savePrivatePair(preparePrivateDirectory(resolve(root,'a')),a); savePrivatePair(preparePrivateDirectory(resolve(root,'b')),b);
 writeFileSync(resolve(root,'config.json'),JSON.stringify([account(a),account(b)]),{flag:'wx',mode:0o600});
 writeFileSync(resolve(root,'state.json'),JSON.stringify({version:1,owners:[a.ownerId,b.ownerId],operationId:'identity-'+randomUUID(),versionId:'identity-'+randomUUID(),requests:0,writeBytes:0,preflight:false,uncertain:false,seedStarted:false}),{flag:'wx',mode:0o600});
 console.log('Prepared private synthetic accounts; zero network requests.');
} else {
 const root=realpathSync(directory), repo=realpathSync(fileURLToPath(new URL('..',import.meta.url))), rel=relative(repo,root);
 if(rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))) throw Error('Private state must be outside repository');
 verifyPrivateDirectory(root);
 const lock=resolve(root,'runner.lock'), fd=openSync(lock,'wx',0o600); let server;
 const read=name=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
 const save=state=>{const path=resolve(root,'state.json');writeFileSync(path+'.next',JSON.stringify(state),{mode:0o600});renameSync(path+'.next',path);};
 try {
 const state=read('state.json');
 assert.equal(state.version,1); assert.equal(typeof state.preflight,'boolean'); assert.equal(typeof state.seedStarted,'boolean'); assert.equal(typeof state.uncertain,'boolean'); assert.match(state.operationId,/^identity-[a-f0-9-]{36}$/); assert.match(state.versionId,/^identity-[a-f0-9-]{36}$/); assert.equal(state.owners.length,2); assert.notEqual(...state.owners);
 assert(Number.isInteger(state.requests)&&state.requests>=0&&state.requests<=200); assert(Number.isInteger(state.writeBytes)&&state.writeBytes>=0&&state.writeBytes<=100000);
 const groups=state.owners.map(owner=>{assert.match(owner,/^user_[a-f0-9]{16}$/);const s=hash(owner);return [`bazaar:history:v1:{${s}}:records`,`bazaar:history:v1:{${s}}:index`,`bazaar:deliveries:v1:{${s}}:versions`,`bazaar:deliveries:v1:{${s}}:bytes`,`bazaar:deliveries:v1:{${s}}:index`];});
 const allowed=new Set(groups.flat());
 const vars={};
 for(const line of readFileSync(envFile,'utf8').split(/\r?\n/)){const m=/^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|KV_REST_API_URL|KV_REST_API_TOKEN)=(.*)$/.exec(line.trim());if(m) vars[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}
 const endpoint=new URL(vars.UPSTASH_REDIS_REST_URL??vars.KV_REST_API_URL), token=vars.UPSTASH_REDIS_REST_TOKEN??vars.KV_REST_API_TOKEN;
 if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.upstash.io')||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||!token) throw Error('Invalid Redis endpoint');
 const binding=hash(endpoint.origin);if(state.endpointHash&&state.endpointHash!==binding)throw Error('Redis instance changed');state.endpointHash=binding;save(state);
 // Count and persist BEFORE sending. A crashed process leaves the lock and uncertain marker for operator inspection.
 async function command(parts,keys,write=false) {
  assert(keys.every(key=>allowed.has(key))); if(state.requests>=200)throw Error('Request budget exhausted');
  const bytes=write?Buffer.byteLength(JSON.stringify(parts))*2+4096:0;
  if(write&&(!state.preflight||state.uncertain||state.writeBytes+bytes>100000))throw Error('Write blocked');
  state.requests++;state.writeBytes+=bytes;if(write)state.uncertain=true;save(state);
  try {
   const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(parts),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error(); const value=await response.json();if(value.error||!Object.hasOwn(value,'result'))throw Error();
   if(write){
    const result=value.result;
    if(!Array.isArray(result)||!['created','existing'].includes(result[0])||result.length!==2)throw Error();
    const saved=typeof result[1]==='string'?JSON.parse(result[1]):result[1];
    const argc=3+Number(parts[2]), args=parts.slice(argc);
    if(!saved||saved.digest!==args[1]||!saved.record||typeof saved.record!=='object')throw Error();
    const history=parts[1]===APPEND_OPERATION_LUA;
    if(history?saved.record.clientOperationId!==state.operationId:saved.record.manifest?.versionId!==state.versionId)throw Error();
    state.uncertain=false;save(state);
   }return value.result;
  }catch{if(write){state.uncertain=true;save(state);}throw Error('Redis request failed; no retry permitted');}
 }
 const redis={
  async eval(script,keys,args){
   const history=script===APPEND_OPERATION_LUA,delivery=script===RESERVE_DELIVERY_LUA;
   if(!history&&!delivery)throw Error('Lua not allowed');
   const expected=groups[0].slice(history?0:2,history?2:5);assert.deepEqual(keys,expected);
   assert.equal(args[0],history?state.operationId:state.versionId);
   return command(['EVAL',script,keys.length,...keys,...args],keys,true);
  },
  async lrange(key,start,end){assert(allowed.has(key)&&key.endsWith(':index'));assert.equal(start,0);assert(Number.isInteger(end)&&end>=0&&end<=999);return command(['LRANGE',key,start,end],[key]);},
  async hmget(key,...ids){assert(allowed.has(key)&&(key.endsWith(':records')||key.endsWith(':versions')));assert(ids.length>0&&ids.every(id=>id===state.operationId||id===state.versionId));const values=await command(['HMGET',key,...ids],[key]);assert(Array.isArray(values)&&values.length===ids.length);return Object.fromEntries(ids.map((id,i)=>[id,values[i]]));},
 };
 const auth=(header,write)=>authenticateHistory(header,write,readFileSync(resolve(root,'config.json'),'utf8'));
 const store=createHistoryStore(redis), deliveryStore=createDeliverableStore(redis);
 const operations=createHistoryHandlers({authenticate:auth,store:()=>store});
 const deliveries=createDeliverableHandlers({auth,history:()=>store,store:()=>deliveryStore,objects:()=>{throw Error('Files disabled');}});
 const activity=createActivityHandlers({authenticate:auth,operations:()=>store,events:()=>({all:async()=>[]})});
 const a=read('a/credentials.json'),b=read('b/credentials.json');assert.deepEqual([a.ownerId,b.ownerId],state.owners);
 const req=(path,credential,body)=>new Request('http://127.0.0.1'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(mode==='preflight') {
  if(state.seedStarted||state.uncertain)throw Error('Preflight cannot reset an attempted seed');
  const exists=await command(['EXISTS',...allowed],[...allowed]);assert.equal(exists,0,'Synthetic key collision; no write permitted');state.preflight=true;save(state);
 } else if(mode==='seed') {
  if(!state.preflight||state.seedStarted||state.uncertain)throw Error('Seed already attempted or not cleared');state.seedStarted=true;save(state);
  const input={clientOperationId:state.operationId,mode:'mock',agentId:'synthetic-identity-agent',service:{id:'identity-report',title:'Informe sintético de identidad',provider:'Piloto aislado',url:'https://example.invalid'},payment:{status:'not-requested',network:'stellar:testnet',asset:'USDC',amountAtomic:'0',recipient:'G'+'A'.repeat(55)},delivery:{status:'reported-delivered',result:{summary:'Ejemplo sintético; ninguna compra.'}}};
  const manifest=structuredClone(reviewDeliveries.find(x=>x.manifest.content.kind==='report').manifest);manifest.versionId=state.versionId;manifest.deliveryId=state.versionId;manifest.title='Informe sintético de identidad';manifest.summary='Almacenamiento de ejemplo; sin compra.';assert.equal(manifest.files.length,0);
  state.operationInput=input;state.deliveryInput={operationId:state.operationId,manifest};save(state);
  const op=await operations.POST(req('/api/operations',a.writeToken,state.operationInput));assert.equal(op.status,201);state.operation=(await op.json()).record;save(state);
  const delivery=await deliveries.POST(req('/api/deliveries',a.writeToken,state.deliveryInput));assert.equal(delivery.status,201);state.delivery=(await delivery.json()).record;save(state);
 } else if(mode==='check') {
  if(!state.operation||!state.delivery) {
   const recoveredOperations=await store.list(state.owners[0]), recoveredDeliveries=await deliveryStore.list(state.owners[0],state.operationId);
   state.recoveryObserved={operations:recoveredOperations,deliveries:recoveredDeliveries};save(state);
   console.log(JSON.stringify({recoveryOnly:true,operations:recoveredOperations.length,deliveries:recoveredDeliveries.length,uncertain:state.uncertain}));
   throw Error('Read-only recovery evidence saved privately; write block preserved and operator reconciliation required');
  }
  for(const [label,credentials] of [['a',a],['b',b]]) {
   const own=await operations.GET(req('/api/operations',credentials.readToken));assert.equal(own.status,200);assert.deepEqual((await own.json()).records,label==='a'?[state.operation]:[]);
   const data=await deliveries.GET(req('/api/deliveries?operationId='+state.operationId,credentials.readToken));assert.equal(data.status,label==='a'?200:404);if(label==='a')assert.deepEqual((await data.json()).versions,[state.delivery]);
  }
  const configPath=resolve(root,'config.json'), originalConfig=readFileSync(configPath,'utf8');
  const replaceConfig=value=>writeFileSync(configPath,JSON.stringify(value),{mode:0o600});
  const originalAccounts=JSON.parse(originalConfig);
  assert.equal(auth('Bearer '+a.readToken,false).ownerId,a.ownerId);
  assert.equal(auth('Bearer '+a.writeToken,true).ownerId,a.ownerId);
  try {
   const before=state.requests;
   assert.equal((await operations.POST(req('/api/operations',a.readToken,{}))).status,403);
   assert.equal((await operations.GET(req('/api/operations','bz_read_'+'f'.repeat(48)))).status,401);
   assert.equal((await operations.POST(req('/api/operations',a.writeToken,{...state.operationInput,ownerId:b.ownerId}))).status,400);
   assert.equal((await deliveries.POST(req('/api/deliveries',a.writeToken,{...state.deliveryInput,ownerId:b.ownerId}))).status,400);
   for(const invalid of [{},[],[account(a),account(a)]]) {
    replaceConfig(invalid);assert.equal((await operations.GET(req('/api/operations',a.readToken))).status,503);
   }
   writeFileSync(configPath,'{',{mode:0o600});assert.equal((await operations.GET(req('/api/operations',a.readToken))).status,503);
   assert.equal(state.requests,before,'Invalid authorization must not access Redis');
   replaceConfig(originalAccounts);
   if(!state.uncertain) {
    assert(state.operationInput&&state.deliveryInput,'Missing original seed inputs');
    const repeatedOperation=await operations.POST(req('/api/operations',a.writeToken,state.operationInput));assert.equal(repeatedOperation.status,200);assert.deepEqual((await repeatedOperation.json()).record,state.operation);
    const repeatedDelivery=await deliveries.POST(req('/api/deliveries',a.writeToken,state.deliveryInput));assert.equal(repeatedDelivery.status,200);assert.deepEqual((await repeatedDelivery.json()).record,state.delivery);
   }
   const next=generateHistoryKeypair(a.ownerId), revised=originalAccounts.map(x=>x.ownerId===a.ownerId?{...x,readTokenHash:next.readTokenHash}:x);
   replaceConfig(revised);
   const readRotated=state.requests;assert.equal((await operations.GET(req('/api/operations',a.readToken))).status,401);assert.equal(state.requests,readRotated);
   assert.equal(auth('Bearer '+a.writeToken,true).ownerId,a.ownerId);
   const retrieved=await deliveries.GET(req('/api/deliveries?operationId='+state.operationId,next.readToken));assert.equal(retrieved.status,200);assert.deepEqual((await retrieved.json()).versions,[state.delivery]);
   revised.find(x=>x.ownerId===a.ownerId).writeTokenHash=next.writeTokenHash;replaceConfig(revised);
   const writeRotated=state.requests;assert.equal((await operations.POST(req('/api/operations',a.writeToken,{}))).status,401);assert.equal(state.requests,writeRotated);
   assert.equal(auth('Bearer '+next.writeToken,true).ownerId,a.ownerId);assert.equal(auth('Bearer '+next.readToken,false).ownerId,a.ownerId);
   replaceConfig(originalAccounts.filter(x=>x.ownerId!==a.ownerId));
   const revoked=state.requests;for(const credential of [a.readToken,a.writeToken,next.readToken,next.writeToken])assert.equal((await operations.GET(req('/api/operations',credential))).status,401);assert.equal(state.requests,revoked);
   // Test-only temporary mutation; restore exactly the original synthetic configuration below.
  } finally {writeFileSync(configPath,originalConfig,{mode:0o600});}
  const finalRecords=await store.list(a.ownerId);assert.deepEqual(finalRecords,[state.operation]);
  assert.deepEqual(await deliveryStore.list(a.ownerId,state.operationId),[state.delivery]);
 } else {
  const port=Number(portArg),upstream=Number(upstreamArg);assert([port,upstream].every(x=>Number.isInteger(x)&&x>=1024&&x<=65535)&&port!==upstream);
  server=http.createServer(async(incoming,out)=>{try{
   const origin='http://127.0.0.1:'+port,url=new URL(incoming.url,origin);if(url.origin!==origin||incoming.headers.host!==`127.0.0.1:${port}`||incoming.method!=='GET'){out.writeHead(403).end();return;}
   const handler=url.pathname==='/api/operations'?operations:url.pathname==='/api/deliveries'?deliveries:url.pathname==='/api/activity'?activity:null;
   let response;if(handler)response=await handler.GET(new Request(url,{headers:incoming.headers}));
   else if(url.pathname==='/history'||url.pathname.startsWith('/_next/')||url.pathname.startsWith('/examples/')||url.pathname==='/favicon.ico')response=await fetch('http://127.0.0.1:'+upstream+url.pathname+url.search,{redirect:'manual'});
   else response=new Response(null,{status:403});
   out.writeHead(response.status,{...Object.fromEntries([...response.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding'].includes(k))),'cache-control':'no-store','referrer-policy':'no-referrer'});out.end(Buffer.from(await response.arrayBuffer()));
  }catch{out.writeHead(503).end('Pilot unavailable');}});
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));console.log('Loopback pilot ready; read-only HTTP, synthetic inline data, activity not externally persisted.');
  await new Promise(resolve=>{const stop=()=>{server.closeAllConnections();server.close(resolve);};const timer=setTimeout(stop,15*60*1000);process.once('SIGINT',()=>{clearTimeout(timer);stop();});process.once('SIGTERM',()=>{clearTimeout(timer);stop();});});
 }
 console.log(JSON.stringify({mode,requests:state.requests,writeBytes:state.writeBytes,uncertain:state.uncertain,externalFiles:false,payments:0}));
 } finally {if(server?.listening)server.close();closeSync(fd);unlinkSync(lock);}
}
