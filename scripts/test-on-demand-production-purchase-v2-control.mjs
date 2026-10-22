import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PRODUCTION_PURCHASE_POLICY as C,createProductionPurchaseIntent} from './on-demand-production-purchase.mjs';
import {decodeProductionPurchaseMcpBody,assertPreflightContinuation} from '../.vercel/on-demand-production-purchase-v2-control.mjs';

// Only pure exported validators are invoked. No real transport, signer, file,
// operator context, DPAPI journal or production controller action is used.
const clone=value=>structuredClone(value);
let scenarios=0,checks=0;
const equal=(a,b)=>{assert.equal(a,b);checks++;};
const rejected=fn=>{assert.throws(fn);checks++;scenarios++;};
const envelope=(body,{text=false,id=7}={})=>({jsonrpc:'2.0',id,result:text?{content:[{type:'text',text:JSON.stringify(body)}]}:{structuredContent:clone(body),content:[{type:'text',text:JSON.stringify(body)}]}});
const caps=()=>({demo:{network:'stellar:testnet'},effectiveFeatures:{purchases:{enabled:true},privateFiles:{enabled:false}},workspace:{marketplace:{admission:{mode:'restricted'}}},freeDemo:{mode:'continuous',sellerMode:'owned-text-on-demand'}});
const service=()=>({status:'activated',cardHash:C.cardHash,resource:clone(C.publicCard)});

for(const name of ['get_bazaar_capabilities','get_service'])for(const text of [false,true]){
 const body=name==='get_service'?service():caps(),response=decodeProductionPurchaseMcpBody(name,envelope(body,{text}),200,7);
 equal(response.httpStatus,undefined);if(name==='get_service')equal(response.cardHash,C.cardHash);else equal(response.demo.network,'stellar:testnet');scenarios++;
}
for(const [name,status,body] of [
 ['get_bazaar_identity',200,{httpStatus:200,ownerId:'ow_'+'11'.repeat(16),agentId:'agent_'+'22'.repeat(16),generation:1}],
 ['create_market_order',200,{httpStatus:201,order:{operationId:randomUUID(),phase:'awaiting-payment'}}],
 ['get_market_order',200,{httpStatus:200,order:{operationId:randomUUID(),phase:'paid'}}],
 ['create_market_order',200,{httpStatus:200,order:{operationId:randomUUID(),phase:'awaiting-payment'}}],
 ]){
 equal(decodeProductionPurchaseMcpBody(name,envelope(body),status,7).httpStatus,body.httpStatus);scenarios++;
}
for(const name of ['get_bazaar_identity','create_market_order','get_market_order']){
 rejected(()=>decodeProductionPurchaseMcpBody(name,envelope({ownerId:'ow_'+'11'.repeat(16),order:{operationId:randomUUID()}}),200,7));
}
for(const [name,mutate] of [
 ['get_bazaar_capabilities',b=>b.demo.network='stellar:pubnet'],
 ['get_bazaar_capabilities',b=>delete b.demo],
 ['get_bazaar_capabilities',b=>b.effectiveFeatures.purchases.enabled=false],
 ['get_bazaar_capabilities',b=>b.effectiveFeatures.privateFiles.enabled=true],
 ['get_bazaar_capabilities',b=>delete b.effectiveFeatures.privateFiles],
 ['get_bazaar_capabilities',b=>b.workspace.marketplace.admission.mode='public'],
 ['get_bazaar_capabilities',b=>b.freeDemo.mode='legacy'],
 ['get_bazaar_capabilities',b=>b.freeDemo.sellerMode='external-worker'],
 ['get_service',b=>b.status='withdrawn'],['get_service',b=>b.status='pending-manual-review'],
 ['get_service',b=>delete b.status],['get_service',b=>b.cardHash='f'.repeat(64)],
 ['get_service',b=>b.resource.id='another-service'],['get_service',b=>b.resource.payment.amount='0.02'],
 ['get_service',b=>b.resource.payment.destination=C.payer],['get_service',b=>b.resource.network='stellar:pubnet'],
 ]){
 const body=name==='get_service'?service():caps();mutate(body);rejected(()=>decodeProductionPurchaseMcpBody(name,envelope(body),200,7));
}
for(const status of [201,202,204,302,401,403,429,500,503])rejected(()=>decodeProductionPurchaseMcpBody('get_bazaar_capabilities',envelope(caps()),status,7));
for(const mutate of [
 m=>m.id=8,m=>m.id='7',m=>m.error={code:-32000,message:'unavailable'},m=>m.result.isError=true,
 m=>delete m.result,m=>m.result=null,m=>m.result.structuredContent=null,
 ]){
 const message=envelope(caps());mutate(message);rejected(()=>decodeProductionPurchaseMcpBody('get_bazaar_capabilities',message,200,7));
}
for(const body of [null,[],42,'not an object'])rejected(()=>decodeProductionPurchaseMcpBody('get_bazaar_capabilities',envelope(body),200,7));
for(const content of [[],[{type:'image',data:'ignored'}],[{type:'text',text:'bad json'}],[{type:'text',text:'x'.repeat(262145)}]]){
 rejected(()=>decodeProductionPurchaseMcpBody('get_bazaar_capabilities',{jsonrpc:'2.0',id:7,result:{content}},200,7));
}
for(const [name,httpStatus] of [['get_bazaar_identity',201],['create_market_order',202],['get_market_order',201],['get_bazaar_capabilities',503],['get_service',503]]){
 const body=name==='get_service'?service():name==='get_bazaar_capabilities'?caps():{order:{operationId:randomUUID()}};body.httpStatus=httpStatus;
 rejected(()=>decodeProductionPurchaseMcpBody(name,envelope(body),200,7));
}

const operationId='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const journalSha256='443cac3c76a6c6ffbd5b897d38ef926e477ec33e361e3603ca55338e65f35cf6';
// The exact approval hash is pinned by the reviewed continuation controller.
const approvalSha256='e75af5fa341982e30bcbe8b688e83b0d2b1659e373f4ca0829bd84190daf76c9';
function continuationFixture(){return {operationId,journalSha256,approvalSha256,intent:createProductionPurchaseIntent({operationId}),gateFilesPresent:{admission:false,authorization:false,submission:false},continuationGatePresent:false,proof:{status:'CONFIRMED_ORIGINAL_PREFLIGHT_ONLY_NO_PAYMENT',observedAt:'2026-10-12T02:30:58.530Z',operationId,phase:'prepared',marketRequestsInStoppedAttempt:2,orderCreations:0,rpcRequests:0,signatures:0,paymentSubmissions:0,gateFilesPresent:{admission:false,authorization:false,submission:false},journalControlPresent:false,originalJournalSha256:journalSha256,sameOperationContinuationOnly:true,newOrders:0,newPayments:0,secretValuesInOutput:0}};}
const good=continuationFixture();assert.doesNotThrow(()=>assertPreflightContinuation(good));checks++;scenarios++;
for(const mutate of [
 f=>f.operationId=randomUUID(),f=>f.proof.operationId=randomUUID(),f=>f.intent.operationId=randomUUID(),
 f=>f.journalSha256='f'.repeat(64),f=>f.approvalSha256='f'.repeat(64),f=>f.proof.originalJournalSha256='f'.repeat(64),
 f=>f.proof.status='UNCONFIRMED',f=>f.proof.phase='order-started',f=>f.proof.marketRequestsInStoppedAttempt=3,
 f=>f.proof.orderCreations=1,f=>f.proof.rpcRequests=1,f=>f.proof.signatures=1,f=>f.proof.paymentSubmissions=1,
 f=>f.proof.newOrders=1,f=>f.proof.newPayments=1,f=>f.proof.secretValuesInOutput=1,f=>f.proof.journalControlPresent=true,
 f=>f.proof.sameOperationContinuationOnly=false,f=>f.continuationGatePresent=true,
 f=>f.intent.phase='order-created',f=>f.intent.purchaseControl={},
 ]){
 const f=continuationFixture();mutate(f);rejected(()=>assertPreflightContinuation(f));
}
for(const name of ['admission','authorization','submission'])for(const section of ['gateFilesPresent','proof']){
 const f=continuationFixture();if(section==='proof')f.proof.gateFilesPresent[name]=true;else f.gateFilesPresent[name]=true;
 rejected(()=>assertPreflightContinuation(f));
}
for(const marker of ['order','challenge','challengeHash','unsignedTransaction','expirationLedger','signedAuthorizationTransaction','signedPayload','payloadHash','paymentSignature','receipt','purchaseControl']){
 const f=continuationFixture();f.intent[marker]='existing-material';rejected(()=>assertPreflightContinuation(f));
}
for(const field of ['operationId','proof','journalSha256','approvalSha256','intent','gateFilesPresent','continuationGatePresent']){
 const f=continuationFixture();delete f[field];rejected(()=>assertPreflightContinuation(f));
}
for(const mutate of [m=>delete m.jsonrpc,m=>m.jsonrpc='1.0',m=>m.result=[],m=>m.result.content.push({type:'text',text:'{}'}),m=>m.result.content[0].text='{}',m=>m.result.content[0].text='not json',m=>m.result.content[0].text='x'.repeat(262145)]){
 const message=envelope(caps());mutate(message);rejected(()=>decodeProductionPurchaseMcpBody('get_bazaar_capabilities',message,200,7));
}
for(const id of ['7',NaN,Infinity,7.5])rejected(()=>decodeProductionPurchaseMcpBody('get_bazaar_capabilities',envelope(caps()),200,id));
rejected(()=>decodeProductionPurchaseMcpBody('report_market_capacity',envelope({httpStatus:200}),200,7));
for(const name of ['get_bazaar_capabilities','get_service','get_bazaar_identity','create_market_order','get_market_order']){
 const body=name==='get_bazaar_capabilities'?caps():name==='get_service'?service():{ownerId:'ow_'+'11'.repeat(16),agentId:'agent_'+'22'.repeat(16),generation:1};body.httpStatus='200';rejected(()=>decodeProductionPurchaseMcpBody(name,envelope(body),200,7));
}
for(const mutate of [f=>f.intent.createdAt='invalid',f=>f.intent.createdAt='',f=>f.intent.extra='not-original',f=>f.intent.input.topic='Changed content',f=>f.intent.payer=C.destination,f=>f.intent.cardHash='f'.repeat(64),f=>f.proof.orderCreations='0',f=>f.proof.signatures=false,f=>f.continuationGatePresent=undefined,f=>f.gateFilesPresent.admission='false',f=>delete f.gateFilesPresent.admission,f=>f.gateFilesPresent.extra=false,f=>f.proof.gateFilesPresent.extra=false]){
 const f=continuationFixture();mutate(f);rejected(()=>assertPreflightContinuation(f));
}
const originalDated=continuationFixture();originalDated.intent.createdAt='2026-10-12T02:20:00.000Z';
assert.doesNotThrow(()=>assertPreflightContinuation(originalDated));checks++;scenarios++;
const beforeValidation=JSON.stringify(originalDated),continuation=assertPreflightContinuation(originalDated);
equal(JSON.stringify(originalDated),beforeValidation);equal(continuation.continuationMaximum,1);equal(continuation.sideEffects,0);scenarios++;
console.log(JSON.stringify({status:'PASS',scenarios,checks,externalRequests:0,dpapiReads:0,privateProfileReads:0,newOrders:0,signatures:0,newPayments:0,filesystemWrites:0}));
