import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {spawnSync} from 'node:child_process';

// Reuse the maintained signed offline protocol fixture in memory. Its stores run
// through the real meter middleware; no fixture file or remote state is modified.
const script=fileURLToPath(import.meta.url),ownRoot=resolve(dirname(script),'..');
const sourceArg=process.argv.indexOf('--source-root');
const sourceRoot=sourceArg<0?ownRoot:resolve(process.argv[sourceArg+1]);
if(!process.argv.includes('--worker')){
 const reports=[];
 for(const scenario of ['paid','first-signed','rpc-recovery','wide-quota']){
  const result=spawnSync(process.execPath,['--experimental-strip-types',script,'--worker',scenario,'--source-root',sourceRoot],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  reports.push(JSON.parse(result.stdout.trim().split('\n').at(-1)));
 }
 console.log(JSON.stringify({status:'PASS',realMeterMiddleware:true,realQuotaAndBudgetStores:true,scenarios:reports,externalNetworkRequests:0}));
}else{
 const scenario=process.argv[process.argv.indexOf('--worker')+1];
 Object.assign(process.env,{BAZAAR_OPERATIONAL_METER:'false',BAZAAR_OPERATIONAL_BUDGET:'false',BAZAAR_ACCEPTANCE_METER:'false'});
 globalThis.fetch=async()=>{throw Error('Offline envelope fixture forbids network transport');};
 // A sibling integration checkout may be read to verify its uncommitted protocol
 // against this candidate envelope. Normal runs resolve both to this checkout.
 registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('/operational-envelopes.ts')||specifier==='./operational-envelopes.ts')return {url:pathToFileURL(resolve(ownRoot,'lib/operational-envelopes.ts')).href,shortCircuit:true};
  return next(specifier,context);
 }});
 const fixturePath=resolve(sourceRoot,'scripts/test-marketplace-x402.mjs');
 let fixture=readFileSync(fixturePath,'utf8');
 assert.ok(fixture.includes("import {capacityRedis}"),'Run against the shared-capacity integration source');
 const paidAt=fixture.indexOf('const paid=');assert.ok(paidAt>0);
 fixture=fixture.slice(0,paidAt);
 fixture=fixture.replace('const redis=capacityRedis(', 'const rawRedis=capacityRedis(');
 const marketAt=fixture.indexOf('const market=createMarketStore');assert.ok(marketAt>0);
 fixture=fixture.slice(0,marketAt)+`
let meterMiddleware,transportActive=false,quotaConflicts=7;
meteredRedis({use(fn){meterMiddleware=fn;}});
async function transport(body,action){if(!transportActive)return action();return (await meterMiddleware({body},async()=>({result:await action()}))).result;}
const redis={get:key=>transport(['get',key],()=>rawRedis.get(key)),eval:(script,keys,args)=>transport(['eval',script,keys.length,...keys,...args],async()=>{
 if(script===READ_WORKSPACE_LUA)return keys.map(key=>data.get(key)??'');
 if(script===COMMIT_WORKSPACE_LUA){if(quotaConflicts-->0)return 0;if(keys.some((key,i)=>(data.get(key)??'')!==args[i]))return 0;data.set(keys[0],args[3]);if(args[4])data.set(keys[1],args[4]);data.set(keys[2],'workspace-v1');return 1;}
 if(script===OPERATIONAL_BUDGET_CAS){const [key]=keys;if(args[0]==='missing'?data.has(key):data.get(key)!==args[1])return 0;data.set(key,args[2]);return 1;}
 return rawRedis.eval(script,keys,args);
})};
`+fixture.slice(marketAt);
 fixture=fixture.replace("agentId:'agent-'+owner", "agentId:'agent_'+owner.repeat(32)");
 fixture=`
import {measuredHandler,meteredRedis} from '../lib/acceptance-meter.ts';
import {createOperationalBudgetStore,setOperationalBudgetStoreForTests,OPERATIONAL_BUDGET_CAS} from '../lib/operational-budget.ts';
import {createRedisWorkspaceStore,READ_WORKSPACE_LUA,COMMIT_WORKSPACE_LUA} from '../lib/workspace-store.ts';
import {OPERATIONAL_TRANSPORT_ENVELOPES} from '../lib/operational-envelopes.ts';
`+fixture+`
const workspacePrefix=prefix.replace('bazaar-market:','bazaar-workspace:'),tag=workspacePrefix.split(':')[1],workspaceRoot=workspacePrefix+':{'+tag+'}';
const humanHash=sha(tokens[1]),agentHash=sha(tokens[0]),bootstrapHash=sha('offline-bootstrap-fixture');
const document={version:1,ownerId:buyer.ownerId,revision:randomUUID(),conversations:[],tasks:[],operations:[],events:[]},documentRaw=JSON.stringify(document);
const meta={creationId:randomUUID(),workspaceId:buyer.workspaceId,ownerId:buyer.ownerId,agentId:buyer.agentId,bootstrapHash,initialHumanHash:humanHash,initialAgentHash:agentHash,humanHash,agentHash,retiredHashes:[],accessIntents:[],generation:1,revoked:false,createdAt:new Date().toISOString(),documentRevision:document.revision,documentBytes:Buffer.byteLength(documentRaw)};
data.set(workspaceRoot+':registry',JSON.stringify({version:1,revision:randomUUID(),workspaces:[meta],creationWindows:[],requestWindows:[]}));
if('${scenario}'==='wide-quota'){
 const registry=JSON.parse(data.get(workspaceRoot+':registry'));
 registry.creationWindows=Array.from({length:7000},(_,i)=>({key:'ip:'+sha(String(i))+':'+Math.floor(Date.now()/3600000),count:1,until:Date.now()+3600000}));
 const raw=JSON.stringify(registry);assert.ok(Buffer.byteLength(raw)>800000&&Buffer.byteLength(raw)<1048576);data.set(workspaceRoot+':registry',raw);
}
data.set(workspaceRoot+':owner:'+buyer.ownerId,documentRaw);data.set(workspaceRoot+':initialized','workspace-v1');
const realWorkspace=createRedisWorkspaceStore(redis,workspacePrefix,()=>({ownerIds:[],hashes:[]}));setWorkspaceStoreForTests(realWorkspace);
const now=Date.now(),checkpoint={version:1,epoch:randomUUID(),observedAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),evidence:'offline-protocol-envelope',remaining:{requests:100000,redisRequests:1000000,redisCommands:1000000,outboundBytes:100000000000,inboundBytes:100000000000,externalRequests:100000}};
const budget=createOperationalBudgetStore(redis,workspacePrefix,()=>checkpoint);setOperationalBudgetStoreForTests(budget);
Object.assign(process.env,{BAZAAR_OPERATIONAL_METER:'true',BAZAAR_OPERATIONAL_BUDGET:'true',BAZAAR_ACCEPTANCE_METER:'false',BAZAAR_WORKSPACE_PREFIX:workspacePrefix});
const log=console.info;console.info=()=>{};
// Exercise the actual bounded facilitator/RPC transports using local HTTP doubles.
const boundedFacilitator=createMarketX402Facilitator({apiKey:'offline-fixture',fetcher:async(url,init)=>{const body=JSON.parse(init.body);return Response.json(url.endsWith('/verify')?await facilitator.verify(body.paymentPayload,body.paymentRequirements):await facilitator.settle(body.paymentPayload,body.paymentRequirements));}});
const boundedRpc=createMarketX402Rpc({fetcher:async(_url,init)=>{const body=JSON.parse(init.body);return Response.json({jsonrpc:'2.0',id:'market-x402-read',result:await rpc.transaction(body.params.hash)});}});
setMarketX402DependenciesForTests({store:privateStore,facilitator:boundedFacilitator,rpc:boundedRpc});
if('${scenario}'==='first-signed')data.delete(prefix+':x402-settlements:state');
if('${scenario}'==='rpc-recovery')rpcFailure=true;
transportActive=true;
const measuredPayment=measuredHandler(marketX402Handler),paid=await measuredPayment(request('/api/market/orders/'+order.operationId+'/x402',tokens[0],{},signature),order.operationId);
const paidBody=await paid.json(),paidRest=Number(paid.headers.get('x-bazaar-redis-requests')),paidCommands=Number(paid.headers.get('x-bazaar-redis-commands-upper-bound'));
const paidOutboundBytes=Number(paid.headers.get('x-bazaar-redis-outbound-payload-bytes')),paidInboundBytes=Number(paid.headers.get('x-bazaar-redis-inbound-payload-bytes'));
assert.equal(quotaConflicts,-1,'Seven definite quota conflicts plus the eighth successful native attempt were reached');
assert.ok(paidRest>34,'Fixture must detect the former 34-REST cutoff');
assert.ok(paidRest<=OPERATIONAL_TRANSPORT_ENVELOPES.authenticated.redis);
assert.ok(paidCommands<=OPERATIONAL_TRANSPORT_ENVELOPES.authenticated.commandsUpperBound);
assert.ok(paidOutboundBytes<=OPERATIONAL_TRANSPORT_ENVELOPES.authenticated.outboundPayloadBytes);
assert.ok(paidInboundBytes<=OPERATIONAL_TRANSPORT_ENVELOPES.authenticated.inboundPayloadBytes);
if('${scenario}'==='wide-quota')assert.ok(paidOutboundBytes>9*1048576,'Native bounded quota retries must detect the former 9-MiB cutoff');
assert.equal(verifyCalls,1);assert.equal(settleCalls,1);assert.equal(rpcCalls,1);
assert.equal(paid.headers.get('x-bazaar-external-facilitator'),'2');assert.equal(paid.headers.get('x-bazaar-external-rpc'),'1');
let recoveryRest=0;
if('${scenario}'==='rpc-recovery'){
 assert.equal(paid.status,409);assert.equal(paidBody.error.code,'X402_PAYMENT_OUTCOME_UNCERTAIN');rpcFailure=false;quotaConflicts=7;
 const recovered=await measuredHandler(marketHandlers.action)(request('/api/market/orders/'+order.operationId,tokens[0],{action:'reconcile'}),order.operationId);
 assert.equal(recovered.status,200,JSON.stringify(await recovered.clone().json()));assert.equal((await recovered.json()).order.phase,'paid');
 recoveryRest=Number(recovered.headers.get('x-bazaar-redis-requests'));assert.ok(recoveryRest<=OPERATIONAL_TRANSPORT_ENVELOPES.recovery.redis);
 assert.equal(recovered.headers.get('x-bazaar-external-facilitator'),'0');assert.equal(recovered.headers.get('x-bazaar-external-rpc'),'1');assert.equal(settleCalls,1);
}else{assert.equal(paid.status,202,JSON.stringify(paidBody));assert.equal(paidBody.order.phase,'paid');assert.equal(paid.headers.get('x-bazaar-redis-uncertain'),'false');}
transportActive=false;console.info=log;
const summary=await budget.read();assert.equal(summary.profiles.recovery.used.requests,'${scenario}'==='rpc-recovery'?2:1);assert.equal(summary.profiles.authenticated.used.requests,'${scenario}'==='first-signed'?2:1);
console.log(JSON.stringify({scenario:'${scenario}',status:'PASS',paidRest,paidCommands,paidOutboundBytes,paidInboundBytes,recoveryRest,verifyCalls,settleCalls,rpcCalls,quotaAttempts:8,remoteRequests:0}));
`;
 fixture=fixture.replace(/from\s+(['"])([^'"]+)\1/g,(_all,_quote,specifier)=>{
  const url=specifier.startsWith('.')?pathToFileURL(resolve(dirname(fixturePath),specifier)).href:import.meta.resolve(specifier);
  return 'from '+JSON.stringify(url);
 });
 try{await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));}
 catch(error){console.error(JSON.stringify({scenario,error:error.name,message:error.message}));process.exitCode=1;}
}
