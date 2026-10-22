import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Address,Keypair,Networks,SorobanDataBuilder,Transaction,xdr} from '@stellar/stellar-sdk';
import {basicNodeSigner} from '@stellar/stellar-sdk/contract';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {buyerCanonical,buyerIdentity,buyerProtocol,assertBuyerTransfer} from '../examples/marketplace-x402-buyer.mjs';
import {PRODUCTION_PURCHASE_POLICY as C,createProductionPurchaseIntent,productionPurchaseApproval,validateProductionPurchaseApproval,validateProductionPurchaseContext,runProductionPurchase,recoverProductionPurchase} from './on-demand-production-purchase.mjs';
import {boundedProductionPurchaseTransport} from '../.vercel/on-demand-production-purchase-control.mjs';
import {resumeExistingProductionPurchase,recoverExistingProductionPurchase,assertUnpaidOrderContinuation,validateSupplementalPurchaseDeployment,safePurchaseDiagnostic,ORIGINAL_RESUME_OPERATION,ORIGINAL_FINANCIAL_APPROVAL_SHA,CORRECTIVE_BAZAAR_SOURCE} from './on-demand-production-purchase-resume.mjs';

// The real buyer protocol runs against memory-only transports and synthetic
// Ed25519 keys. No real signer, cloud credentials, DPAPI, filesystem or fetch.
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>sha(buyerCanonical(value));
const clone=value=>structuredClone(value);
const payer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,17));
const seller=Keypair.fromRawEd25519Seed(Buffer.alloc(32,18));
const ownerId='ow_'+'11'.repeat(16),agentId='agent_'+'22'.repeat(16);
let scenarios=0,assertions=0;
const check=(actual,expected)=>{assert.equal(actual,expected);assertions++;};
const truth=value=>{assert.ok(value);assertions++;};
const rejected=async(action,pattern)=>{await assert.rejects(action,pattern);assertions++;};

function fixture(){
 const publicCard=clone(C.publicCard);publicCard.payment.destination=seller.publicKey();
 const policy={...C,publicCard,payer:payer.publicKey(),destination:seller.publicKey(),cardHash:digest(publicCard),ownerFingerprint:sha(ownerId)};
 const intent=createProductionPurchaseIntent({operationId:randomUUID(),input:{topic:'Offline synthetic acceptance',tone:'educativo',durationSeconds:20},policy});
 const approval=productionPurchaseApproval(intent,{approved:true,policy});
 const context={ownerId,agentId,generation:1,agentAccess:'a'.repeat(43)};
 const route='/api/market/orders/'+intent.operationId+'/x402';
 const requirements={scheme:'exact',network:'stellar:testnet',asset:buyerIdentity.sacContract,amount:'100000',payTo:seller.publicKey(),maxTimeoutSeconds:60,extra:{areFeesSponsored:true,resourceUrl:policy.origin+route,route,method:'POST',operationId:intent.operationId,cardHash:intent.cardHash,inputHash:intent.inputHash}};
 const challenge={x402Version:2,resource:{url:policy.origin+route,mimeType:'application/json'},accepts:[requirements]};
 let order={operationId:intent.operationId,paymentProtocol:buyerProtocol,serviceId:publicCard.id,cardHash:intent.cardHash,card:clone(publicCard),input:clone(intent.input),inputHash:intent.inputHash,payer:payer.publicKey(),destination:seller.publicKey(),settlement:clone(buyerIdentity),amount:'0.01',buyerOwnerId:ownerId,sellerOwnerId:'ow_'+'33'.repeat(16),phase:'awaiting-payment',executionMode:'on-demand'};
 let sealed=clone(intent),signatures=0,payments=0,reads=0,creates=0,challenges=0,rpcs=0,simulation=0;
 const snapshots=[],gates=[],events=[],rpcMethods=[];
 const switches={losePayment:false,loseCreate:false,loseChallenge:false,loseSigner:false,loseSecondSimulation:false,failGate:null,failAppendPhase:null,fee:['735723','735723'],resourceFee:undefined,changeChallenge:null,changeReceipt:null,changeOrder:null};
 const journal={read:async()=>clone(sealed),append:async value=>{events.push('journal:'+value.phase);if(switches.failAppendPhase===value.phase)throw Error('SYNTHETIC_JOURNAL_ACK_LOST');snapshots.push(clone(value));sealed=clone(value);}};
 const input={intent,approval,context,policy,journal,
  consumeGate:async(kind,value,approvalHash)=>{events.push('gate:'+kind);if(switches.failGate===kind)throw Error('SYNTHETIC_GATE_ACK_LOST');if(gates.includes(kind))throw Error('SYNTHETIC_GATE_ALREADY_CONSUMED');gates.push(kind);return {kind,operationId:value.operationId,approvalHash,consumed:true};},
  signer:{address:payer.publicKey(),signAuthEntry:async(...args)=>{events.push('sign');signatures++;check(snapshots.at(-1).phase,'signer-started');if(switches.loseSigner)throw Error('SYNTHETIC_SIGNER_RESPONSE_LOST');return basicNodeSigner(payer,Networks.TESTNET).signAuthEntry(...args);}},
  marketTool:async(name,args)=>{
   events.push('tool:'+name);
   if(name==='get_bazaar_identity')return {httpStatus:200,ownerId,agentId,generation:1,role:'agent',account:{id:ownerId},agent:{id:agentId},network:'stellar:testnet',wallet:null};
   if(name==='get_bazaar_capabilities')return {workspace:{payments:buyerProtocol,marketplace:{enabled:true,admission:{mode:'restricted'}}},effectiveFeatures:{purchases:{enabled:true},privateFiles:{enabled:false}},demo:{network:'stellar:testnet'},freeDemo:{mode:'continuous',sellerMode:'owned-text-on-demand'}};
   if(name==='get_service')return {id:publicCard.id,status:'activated',cardHash:intent.cardHash,resource:clone(publicCard),card:clone(publicCard),availability:{ready:true,mode:'on-demand'}};
   if(name==='create_market_order'){creates++;check(args.operationId,intent.operationId);check(args.cardHash,intent.cardHash);check(args.payer,payer.publicKey());if(switches.loseCreate)throw Error('SYNTHETIC_CREATE_RESPONSE_LOST');return {httpStatus:201,order:clone(order)};}
   if(name==='get_market_order'){reads++;check(args.operationId,intent.operationId);return {httpStatus:200,order:clone(order)};}
   throw Error('UNEXPECTED_FAKE_TOOL:'+name);
  },
  marketFetch:async(url,init)=>{
   const target=new URL(url);check(target.origin,C.origin);check(init.redirect,'error');check(new Headers(init.headers).get('authorization'),'Bearer '+'a'.repeat(43));
   if(init.method==='GET'){reads++;events.push('read');check(target.pathname,'/api/market/orders/'+intent.operationId);return Response.json({order:clone(order)});}
   check(init.method,'POST');check(target.pathname,route);check(init.body,'{}');
   const signature=new Headers(init.headers).get('payment-signature');
   if(!signature){challenges++;events.push('challenge');if(switches.loseChallenge)throw Error('SYNTHETIC_CHALLENGE_RESPONSE_LOST');const returned=clone(challenge);switches.changeChallenge?.(returned);return Response.json(returned,{status:402,headers:{'payment-required':encodePaymentRequiredHeader(returned)}});}
   payments++;events.push('payment');check(snapshots.at(-1).phase,'payment-started');const payload=decodePaymentSignatureHeader(signature);assertBuyerTransfer(payload.payload.transaction,requirements,payer.publicKey(),{maxSponsoredFeeStroops:1000000});
   order={...order,phase:'paid',transactionHash:'b'.repeat(64),paymentVerifiedAt:'2026-10-12T03:00:00.000Z'};
   if(switches.losePayment)throw Error('SYNTHETIC_PAYMENT_RESPONSE_LOST');
   const receipt={success:true,network:'stellar:testnet',payer:payer.publicKey(),transaction:order.transactionHash};switches.changeReceipt?.(receipt);const returned=clone(order);switches.changeOrder?.(returned);
   return Response.json({order:returned,statusUrl:policy.origin+'/api/market/orders/'+intent.operationId},{status:202,headers:{'payment-response':encodePaymentResponseHeader(receipt)}});
  },
  rpcFetch:async(url,init)=>{
   check(String(url),'https://soroban-testnet.stellar.org/');check(init.redirect,'error');rpcs++;const body=JSON.parse(init.body);rpcMethods.push(body.method);events.push('rpc:'+body.method);
   if(body.method==='getLatestLedger')return Response.json({jsonrpc:'2.0',id:1,result:{sequence:1000}});
   check(body.method,'simulateTransaction');simulation++;if(switches.loseSecondSimulation&&simulation===2)throw Error('SYNTHETIC_SECOND_SIMULATION_LOST');
   const operation=new Transaction(body.params.transaction,Networks.TESTNET).operations[0];
   const entry=operation.auth?.[0]??new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(payer.publicKey()).toScAddress(),nonce:xdr.Int64.fromString('42'),signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(operation.func.invokeContract()),subInvocations:[]})});
   const fee=switches.fee[simulation-1]??'100',resource=switches.resourceFee?.[simulation-1]??fee;
   return Response.json({jsonrpc:'2.0',id:1,result:{latestLedger:1000,minResourceFee:fee,transactionData:new SorobanDataBuilder().setResourceFee(resource).build().toXDR('base64'),results:[{auth:[entry.toXDR('base64')],xdr:xdr.ScVal.scvVoid().toXDR('base64')}]}});
  },
 };
 return {input,intent,approval,context,policy,journal,switches,snapshots,gates,events,rpcMethods,
  get sealed(){return clone(sealed);},set sealed(value){sealed=clone(value);},get order(){return clone(order);},set order(value){order=clone(value);},
  get signatures(){return signatures;},get payments(){return payments;},get reads(){return reads;},get creates(){return creates;},get challenges(){return challenges;},get rpcs(){return rpcs;}};
}

function resumedFixture(){
 const f=fixture();f.policy.defaultInput=clone(f.intent.input);f.intent.phase='order-uncertain';
 f.intent.preflightContinuation={version:1,operationId:f.intent.operationId,continuationMaximum:1,sideEffects:0};
 f.intent.purchaseControl={version:1,approvalHash:digest(f.approval),ownerFingerprint:f.policy.ownerFingerprint,operationId:f.intent.operationId,gates:['admission'],signatures:0,payments:0,reservations:[]};f.sealed=f.intent;f.gates.push('admission');
 const originalFetch=f.input.marketFetch;let consumed=0,found=false;
 f.input.marketFetch=async(url,init)=>{if(init.method==='GET'&&!found){f.events.push('native:404');return Response.json({error:{code:'NOT_FOUND'}},{status:404});}return originalFetch(url,init);};
 f.input.consumeResume=async(intent,approvalHash)=>{if(consumed++)throw Error('CONTINUATION_ALREADY_CONSUMED');f.events.push('resume:gate');return {consumed:true,operationId:intent.operationId,approvalHash,maximumCreates:1};};
 return Object.assign(f,{found(){found=true;},consumed:()=>consumed});
}
const happy=resumedFixture(),success=await resumeExistingProductionPurchase(happy.input);
check(success.status,'CONFIRMED_SAME_ORIGINAL_OPERATION');check(happy.creates,1);check(happy.signatures,1);check(happy.payments,1);check(happy.consumed(),1);check(happy.gates.filter(x=>x==='admission').length,1);
truth(happy.snapshots.every(x=>x.phase!=='prepared'));truth(happy.snapshots.every(x=>x.preflightContinuation));check(happy.events[0],'native:404');scenarios++;
await rejected(()=>resumeExistingProductionPurchase({...happy.input,intent:happy.sealed}),/EXISTING_UNPAID_ADMISSION_ONLY_CONTINUATION_REQUIRED/);check(happy.signatures,1);check(happy.payments,1);scenarios++;

const found=resumedFixture();found.found();const recovered=await resumeExistingProductionPurchase(found.input);check(recovered.status,'ORIGINAL_ORDER_RECOVERED_READ_ONLY');check(found.creates,0);check(found.signatures,0);check(found.payments,0);check(found.consumed(),0);scenarios++;
for(const change of [i=>i.phase='prepared',i=>i.phase='payment-uncertain',i=>i.purchaseControl.signatures=1,i=>i.purchaseControl.payments=1,i=>i.purchaseControl.gates=[],i=>i.purchaseControl.gates.push('authorization'),i=>i.purchaseControl.reservations=[{}],i=>i.paymentSignature='proof',i=>i.order={},i=>i.challenge={},i=>i.resumeControl={},i=>i.input.topic='changed',i=>i.preflightContinuation.sideEffects=1]){
 const f=resumedFixture();change(f.intent);f.sealed=f.intent;await rejected(()=>resumeExistingProductionPurchase(f.input),/SEPARATE_EXACT_PRODUCTION_PAYMENT_APPROVAL_REQUIRED|ORIGINAL_SEALED_PURCHASE_CONTROL_REQUIRED|EXISTING_UNPAID_ADMISSION_ONLY_CONTINUATION_REQUIRED/);check(f.events.length,0);check(f.payments,0);check(f.signatures,0);scenarios++;
}
for(const response of [()=>Response.json({error:{code:'NOT_FOUND'}},{status:503}),()=>Response.json({error:{code:'OTHER'}},{status:404}),()=>Response.json({order:{}},{status:404}),()=>Response.json({error:{code:'NOT_FOUND'},unexpected:true},{status:404}),()=>new Response('not-json',{status:404}),()=>new Response('x'.repeat(262145),{status:404})]){
 const f=resumedFixture();f.input.marketFetch=async()=>response();const r=await resumeExistingProductionPurchase(f.input);check(r.status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(f.creates,0);check(f.consumed(),0);check(f.signatures,0);check(f.payments,0);scenarios++;
}
const lostRead=resumedFixture();lostRead.input.marketFetch=async()=>{throw Error('SYNTHETIC_READ_LOST');};check((await resumeExistingProductionPurchase(lostRead.input)).diagnostic.code,'SYNTHETIC_READ_LOST');check(lostRead.creates,0);check(lostRead.consumed(),0);scenarios++;
const lostCreate=resumedFixture();lostCreate.switches.loseCreate=true;const lost=await resumeExistingProductionPurchase(lostCreate.input);check(lost.phase,'order-uncertain');check(lost.diagnostic.code,'SYNTHETIC_CREATE_RESPONSE_LOST');check(lostCreate.creates,1);check(lostCreate.signatures,0);check(lostCreate.payments,0);truth(lostCreate.sealed.resumeControl.attempted);
await rejected(()=>resumeExistingProductionPurchase({...lostCreate.input,intent:lostCreate.sealed}),/EXISTING_UNPAID_ADMISSION_ONLY_CONTINUATION_REQUIRED/);check(lostCreate.creates,1);lostCreate.found();const readRecovery=await recoverExistingProductionPurchase({...lostCreate.input,intent:lostCreate.sealed});check(readRecovery.status,'RECOVERED_ORIGINAL_OPERATION');check(lostCreate.creates,1);check(lostCreate.signatures,0);scenarios++;
for(const field of ['payer','destination','cardHash','inputHash','amount','paymentProtocol','serviceId','buyerOwnerId']){
 const f=resumedFixture(),tool=f.input.marketTool;f.input.marketTool=async(name,args)=>{const r=await tool(name,args);if(name==='create_market_order')r.order[field]='changed';return r;};const r=await resumeExistingProductionPurchase(f.input);check(r.status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(f.signatures,0);check(f.challenges,0);check(f.payments,0);scenarios++;
}
for(const change of [r=>r.accepts[0].amount='200000',r=>r.accepts[0].network='stellar:pubnet',r=>r.accepts[0].asset='wrong',r=>r.accepts[0].payTo=payer.publicKey(),r=>r.accepts[0].extra.operationId=randomUUID(),r=>r.accepts[0].extra.cardHash='f'.repeat(64)]){
 const f=resumedFixture();f.switches.changeChallenge=change;const r=await resumeExistingProductionPurchase(f.input);check(r.phase,'challenge-uncertain');check(f.signatures,0);check(f.payments,0);scenarios++;
}
const costly=resumedFixture();costly.switches.fee=['1000001'];check((await resumeExistingProductionPurchase(costly.input)).phase,'authorization-uncertain');check(costly.signatures,0);check(costly.payments,0);scenarios++;
for(const lose of ['loseChallenge','loseSigner','loseSecondSimulation','losePayment']){
 const f=resumedFixture();f.switches[lose]=true;const r=await resumeExistingProductionPurchase(f.input);check(r.status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');truth(f.signatures<=1);truth(f.payments<=1);const counts=[f.signatures,f.payments,f.creates];await rejected(()=>resumeExistingProductionPurchase({...f.input,intent:f.sealed}),/EXISTING_UNPAID_ADMISSION_ONLY_CONTINUATION_REQUIRED/);assert.deepEqual([f.signatures,f.payments,f.creates],counts);assertions++;scenarios++;
}
const rejectedGate=resumedFixture();rejectedGate.input.consumeResume=async()=>{throw Error('RESUME_WX_EXISTS');};check((await resumeExistingProductionPurchase(rejectedGate.input)).diagnostic.code,'RESUME_WX_EXISTS');check(rejectedGate.creates,0);scenarios++;
const diagnostic=new Error('SECRET_TOKEN_IN_BODY lowercase');diagnostic.httpStatus=503;diagnostic.remoteCode='CAPACITY_CONTENTION';assert.deepEqual(safePurchaseDiagnostic(diagnostic),{code:'PURCHASE_CONTINUATION_UNCONFIRMED',httpStatus:503,remoteCode:'CAPACITY_CONTENTION'});assertions++;scenarios++;

function supplemental(){const approval={version:1,approved:true,kind:'SUPPLEMENTAL_DEPLOYMENT_FOR_ORIGINAL_PURCHASE',operationId:ORIGINAL_RESUME_OPERATION,planHash:C.planHash,reviewHash:C.reviewHash,canonicalOrigin:C.origin,financialApprovalSha256:ORIGINAL_FINANCIAL_APPROVAL_SHA,financialApprovalPreserved:true,newPaymentAuthorization:false,previous:{sourceDigest:C.sourceDigests.bazaar,deploymentId:C.deploymentIds.bazaar},current:{sourceDigest:CORRECTIVE_BAZAAR_SOURCE,deploymentId:'dpl_CorrectiveNew'},provider:{sourceDigest:C.sourceDigests.provider,deploymentId:C.deploymentIds.provider}};const proof={status:'CANONICAL_RESTRICTED_PURCHASE_CORRECTIVE_PRODUCTION_READY',readyState:'READY',target:'production',canonicalOrigin:C.origin,operationId:ORIGINAL_RESUME_OPERATION,planHash:C.planHash,reviewHash:C.reviewHash,sourceDigest:approval.current.sourceDigest,deploymentId:approval.current.deploymentId,previousSourceDigest:C.sourceDigests.bazaar,generalPurchasesEnabled:false,newPayments:0};const acceptance={status:'PASS_RESTRICTED_CORRECTIVE_PRODUCTION_NO_PAYMENT',operationId:ORIGINAL_RESUME_OPERATION,planHash:C.planHash,sourceDigest:approval.current.sourceDigest,deploymentId:approval.current.deploymentId,canonicalOrigin:C.origin,financialApprovalSha256:ORIGINAL_FINANCIAL_APPROVAL_SHA,generalPurchasesEnabled:false,publicProtectionPreserved:true,privateAccountBindingPreserved:true,newOrders:0,newPayments:0,signatures:0,observedAt:new Date().toISOString()};return {approval,proof,acceptance};}
const okay=supplemental();check(validateSupplementalPurchaseDeployment(okay.approval,okay.proof,okay.acceptance).sourceDigest,CORRECTIVE_BAZAAR_SOURCE);scenarios++;
for(const change of [r=>r.approval.approved=false,r=>r.approval.newPaymentAuthorization=true,r=>r.approval.financialApprovalSha256='f'.repeat(64),r=>r.approval.previous.sourceDigest='f'.repeat(64),r=>r.approval.provider.deploymentId='dpl_Other',r=>r.approval.current.sourceDigest=C.sourceDigests.bazaar,r=>r.proof.sourceDigest='f'.repeat(64),r=>r.proof.target='preview',r=>r.proof.generalPurchasesEnabled=true,r=>r.acceptance.signatures=1,r=>r.acceptance.newOrders=1,r=>r.acceptance.publicProtectionPreserved=false,r=>r.acceptance.privateAccountBindingPreserved=false]){const r=supplemental();change(r);assert.throws(()=>validateSupplementalPurchaseDeployment(r.approval,r.proof,r.acceptance));assertions++;scenarios++;}
console.log(JSON.stringify({status:'PASS_SAME_OPERATION_UNPAID_CONTINUATION',scenarios,assertions,externalRequests:0,realPayments:0,realWalletsRead:0,dpapiReads:0,filesystemWrites:0,syntheticSignaturesPerIntentMaximum:1,syntheticPaymentPostsPerIntentMaximum:1}));

