import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Keypair} from '@stellar/stellar-sdk';
import {createSellerCard,assertSellerCard,sellerHash as hash,sellerCanonical as canonical} from '../examples/seller-service-card.mjs';
import {createSellerIntent,executeSellerIntent,deliverSellerIntent,claimSellerIntent,recoverSellerIntent,uncertainSellerIntent,failSellerIntent,watchSellerOrders,listSellerOrders,listSellerServices} from '../examples/seller-marketplace-worker.mjs';
import {createSellerHttpAdapter} from '../examples/seller-http-adapter.mjs';
import {createSellerRuntime} from '../examples/seller-runtime.mjs';
import {withSellerMcp,SELLER_BAZAAR_ORIGIN,SELLER_BAZAAR_ENDPOINT,sellerBazaarOrigin,validateSellerConfiguration,sellerSetupConfiguration,parseSellerCliArguments} from '../examples/marketplace-seller-mcp.mjs';
import {openPortableSecretStore} from '../examples/buyer-portable-secret-store.mjs';
import {computeCanonicalServiceCardHash} from '../lib/canonical-service-card.ts';
import {marketCard} from '../lib/marketplace.ts';

const origin='https://seller.example.com',ownerId='ow_local_seller',agentId=randomUUID(),providerAccess='p'.repeat(43);
const destination=Keypair.fromRawEd25519Seed(Buffer.alloc(32,1)).publicKey();
const publication=createSellerCard({id:'external-text',name:'External text',description:'Returns text from an existing participant service.',providerName:'Local participant',providerOrigin:origin,destination});
assert.equal(publication.cardHash,computeCanonicalServiceCardHash(publication.card));assert.equal(Object.hasOwn(publication.card,'cardHash'),false);assert.deepEqual(marketCard(publication.card),publication.card);
const result=body=>({isError:false,structuredContent:body,content:[]});
function fixture(){
 const intent=createSellerIntent({operationId:randomUUID(),cardHash:publication.cardHash,serviceId:publication.card.id,providerOrigin:origin,ownerId,agentId});
 let order={operationId:intent.operationId,cardHash:publication.cardHash,serviceId:intent.serviceId,card:structuredClone(publication.card),sellerOwnerId:ownerId,buyerOwnerId:'ow_buyer',perspective:'sale',phase:'paid',input:{prompt:'Texto privado'},inputHash:hash(canonical({prompt:'Texto privado'})),paymentProtocol:'x402-stellar-exact-v2',amount:'0.01',destination,settlement:publication.card.payment.identity,transactionHash:'b'.repeat(64),paymentVerifiedAt:new Date().toISOString()};
 let providerCalls=0,loseClaim=false,loseProvider=false,loseDelivery=false;const saved=[],calls=[];
 const options={persistIntent:async value=>saved.push(structuredClone(value)),adapter:{execute:async packet=>{providerCalls++;assert.equal(saved.at(-1).phase,'provider-started');assert.equal(packet.operationId,intent.operationId);assert.equal(packet.attemptId,intent.attemptId);if(loseProvider)throw Error('LOST_PROVIDER');return {text:'Frozen output'};}},callTool:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});if(name==='get_market_order')return result({order:structuredClone(order)});if(name==='list_market_orders')return result({orders:[structuredClone(order)],nextCursor:null});
  if(name==='claim_market_order'){order={...order,phase:'executing',attemptId:args.attemptId,agentId};if(loseClaim)throw Error('LOST_CLAIM');}
  else if(name==='deliver_market_order'){order={...order,phase:'delivered',delivery:{text:args.text,sha256:hash(args.text),reference:'bazaar-order:'+intent.operationId}};if(loseDelivery)throw Error('LOST_DELIVERY');}
  else if(name==='uncertain_market_order')order={...order,phase:'execution-uncertain',executionUncertainty:args.reason};
  else if(name==='fail_market_order')order={...order,phase:'delivery-failed',failure:args.reason};else throw Error('UNEXPECTED_TOOL');return result({order:structuredClone(order)});
 }};
 return {intent,options,saved,calls,get order(){return order;},set order(value){order=value;},get providerCalls(){return providerCalls;},set loseClaim(value){loseClaim=value;},set loseProvider(value){loseProvider=value;},set loseDelivery(value){loseDelivery=value;}};
}
let scenarios=1;
const successful=fixture();await executeSellerIntent(successful.intent,successful.options);assert.deepEqual(successful.saved.map(v=>v.phase),['claim-started','claimed','provider-started','generated','delivery-started','delivered']);await assert.rejects(executeSellerIntent(successful.intent,successful.options),/EXISTING_INTENT/);await deliverSellerIntent(successful.intent,successful.options);assert.equal(successful.providerCalls,1);scenarios++;
const lost=fixture();lost.loseProvider=true;await assert.rejects(executeSellerIntent(lost.intent,lost.options),/EXECUTION_UNCERTAIN/);assert.equal(lost.intent.phase,'execution-uncertain');await assert.rejects(executeSellerIntent(lost.intent,lost.options),/EXISTING_INTENT/);await recoverSellerIntent(lost.intent,lost.options);await uncertainSellerIntent(lost.intent,lost.options);await failSellerIntent(lost.intent,lost.options,'Owner-confirmed failure');assert.equal(lost.providerCalls,1);assert.equal(lost.order.transactionHash,'b'.repeat(64));scenarios++;
const ack=fixture();ack.loseDelivery=true;await assert.rejects(executeSellerIntent(ack.intent,ack.options),/LOST_DELIVERY/);assert.equal(ack.intent.phase,'delivery-uncertain');assert.ok(ack.saved.some(v=>v.phase==='generated'&&v.textHash===hash(v.text)));await recoverSellerIntent(ack.intent,ack.options);assert.equal(ack.intent.phase,'delivered');ack.loseDelivery=false;await deliverSellerIntent(ack.intent,ack.options);assert.equal(ack.providerCalls,1);scenarios++;
const claimLost=fixture();claimLost.loseClaim=true;await assert.rejects(claimSellerIntent(claimLost.intent,claimLost.options),/LOST_CLAIM/);assert.equal(claimLost.intent.phase,'claim-started');assert.ok(claimLost.saved[0].binding);await recoverSellerIntent(claimLost.intent,claimLost.options);assert.equal(claimLost.intent.phase,'claimed');await executeSellerIntent(claimLost.intent,claimLost.options);assert.equal(claimLost.providerCalls,1);assert.equal(claimLost.calls.filter(v=>v.name==='claim_market_order').length,1);scenarios++;
const fresh=fixture();await failSellerIntent(fresh.intent,fresh.options,'Manual failure');assert.equal(fresh.providerCalls,0);scenarios++;
const prepared=fixture();assert.equal((await recoverSellerIntent(prepared.intent,prepared.options)).phase,'paid');assert.equal(prepared.intent.phase,'prepared');assert.equal(prepared.providerCalls,0);scenarios++;
for(const mutate of [o=>delete o.paymentVerifiedAt,o=>o.phase='awaiting-payment',o=>o.sellerOwnerId='ow_other',o=>o.perspective='purchase',o=>o.cardHash='a'.repeat(64),o=>o.inputHash='c'.repeat(64),o=>o.amount='0.02',o=>o.transactionHash='invalid',o=>o.card.payment.identity.issuer=destination,o=>o.card.payment.marketplace.resourceTemplate='/legacy',o=>o.destination=Keypair.random().publicKey()]){
 const v=fixture();const order=structuredClone(v.order);mutate(order);v.order=order;await assert.rejects(executeSellerIntent(v.intent,v.options));assert.equal(v.providerCalls,0);scenarios++;
}
const wrongAgent=fixture();await claimSellerIntent(wrongAgent.intent,wrongAgent.options);wrongAgent.order={...wrongAgent.order,agentId:randomUUID()};await assert.rejects(executeSellerIntent(wrongAgent.intent,wrongAgent.options),/CLAIM_CONFLICT/);assert.equal(wrongAgent.providerCalls,0);scenarios++;
const tampered=fixture();await executeSellerIntent(tampered.intent,tampered.options);tampered.intent.text+='changed';await assert.rejects(deliverSellerIntent(tampered.intent,tampered.options),/DELIVERY_NOT_FROZEN/);assert.equal(tampered.providerCalls,1);scenarios++;
const parallel=fixture();const running=executeSellerIntent(parallel.intent,parallel.options);await assert.rejects(executeSellerIntent(structuredClone(parallel.intent),parallel.options),/CONCURRENT_EXECUTION/);await running;assert.equal(parallel.providerCalls,1);scenarios++;
for(const crashPhase of ['provider-started','generated']){
 const v=fixture();let effect=0;v.options.adapter={execute:async()=>{effect++;return {text:'Freeze before delivery'};}};v.options.persistIntent=async snapshot=>{v.saved.push(structuredClone(snapshot));if(snapshot.phase===crashPhase)throw Error('SIMULATED_CRASH');};
 await assert.rejects(executeSellerIntent(v.intent,v.options),/SIMULATED_CRASH/);const snapshot=v.saved.at(-1);assert.equal(effect,crashPhase==='provider-started'?0:1);await assert.rejects(executeSellerIntent(snapshot,v.options),/EXISTING_INTENT/);assert.equal(effect,crashPhase==='provider-started'?0:1);scenarios++;
}
let polls=0,effects=0,sleeps=0;
assert.deepEqual(await watchSellerOrders({polls:10,poll:async()=>{polls++;return [{operationId:'same',phase:'paid'}];},processOrder:async()=>effects++,sleep:async ms=>{assert.equal(ms,60000);sleeps++;}}),{polls:10,executed:1,stopped:'bound'});assert.equal(polls,10);assert.equal(effects,1);assert.equal(sleeps,9);scenarios++;
const quota=Object.assign(Error('QUOTA'),{httpStatus:429,retryAfter:'60'});const stop=await watchSellerOrders({poll:async()=>{throw quota;},processOrder:async()=>{throw Error('NO_EXECUTION');},sleep:async()=>{throw Error('NO_RETRY');}});assert.equal(stop.stopped,'quota');assert.equal(stop.retryAfter,'60');assert.equal((await watchSellerOrders({poll:async()=>[{phase:'execution-uncertain'}],processOrder:async()=>{throw Error('NO_EXECUTION');}})).stopped,'uncertainty');await assert.rejects(watchSellerOrders({polls:11}));scenarios++;
let pages=0;const transport={callTool:async(name,args)=>{pages++;assert.equal(args.limit,20);if(pages===1)return result({orders:[{perspective:'sale',operationId:'one'}],nextCursor:'next'});assert.equal(args.cursor,'next');return result({orders:[{perspective:'purchase'},{perspective:'sale',operationId:'two'}],nextCursor:null});}};
const paged=await listSellerOrders(transport);assert.equal(pages,1);assert.equal(paged.orders.length,1);assert.equal(paged.nextCursor,'next');const nextPage=await listSellerOrders(transport,{cursor:paged.nextCursor});assert.equal(nextPage.orders.length,1);assert.equal(nextPage.nextCursor,null);scenarios++;
// Explicit page requests reach records beyond the former 100-item client bound.
const many=Array.from({length:121},(_,i)=>({perspective:'sale',operationId:'order-'+i,phase:i===120?'paid':'delivered'}));let cursor,total=0;
const large={callTool:async(name,args)=>{const start=Number(args.cursor??0),end=start+20,items=many.slice(start,end);return result({[name==='list_market_orders'?'orders':'services']:items,nextCursor:end<many.length?String(end):null});}};
do{const page=await listSellerOrders(large,{cursor});total+=page.orders.length;cursor=page.nextCursor??undefined;}while(cursor);assert.equal(total,121);scenarios++;
assert.equal((await listSellerServices(large,{cursor:'120'})).services.length,1);scenarios++;
let scan='100',advanced=0;const scanned=await watchSellerOrders({polls:2,poll:async()=>{const page=await listSellerOrders(large,{cursor:scan});return page.orders;},afterPage:async()=>{scan='120';advanced++;},processOrder:async order=>assert.equal(order.operationId,'order-120'),sleep:async()=>{}});assert.equal(scanned.executed,1);assert.equal(advanced,2);scenarios++;
let incorrectlyAdvanced=false;await watchSellerOrders({polls:1,poll:async()=>[{operationId:'uncertain',phase:'paid'}],processOrder:async()=>{throw Error('lost');},afterPage:async()=>incorrectlyAdvanced=true});assert.equal(incorrectlyAdvanced,false);scenarios++;
let requests=0;const agentAccess='a'.repeat(43);
await withSellerMcp({agentAccess,fetcher:async(url,init)=>{
 requests++;assert.equal(String(url),SELLER_BAZAAR_ENDPOINT);assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+agentAccess);
 if(init.method==='GET')return new Response(null,{status:405});const body=JSON.parse(init.body);assert.ok(!init.body.includes(agentAccess));
 if(body.method==='initialize')return Response.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'local-mock',version:'1'}}},{headers:{'mcp-session-id':'local'}});
 if(body.method==='notifications/initialized')return new Response(null,{status:202});
 if(body.method==='tools/call')return Response.json({jsonrpc:'2.0',id:body.id,result:result({orders:[],nextCursor:null})});throw Error('UNEXPECTED_TRANSPORT');
}},async options=>{assert.deepEqual(await listSellerOrders(options),{orders:[],nextCursor:null});assert.ok(options.requestCount()>=3);});assert.ok(requests>=3&&requests<=5);scenarios++;
let quotaRequests=0;await assert.rejects(withSellerMcp({agentAccess,fetcher:async()=>{quotaRequests++;return new Response(null,{status:429,headers:{'retry-after':'120'}});}},async()=>{throw Error('NO_ACTION');}),error=>error.httpStatus===429&&error.retryAfter==='120');assert.equal(quotaRequests,1);scenarios++;

// The Bazaar connection is independent of the provider origin and becomes part
// of the encrypted configuration. No credentials or network are used here.
const previewOrigin='https://stellar-bazaar-x402-synthetic.vercel.app';
const configuration={card:publication.card,cardHash:publication.cardHash,ownerId,agentId,
 allowedOrigins:[origin],controlProof:{method:'http-well-known',domain:new URL(origin).hostname}};
assert.equal(validateSellerConfiguration(configuration).bazaarOrigin,SELLER_BAZAAR_ORIGIN);
const previewConfiguration=sellerSetupConfiguration(configuration,previewOrigin);
assert.equal(previewConfiguration.bazaarOrigin,previewOrigin);
assert.deepEqual(validateSellerConfiguration(previewConfiguration),previewConfiguration);
assert.equal(previewConfiguration.card.url,origin);
assert.equal(sellerSetupConfiguration(previewConfiguration,previewOrigin).bazaarOrigin,previewOrigin);
assert.throws(()=>sellerSetupConfiguration(previewConfiguration,SELLER_BAZAAR_ORIGIN),/BAZAAR_ORIGIN_CONFLICT/);scenarios++;
assert.deepEqual(parseSellerCliArguments(['setup','private-store','public.json','--origin',previewOrigin,'--secret-stdin']),
 {args:['setup','private-store','public.json'],pipe:true,origin:previewOrigin});
assert.deepEqual(parseSellerCliArguments(['list','private-store','--secret-stdin']),{args:['list','private-store'],pipe:true,origin:undefined});
for(const args of [
 ['execute','private-store','saved-uuid','--origin',previewOrigin],
 ['setup','private-store','public.json','--origin',previewOrigin,'--origin',previewOrigin],
 ['setup','private-store','public.json','--origin'],
 ['setup','private-store','public.json','--origin='+previewOrigin],
 ['setup','private-store','public.json','--secret-stdin','--secret-stdin'],
])assert.throws(()=>parseSellerCliArguments(args));scenarios++;
for(const invalid of ['http://seller.example.com',previewOrigin+'/',previewOrigin+'/api/mcp',
 previewOrigin+'?secret=synthetic',previewOrigin+'#synthetic','https://user:password@seller.example.com',
 'https://seller.example.com:443','https://seller.example.com:444']){
 assert.throws(()=>sellerBazaarOrigin(invalid),/BAZAAR_HTTPS_ORIGIN_REQUIRED/);
 let rejectedCalls=0;await assert.rejects(withSellerMcp({agentAccess,origin:invalid,fetcher:async()=>{rejectedCalls++;throw Error('NOT_CALLED');}},async()=>{}),/BAZAAR_HTTPS_ORIGIN_REQUIRED/);
 assert.equal(rejectedCalls,0);
}scenarios++;
let previewRequests=0;
await withSellerMcp({agentAccess,origin:previewOrigin,fetcher:async(url,init)=>{
 previewRequests++;assert.equal(String(url),previewOrigin+'/api/mcp');assert.equal(init.redirect,'error');
 assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+agentAccess);
 if(init.method==='GET')return new Response(null,{status:405});const body=JSON.parse(init.body);
 assert.ok(!init.body.includes(agentAccess));
 if(body.method==='initialize')return Response.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'synthetic-preview',version:'1'}}});
 if(body.method==='notifications/initialized')return new Response(null,{status:202});
 if(body.method==='tools/call')return Response.json({jsonrpc:'2.0',id:body.id,result:result({orders:[],nextCursor:null})});
 throw Error('UNEXPECTED_TRANSPORT');
}},async options=>assert.deepEqual(await listSellerOrders(options),{orders:[],nextCursor:null}));
assert.ok(previewRequests>=3&&previewRequests<=5);scenarios++;
for(const substitution of [{url:origin+'/api/mcp',redirected:false},
 {url:previewOrigin+'/other',redirected:false},{url:previewOrigin+'/api/mcp?replacement=true',redirected:false},
 {url:previewOrigin+'/api/mcp',redirected:true}]){
 let redirectedCalls=0;
 await assert.rejects(withSellerMcp({agentAccess,origin:previewOrigin,fetcher:async()=>{
  redirectedCalls++;return {...substitution,status:200};
 }},async()=>{}),/MCP_REDIRECT_DENIED/);
 assert.equal(redirectedCalls,1);
}scenarios++;

const directory=await mkdtemp(join(tmpdir(),'bazaar-seller-test-'));const password=Buffer.from('private test password');let store;
try{
 store=await openPortableSecretStore({directory:join(directory,'store'),password,create:true});let calls=0;
 let runtimeClock=120000;const runtime=createSellerRuntime({providerAccess,store,adapter:{execute:async()=>{calls++;return {text:'Runtime frozen'};}},maxRequests:3,now:()=>runtimeClock});const operationId=randomUUID(),attemptId=randomUUID();const request=input=>new Request(origin+'/v1/marketplace-text',{method:'POST',headers:{authorization:'Bearer '+providerAccess,'content-type':'application/json'},body:JSON.stringify({operationId,attemptId,input})});
 const first=await runtime(request({prompt:'owned'}));assert.equal(first.status,200);const original=await first.json();const replay=await runtime(request({prompt:'owned'}));assert.deepEqual(await replay.json(),original);assert.equal(calls,1);assert.equal((await runtime(request({prompt:'changed'}))).status,409);assert.equal((await runtime(request({prompt:'owned'}))).status,429);assert.equal(calls,1);scenarios++;
 runtimeClock+=60000;assert.equal((await runtime(request({prompt:'owned'}))).status,200);assert.equal(calls,1);scenarios++;
 const failedId=randomUUID();const failed=createSellerRuntime({providerAccess,store,adapter:{execute:async()=>{calls++;throw Error('LOST');}}});const failedRequest=()=>new Request(origin+'/v1/marketplace-text',{method:'POST',headers:{authorization:'Bearer '+providerAccess},body:JSON.stringify({operationId:failedId,attemptId,input:{prompt:'owned'}})});assert.equal((await failed(failedRequest())).status,409);assert.equal((await failed(failedRequest())).status,409);assert.equal(calls,2);scenarios++;
 const lockName='seller.'+randomUUID(),release=await store.acquireLock(lockName);await assert.rejects(store.acquireLock(lockName),/STORE_LOCKED/);store.dispose();store=await openPortableSecretStore({directory:join(directory,'store'),password});await assert.rejects(store.acquireLock(lockName),/STORE_LOCKED/);await release();scenarios++;
 const entry=store.journal('crash.frozen');const lock=await store.acquireLock('crash.frozen');await entry.initialize({phase:'provider-started'});await entry.append({phase:'generated',text:'Frozen',textHash:hash('Frozen')});await lock();store.dispose();store=await openPortableSecretStore({directory:join(directory,'store'),password});assert.equal((await store.journal('crash.frozen').read()).phase,'generated');scenarios++;
 let httpCalls=0;const adapter=createSellerHttpAdapter({providerOrigin:origin,allowedOrigins:[origin],providerAccess,fetcher:async(url,init)=>{httpCalls++;assert.equal(url,origin+'/v1/marketplace-text');assert.equal(init.redirect,'error');const packet=JSON.parse(init.body);return Response.json({operationId:packet.operationId,attemptId:packet.attemptId,text:'HTTP frozen',textHash:hash('HTTP frozen'),contentType:'text/plain'});}});assert.deepEqual(await adapter.execute({operationId,attemptId,input:{prompt:'owned'}}),{text:'HTTP frozen'});assert.equal(httpCalls,1);assert.throws(()=>createSellerHttpAdapter({providerOrigin:origin,allowedOrigins:['https://other.example.com'],providerAccess}),/ALLOWLIST/);scenarios++;
 const corrupt=join(directory,'store','crash.frozen.journal');await writeFile(corrupt,(await readFile(corrupt)).subarray(0,-1));await assert.rejects(store.journal('crash.frozen').read(),/JOURNAL_UNCONFIRMED/);scenarios++;
 for(const crashAt of ['before','after','frozen']){
  const crashDirectory=join(directory,'process-'+crashAt),operationId=randomUUID();const child=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/external-seller-crash.mjs',import.meta.url)),crashDirectory,operationId,crashAt],{windowsHide:true,encoding:'utf8'});assert.equal(child.status,crashAt==='before'?17:crashAt==='after'?18:19,child.stderr);
  const reopened=await openPortableSecretStore({directory:crashDirectory,password});try{
   await assert.rejects(reopened.acquireLock('seller.'+operationId),/STORE_LOCKED/);const durable=await reopened.journal('seller.'+operationId).read();assert.equal(durable.phase,crashAt==='frozen'?'generated':'provider-started');
   let repeatedEffects=0;await assert.rejects(executeSellerIntent(durable,{adapter:{execute:async()=>{repeatedEffects++;}}}),/EXISTING_INTENT/);assert.equal(repeatedEffects,0);
   if(crashAt==='before')await assert.rejects(readFile(join(crashDirectory,'effect.marker')),error=>error.code==='ENOENT');else assert.equal(await readFile(join(crashDirectory,'effect.marker'),'utf8'),'one synthetic effect\n');
  }finally{reopened.dispose();}scenarios++;
 }
}finally{store?.dispose();password.fill(0);await rm(directory,{recursive:true,force:true});}
console.log(JSON.stringify({status:'PASS',scenarios,providerRetries:0,externalRequests:0,payments:0,coverage:['native-card-hash','paid-owner-agent-binding','claim-recovery','crash-before-and-after-provider','frozen-delivery-replay','encrypted-journal-lock','runtime-idempotency','watch-bounds','quota-stop','pagination','owned-endpoint-allowlist']}));
