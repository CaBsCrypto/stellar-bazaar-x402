import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {runHostedSellerTick,HOSTED_SELLER_LIMITS} from '../../examples/seller-hosted-tick.mjs';
import {createSellerCard,sellerCanonical,sellerHash} from '../../examples/seller-service-card.mjs';
import {createSellerIntent} from '../../examples/seller-marketplace-worker.mjs';

const started=Date.parse('2026-10-10T12:00:00.000Z');
const publication=createSellerCard({id:'hosted-guionista',name:'Synthetic hosted script',description:'Offline acceptance only',providerName:'Synthetic provider',providerOrigin:'https://provider.example',destination:Keypair.fromRawEd25519Seed(Buffer.alloc(32,3)).publicKey(),amount:'0.01',input:[{name:'topic',type:'string',required:true}]});
const config={...publication,ownerId:'ow_synthetic_seller',agentId:'agent_synthetic',bazaarOrigin:'https://bazaar.example',allowedOrigins:[publication.card.url],controlProof:{method:'http-well-known',domain:'provider.example'},agentAccess:'a'.repeat(43),providerAccess:'p'.repeat(43)};
function memoryStore(){
 const values=new Map(),histories=new Map(),locks=new Set();let failWrite,failJournal,loseLease=false;
 return {values,histories,locks,set failWrite(fn){failWrite=fn;},set failJournal(fn){failJournal=fn;},set loseLease(value){loseLease=value;},read:async name=>structuredClone(values.get(name)),async write(name,value){if(failWrite?.(name,value))throw Error('SYNTHETIC_SECRET_WRITE_FAILURE');values.set(name,structuredClone(value));},async assertLocks(){if(loseLease||!locks.has('seller.hosted'))throw Error('LOCK_EXPIRED');},journal(name){return {async read(){if(!values.has(name))throw Object.assign(Error('missing'),{code:'ENOENT'});const value=values.get(name);if(value?.guardOnly)throw Object.assign(Error('WORKER_CONTENT_EXPIRED'),{code:'WORKER_CONTENT_EXPIRED'});return structuredClone(value);},async initialize(value){if(values.has(name))throw Error('ALREADY_EXISTS');if(failJournal?.(name,value))throw Error('SYNTHETIC_SECRET_JOURNAL_FAILURE');values.set(name,structuredClone(value));histories.set(name,[structuredClone(value)]);},async append(value){if(!values.has(name))throw Error('MISSING_JOURNAL');if(failJournal?.(name,value))throw Error('SYNTHETIC_SECRET_JOURNAL_FAILURE');values.set(name,structuredClone(value));histories.get(name).push(structuredClone(value));}};},async acquireLock(name){if(locks.has(name))throw Error('LOCKED');locks.add(name);return async()=>locks.delete(name);}};
}
function paidOrder(){const input={topic:'Synthetic private topic'};return {operationId:randomUUID(),serviceId:config.card.id,cardHash:config.cardHash,card:structuredClone(config.card),sellerOwnerId:config.ownerId,buyerOwnerId:'ow_synthetic_buyer',perspective:'sale',phase:'paid',input,inputHash:sellerHash(sellerCanonical(input)),paymentProtocol:'x402-stellar-exact-v2',amount:config.card.payment.amount,destination:config.card.payment.destination,settlement:config.card.payment.identity,transactionHash:'b'.repeat(64),paymentVerifiedAt:new Date(started-1000).toISOString(),createdAt:new Date(started).toISOString(),expiresAt:new Date(started+7*86400000).toISOString()};}
function fixture({orders=[paidOrder()],store=memoryStore(),pageSize=20}={}){
 const events=[],reports=[],capacityReports=[],expiredIds=new Set();let clock=started,providerCalls=0,healthCalls=0,httpRequests=0,toolCalls=0,quota=false,lostProvider=false,lostClaim=false,lostDelivery=false,lostCapacity=false,healthResponse=()=>Response.json({ready:true,network:'stellar:testnet'}),identity={ownerId:config.ownerId,agentId:config.agentId,generation:1,network:'stellar:testnet'},beforeProvider,beforeTool,afterTool;
 const find=id=>orders.find(order=>order.operationId===id);
 const options={enabled:true,config,store,now:()=>clock,fetcher:async(url,init)=>{
  assert.equal(String(url),'https://bazaar.example/api/mcp');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+config.agentAccess);
  httpRequests++;events.push('http');assert.ok(store.values.get('seller.hosted.tick').mcpRequests>=1);
  if(init.method==='GET')return new Response(null,{status:405,headers:{allow:'POST'}});
  const packet=JSON.parse(init.body);
  if(packet.method==='initialize')return Response.json({jsonrpc:'2.0',id:packet.id,result:{protocolVersion:packet.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'offline',version:'1'}}});
  if(packet.method==='notifications/initialized')return new Response(null,{status:202});
  assert.equal(packet.method,'tools/call');toolCalls++;const {name,arguments:args}=packet.params;events.push(name);await beforeTool?.(name,args);
  if(quota)return new Response(null,{status:429,headers:{'retry-after':typeof quota==='string'?quota:'60'}});
  if(name==='get_market_order'&&expiredIds.has(args.operationId))return Response.json({jsonrpc:'2.0',id:packet.id,result:{isError:true,content:[{type:'text',text:JSON.stringify({httpStatus:410,error:{code:'ORDER_CONTENT_EXPIRED'},recoveryOnly:true})}]}});
  let body;
  if(name==='get_bazaar_identity')body=structuredClone(identity);
  else if(name==='report_market_capacity'){
   assert.deepEqual(store.values.get('seller.hosted.tick').capacityReport,args,'capacity intention must be durable before its MCP write');
   assert.equal(args.serviceId,config.card.id);assert.equal(args.cardHash,config.cardHash);assert.equal(args.day,new Date(clock).toISOString().slice(0,10));assert.ok(Math.abs(Date.parse(args.observedAt)-clock)<=30000);assert.match(args.reportId,/^[a-f0-9-]{36}$/);assert.equal(args.usedToday,store.values.get('seller.hosted.tick').providerRequests);
   capacityReports.push(structuredClone(args));if(lostCapacity)throw Error('SYNTHETIC_SECRET_CAPACITY_ACK_LOSS');body={ready:args.ready,leaseExpiresAt:new Date(Date.parse(args.observedAt)+360000).toISOString()};
  }
  else if(name==='list_market_orders'){
   const at=args.cursor?Number(Buffer.from(args.cursor,'base64url').toString()):0;
   body={orders:structuredClone(orders.slice(at,at+pageSize)),nextCursor:at+pageSize<orders.length?Buffer.from(String(at+pageSize)).toString('base64url'):null};
  }else{
   const order=find(args.operationId);assert.ok(order);
   if(name==='claim_market_order'){assert.equal(order.phase,'paid');order.phase='executing';order.attemptId=args.attemptId;order.agentId=config.agentId;if(lostClaim)throw Error('SYNTHETIC_SECRET_CLAIM_LOSS');}
   else if(name==='deliver_market_order'){order.phase='delivered';order.delivery={text:args.text,sha256:sellerHash(args.text),reference:'bazaar-order:'+order.operationId};if(lostDelivery)throw Error('SYNTHETIC_SECRET_DELIVERY_LOSS');}
   else if(name==='uncertain_market_order'){assert.equal(order.phase,'executing');order.phase='execution-uncertain';order.executionUncertainty=args.reason;}
   else assert.equal(name,'get_market_order');const rawOrder=structuredClone(order);delete rawOrder.expiresAt;body={order:rawOrder};
  }
  await afterTool?.(name,args);
  return Response.json({jsonrpc:'2.0',id:packet.id,result:{content:[{type:'text',text:JSON.stringify(body)}],isError:false}});
 },providerFetcher:async(url,init)=>{
  if(url==='https://provider.example/v1/marketplace-text/availability'){
   assert.equal(init.method,'GET');assert.equal(init.headers.authorization,'Bearer '+config.providerAccess);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.body,undefined);healthCalls++;events.push('provider-health');return healthResponse();
  }
  assert.equal(url,'https://provider.example/v1/marketplace-text');assert.equal(init.headers.authorization,'Bearer '+config.providerAccess);assert.equal(init.redirect,'error');providerCalls++;events.push('provider');const packet=JSON.parse(init.body);
  assert.equal(store.values.get('seller.hosted.tick').providerRequests,providerCalls);
  const conserved=store.values.get('seller.'+packet.operationId);assert.equal(conserved.phase,'provider-started');assert.equal(conserved.contentExpiresAt,find(packet.operationId).expiresAt);await beforeProvider?.();
  if(lostProvider)throw Error('SYNTHETIC_SECRET_PROVIDER_LOSS');const text='Synthetic frozen result';return Response.json({operationId:packet.operationId,attemptId:packet.attemptId,contentType:'text/plain',text,textHash:sellerHash(text)});
 }};
 return {options,orders,store,events,reports,capacityReports,expiredIds,get clock(){return clock;},set clock(v){clock=v;},set quota(v){quota=v;},set lostProvider(v){lostProvider=v;},set lostClaim(v){lostClaim=v;},set lostDelivery(v){lostDelivery=v;},set lostCapacity(v){lostCapacity=v;},set healthResponse(fn){healthResponse=fn;},set identity(v){identity=v;},set beforeProvider(fn){beforeProvider=fn;},set beforeTool(fn){beforeTool=fn;},set afterTool(fn){afterTool=fn;},get providerCalls(){return providerCalls;},get healthCalls(){return healthCalls;},get httpRequests(){return httpRequests;},get toolCalls(){return toolCalls;},async run(extra={}){const result=await runHostedSellerTick({...options,...extra});reports.push(result);return result;}};
}
function seedIntent(f,order,phase){
 const intent={...createSellerIntent({operationId:order.operationId,cardHash:config.cardHash,serviceId:config.card.id,providerOrigin:config.card.url,providerRoute:config.card.routeTemplate,ownerId:config.ownerId,agentId:config.agentId}),contentExpiresAt:order.expiresAt};
 intent.binding={transactionHash:order.transactionHash,inputHash:order.inputHash,input:structuredClone(order.input),amount:order.amount,destination:order.destination,identity:structuredClone(order.settlement),paymentProtocol:order.paymentProtocol};intent.phase=phase;
 if(phase!=='prepared'){order.phase='executing';order.attemptId=intent.attemptId;order.agentId=config.agentId;}
 if(['generated','delivery-started','delivery-uncertain','delivered'].includes(phase)){intent.text='Synthetic already generated';intent.textHash=sellerHash(intent.text);}
 return f.store.journal('seller.'+order.operationId).initialize(intent);
}

export {started, config, memoryStore, paidOrder, fixture, seedIntent};
