import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Address,Keypair,Networks,SorobanDataBuilder,Transaction,xdr} from '@stellar/stellar-sdk';
import {basicNodeSigner} from '@stellar/stellar-sdk/contract';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {buyerCanonical,buyerIdentity,buyerProtocol,assertBuyerTransfer} from '../examples/marketplace-x402-buyer.mjs';
import {PRODUCTION_PURCHASE_POLICY as C,createProductionPurchaseIntent,productionPurchaseApproval,validateProductionPurchaseApproval,validateProductionPurchaseContext,runProductionPurchase,recoverProductionPurchase} from './on-demand-production-purchase.mjs';
import {boundedProductionPurchaseTransport} from '../.vercel/on-demand-production-purchase-control.mjs';

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

// Guards below exercise the same default production contract independently of
// the synthetic local-policy fixture. Production callers cannot choose a policy.
check(C.origin,'https://bazaar.browns.studio');
check(C.ownerFingerprint,'0aaf1bf4b2a3f960df6d6438429cb1487f7cf16fb87fa434b134345aa1b89173');
check(C.publicCard.id,'guionista-bazaar-production-text-v1');
check(C.publicCard.payment.amount,'0.01');
check(C.cardHash,digest(C.publicCard));
truth(Object.isFrozen(C));

const happy=fixture();
const happyResult=await runProductionPurchase(happy.input);
check(happyResult.status,'CONFIRMED');
check(happy.payments,1);check(happy.signatures,1);check(happy.creates,1);check(happy.challenges,1);check(happy.rpcs,3);
assert.deepEqual(happy.gates,['admission','authorization','submission']);assertions++;
assert.deepEqual(happy.rpcMethods,['getLatestLedger','simulateTransaction','simulateTransaction']);assertions++;
check(happy.sealed.phase,'paid');truth(happyResult);scenarios++;

check(C.maximumAtomic,'100000');check(C.maxSponsoredFeeStroops,1000000);check(C.amount,'0.01');
check(C.payer,'GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU');
check(C.destination,'GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C');
check(C.sourceDigests.bazaar,'034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52');
check(C.sourceDigests.provider,'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232');
check(validateProductionPurchaseContext(happy.context,happy.policy),sha(ownerId));
truth(/^[a-f0-9]{64}$/.test(validateProductionPurchaseApproval(happy.intent,happy.approval,happy.policy)));scenarios++;

for(const mutate of [
 a=>a.approved=false,a=>a.version=2,a=>a.planHash='f'.repeat(64),a=>a.reviewHash='f'.repeat(64),
 a=>a.sourceDigests.bazaar='f'.repeat(64),a=>a.sourceDigests.provider='f'.repeat(64),
 a=>a.deploymentIds.bazaar='dpl_changed',a=>a.deploymentIds.provider='dpl_changed',
 a=>a.origin='https://preview.example',a=>a.serviceId='other-service',a=>a.cardHash='f'.repeat(64),
 a=>a.inputHash='f'.repeat(64),a=>a.operationId=randomUUID(),a=>a.ownerFingerprint='f'.repeat(64),
 a=>a.payer=seller.publicKey(),a=>a.destination=payer.publicKey(),a=>a.amount='0.02',
 a=>a.maximumAtomic='200000',a=>a.maxSponsoredFeeStroops=1000001,a=>a.maximumPayments=2,
 a=>a.maximumSignatures=2,a=>a.extra='unapproved',a=>delete a.maximumPayments,
 ]){
 const f=fixture();f.input.approval=clone(f.approval);mutate(f.input.approval);
 await rejected(()=>runProductionPurchase(f.input),/SEPARATE_EXACT_PRODUCTION_PAYMENT_APPROVAL_REQUIRED/);
 check(f.events.length,0);check(f.payments,0);check(f.signatures,0);scenarios++;
}
for(const mutate of [
 c=>c.ownerId='ow_'+'44'.repeat(16),c=>c.ownerId='invalid',c=>c.agentId='invalid',
 c=>c.generation=2,c=>c.generation='1',c=>c.agentAccess='short',c=>c.agentAccess='a'.repeat(42),
 c=>c.agentAccess='a'.repeat(44),c=>c.agentAccess='!'.repeat(43),c=>delete c.ownerId,
 ]){
 const f=fixture();mutate(f.context);await rejected(()=>runProductionPurchase(f.input),/EXACT_SEALED_PRODUCTION_BUYER_REQUIRED/);
 check(f.events.length,0);check(f.payments,0);check(f.signatures,0);scenarios++;
}
await rejected(()=>runProductionPurchase({...happy.input,intent:happy.sealed}),/EXISTING_OPERATION_RECOVER_ONLY/);check(happy.payments,1);scenarios++;
const sealedMismatch=fixture();sealedMismatch.sealed={...sealedMismatch.intent,input:{topic:'A different sealed input'}};
await rejected(()=>runProductionPurchase(sealedMismatch.input),/EXISTING_OPERATION_RECOVER_ONLY/);check(sealedMismatch.events.length,0);scenarios++;

for(const [name,mutate] of [
 ['get_bazaar_identity',r=>r.ownerId='ow_'+'44'.repeat(16)],
 ['get_bazaar_identity',r=>r.agentId='agent_'+'44'.repeat(16)],
 ['get_bazaar_identity',r=>r.generation=2],
 ['get_bazaar_capabilities',r=>r.demo.network='stellar:pubnet'],
 ['get_bazaar_capabilities',r=>r.effectiveFeatures.purchases.enabled=false],
 ['get_bazaar_capabilities',r=>r.effectiveFeatures.privateFiles.enabled=true],
 ['get_bazaar_capabilities',r=>r.workspace.marketplace.admission.mode='public'],
 ['get_bazaar_capabilities',r=>r.freeDemo.mode='legacy'],
 ['get_bazaar_capabilities',r=>r.freeDemo.sellerMode='external-worker'],
 ['get_service',r=>r.status='withdrawn'],['get_service',r=>r.cardHash='f'.repeat(64)],
 ['get_service',r=>r.resource.payment.amount='0.02'],
 ]){
 const f=fixture(),base=f.input.marketTool;f.input.marketTool=async(tool,args)=>{const r=await base(tool,args);if(tool===name)mutate(r);return r;};
 const result=await runProductionPurchase(f.input);check(result.status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');
 check(f.gates.length,0);check(f.creates,0);check(f.signatures,0);check(f.payments,0);scenarios++;
}

for(const [gate,creates,signatures] of [['admission',0,0],['authorization',1,0],['submission',1,1]]){
 const f=fixture();f.switches.failGate=gate;const result=await runProductionPurchase(f.input);
 check(result.status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(f.creates,creates);check(f.signatures,signatures);check(f.payments,0);scenarios++;
}
for(const mutate of [r=>r.consumed=false,r=>r.operationId=randomUUID(),r=>r.approvalHash='f'.repeat(64),r=>r.kind='submission']){
 const f=fixture(),base=f.input.consumeGate;f.input.consumeGate=async(...args)=>{const r=await base(...args);mutate(r);return r;};
 check((await runProductionPurchase(f.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(f.creates,0);check(f.payments,0);check(f.signatures,0);scenarios++;
}
for(const [switchName,expectedPhase,signatures,payments] of [
 ['loseCreate','order-uncertain',0,0],['loseChallenge','challenge-uncertain',0,0],
 ['loseSigner','authorization-uncertain',1,0],['loseSecondSimulation','authorization-uncertain',1,0],
 ['losePayment','payment-uncertain',1,1],
 ]){
 const f=fixture();f.switches[switchName]=true;const result=await runProductionPurchase(f.input);
 check(result.status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(f.sealed.phase,expectedPhase);check(f.signatures,signatures);check(f.payments,payments);
 if(switchName==='loseSecondSimulation')truth(f.sealed.signedAuthorizationTransaction);
 await rejected(()=>runProductionPurchase({...f.input,intent:f.sealed}),/EXISTING_OPERATION_RECOVER_ONLY/);
 check(f.signatures,signatures);check(f.payments,payments);scenarios++;
}
for(const [phase,signatures,payments] of [['order-started',0,0],['challenge-started',0,0],['authorization-started',0,0],['signer-started',0,0],['authorization-signed',1,0],['payment-started',1,0]]){
 const f=fixture();f.switches.failAppendPhase=phase;check((await runProductionPurchase(f.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');
 check(f.signatures,signatures);check(f.payments,payments);scenarios++;
}

for(const change of [
 r=>r.x402Version=1,r=>r.accepts.push(clone(r.accepts[0])),r=>r.accepts[0].network='stellar:pubnet',
 r=>r.accepts[0].asset='C'+'A'.repeat(55),r=>r.accepts[0].amount='200000',r=>r.accepts[0].payTo=payer.publicKey(),
 r=>r.accepts[0].extra.areFeesSponsored=false,r=>r.accepts[0].extra.inputHash='f'.repeat(64),
 r=>r.accepts[0].extra.cardHash='f'.repeat(64),r=>r.accepts[0].extra.operationId=randomUUID(),
 r=>r.accepts[0].extra.method='GET',r=>r.accepts[0].extra.route='/api/other',
 r=>r.resource.url='https://other.example/payment',r=>r.resource.mimeType='text/plain',
 ]){
 const f=fixture();f.switches.changeChallenge=change;check((await runProductionPurchase(f.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');
 check(f.sealed.phase,'challenge-uncertain');check(f.rpcs,0);check(f.signatures,0);check(f.payments,0);scenarios++;
}
for(const [fee,resourceFee,signatures] of [
 [['999901','100'],undefined,0],[['100','999901'],undefined,1],
 [['100','100'],['999901','100'],0],[['100','100'],['100','999901'],1],
 ]){
 const f=fixture();f.switches.fee=fee;f.switches.resourceFee=resourceFee;
 check((await runProductionPurchase(f.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(f.signatures,signatures);check(f.payments,0);scenarios++;
}
const boundary=fixture();boundary.switches.fee=['999900','999900'];check((await runProductionPurchase(boundary.input)).status,'CONFIRMED');
check(new Transaction(boundary.sealed.signedPayload.payload.transaction,Networks.TESTNET).fee,'1000000');check(boundary.signatures,1);check(boundary.payments,1);scenarios++;

for(const change of [r=>r.success=false,r=>r.network='stellar:pubnet',r=>r.payer=seller.publicKey(),r=>r.transaction='f'.repeat(64)]){
 const f=fixture();f.switches.changeReceipt=change;check((await runProductionPurchase(f.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');
 check(f.sealed.phase,'payment-uncertain');check(f.signatures,1);check(f.payments,1);scenarios++;
}
for(const change of [r=>r.amount='0.02',r=>r.payer=seller.publicKey(),r=>r.destination=payer.publicKey(),r=>r.inputHash='f'.repeat(64),r=>r.cardHash='f'.repeat(64),r=>r.transactionHash='invalid']){
 const f=fixture();f.switches.changeOrder=change;check((await runProductionPurchase(f.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');
 check(f.signatures,1);check(f.payments,1);scenarios++;
}

const lost=fixture();lost.switches.losePayment=true;await runProductionPurchase(lost.input);
const originalProof=lost.sealed.paymentSignature,originalHash=lost.sealed.payloadHash,readInput={...lost.input,intent:lost.sealed};
const recovered=await recoverProductionPurchase(readInput);check(recovered.status,'RECOVERED_ORIGINAL_OPERATION');check(recovered.additionalPayments,0);check(recovered.additionalSignatures,0);
check(lost.sealed.paymentSignature,originalProof);check(lost.sealed.payloadHash,originalHash);check(lost.payments,1);check(lost.signatures,1);check(lost.reads,1);truth(recovered.deliveryWakeMayOccur);scenarios++;
const text='A synthetic delivered result';lost.order={...lost.order,phase:'delivered',delivery:{text,sha256:sha(text),reference:'bazaar-order:'+lost.intent.operationId}};
const delivered=await recoverProductionPurchase({...lost.input,intent:lost.sealed});check(delivered.delivered,true);check(delivered.deliverySha256,sha(text));check(lost.payments,1);check(lost.signatures,1);check(lost.reads,2);scenarios++;
await rejected(()=>runProductionPurchase({...lost.input,intent:lost.sealed}),/EXISTING_OPERATION_RECOVER_ONLY/);check(lost.payments,1);scenarios++;

const httpOnly=fixture();await runProductionPurchase(httpOnly.input);await recoverProductionPurchase({...httpOnly.input,intent:httpOnly.sealed,marketTool:undefined});
check(httpOnly.reads,1);check(httpOnly.payments,1);check(httpOnly.signatures,1);scenarios++;
const wrongRead=fixture();await runProductionPurchase(wrongRead.input);wrongRead.sealed={...wrongRead.sealed,lastReadAt:'2026-01-01T00:00:00.000Z'};
await rejected(()=>recoverProductionPurchase({...wrongRead.input,intent:happy.sealed}),/SEPARATE_EXACT_PRODUCTION_PAYMENT_APPROVAL_REQUIRED|ORIGINAL_SEALED_JOURNAL_CHANGED/);check(wrongRead.reads,0);scenarios++;
for(const change of [c=>c.approvalHash='f'.repeat(64),c=>c.ownerFingerprint='f'.repeat(64),c=>c.operationId=randomUUID(),c=>c.gates=['invalid'],c=>c.gates=['admission','admission'],c=>c.signatures=2,c=>c.payments=2,c=>c.reservations=[{},{}]]){
 const f=fixture();await runProductionPurchase(f.input);const altered=f.sealed;change(altered.purchaseControl);f.sealed=altered;
 await rejected(()=>recoverProductionPurchase({...f.input,intent:f.sealed}),/ORIGINAL_SEALED_PURCHASE_CONTROL_REQUIRED/);check(f.reads,0);check(f.payments,1);scenarios++;
}

// Synthetic expiry response preserves only technical payment reconciliation.
const expired=fixture();await runProductionPurchase(expired.input);const expiryIntent=expired.sealed;
const control={operationId:expiryIntent.operationId,buyerOwnerId:ownerId,intentHash:digest({operationId:expiryIntent.operationId,serviceId:expiryIntent.card.id,cardHash:expiryIntent.cardHash,payer:expiryIntent.payer,input:expiryIntent.input,paymentProtocol:buyerProtocol}),cardHash:expiryIntent.cardHash,inputHash:expiryIntent.inputHash,payer:expiryIntent.payer,destination:seller.publicKey(),amount:'0.01',settlement:clone(buyerIdentity),paymentProtocol:buyerProtocol,paymentPhase:'confirmed',transactionHash:expired.order.transactionHash,paymentVerifiedAt:expired.order.paymentVerifiedAt};
const expiredResponse={httpStatus:410,error:{code:'ORDER_CONTENT_EXPIRED'},recoveryOnly:true,operation:control};
expired.input.marketTool=async(name,args)=>{check(name,'get_market_order');check(args.operationId,expiryIntent.operationId);return clone(expiredResponse);};
const expiryResult=await recoverProductionPurchase({...expired.input,intent:expiryIntent});check(expiryResult.contentExpired,true);check(expiryResult.delivered,false);check(expired.sealed.order.input,undefined);check(expired.payments,1);check(expired.signatures,1);
await rejected(()=>runProductionPurchase({...expired.input,intent:expired.sealed}),/EXISTING_OPERATION_RECOVER_ONLY/);scenarios++;

const racing=fixture(),first=runProductionPurchase(racing.input);
await rejected(()=>runProductionPurchase({...racing.input,intent:clone(racing.intent)}),/CONCURRENT_PURCHASE_DENIED|EXISTING_OPERATION_RECOVER_ONLY/);
check((await first).status,'CONFIRMED');check(racing.signatures,1);check(racing.payments,1);scenarios++;

truth(happy.events.indexOf('gate:admission')<happy.events.indexOf('tool:create_market_order'));
truth(happy.events.indexOf('gate:authorization')<happy.events.indexOf('sign'));
truth(happy.events.indexOf('gate:submission')<happy.events.indexOf('payment'));
truth(happy.snapshots.some(v=>v.purchaseControl.reservations.length===1&&v.purchaseControl.signatures===0));
truth(happy.snapshots.some(v=>v.purchaseControl.signatures===1&&v.purchaseControl.payments===0));
truth(happy.snapshots.some(v=>v.phase==='payment-ready'&&v.purchaseControl.payments===1));scenarios++;

// Callback mutation cannot replace previously approved objects or capabilities.
const mutation=fixture(),oldGate=mutation.input.consumeGate,oldJournalRead=mutation.journal.read;
mutation.input.consumeGate=async(...args)=>{const r=await oldGate(...args);if(args[0]==='admission'){
 mutation.context.agentAccess='z'.repeat(43);mutation.context.ownerId='ow_'+'77'.repeat(16);
 mutation.policy.maximumAtomic='99999999';mutation.policy.maxSponsoredFeeStroops=1000001;mutation.policy.publicCard.payment.destination=payer.publicKey();
 mutation.approval.amount='999';mutation.intent.input.topic='Changed after review';
 mutation.input.signer.address=seller.publicKey();mutation.input.signer.signAuthEntry=async()=>{throw Error('REPLACED_SIGNER_MUST_NOT_RUN');};
 mutation.journal.read=async()=>{throw Error('REPLACED_JOURNAL_MUST_NOT_RUN');};mutation.journal.append=async()=>{throw Error('REPLACED_JOURNAL_MUST_NOT_RUN');};
 }return r;};
check((await runProductionPurchase(mutation.input)).status,'CONFIRMED');check(mutation.payments,1);check(mutation.signatures,1);
const retained=await oldJournalRead();check(retained.card.payment.destination,seller.publicKey());check(retained.input.topic,'Offline synthetic acceptance');check(retained.purchaseControl.reservations[0].amount,'100000');scenarios++;

const wrongCreate=fixture(),originalCreateTool=wrongCreate.input.marketTool;
wrongCreate.input.marketTool=async(name,args)=>{const r=await originalCreateTool(name,args);if(name==='create_market_order')r.order.buyerOwnerId='ow_'+'77'.repeat(16);return r;};
check((await runProductionPurchase(wrongCreate.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(wrongCreate.creates,1);check(wrongCreate.challenges,0);check(wrongCreate.signatures,0);check(wrongCreate.payments,0);scenarios++;
const wrongPostOwner=fixture();wrongPostOwner.switches.changeOrder=r=>r.buyerOwnerId='ow_'+'77'.repeat(16);
check((await runProductionPurchase(wrongPostOwner.input)).status,'REQUIRES_ORIGINAL_OPERATION_RECOVERY');check(wrongPostOwner.signatures,1);check(wrongPostOwner.payments,1);scenarios++;
const wrongRecoverOwner=fixture();await runProductionPurchase(wrongRecoverOwner.input);const correctSealed=wrongRecoverOwner.sealed;
wrongRecoverOwner.order={...wrongRecoverOwner.order,buyerOwnerId:'ow_'+'77'.repeat(16)};
await rejected(()=>recoverProductionPurchase({...wrongRecoverOwner.input,intent:correctSealed}),/RECOVERED_BUYER_IDENTITY_CHANGED/);
assert.deepEqual(wrongRecoverOwner.sealed,correctSealed);assertions++;check(wrongRecoverOwner.reads,1);check(wrongRecoverOwner.payments,1);scenarios++;
for(const change of [
 c=>c.reservations[0].operationId=randomUUID(),c=>c.reservations[0].payer=seller.publicKey(),
 c=>c.reservations[0].asset='C'+'A'.repeat(55),c=>c.reservations[0].amount='200000',
 c=>c.reservations[0].extra='unapproved',c=>c.reservations=[],c=>c.gates=['submission'],
 c=>c.gates=['admission','submission'],c=>c.signatures=0,
 ]){
 const f=fixture();await runProductionPurchase(f.input);const forged=f.sealed;change(forged.purchaseControl);f.sealed=forged;
 await rejected(()=>recoverProductionPurchase({...f.input,intent:forged}),/ORIGINAL_SEALED_PURCHASE_CONTROL_REQUIRED/);
 check(f.reads,0);check(f.payments,1);scenarios++;
}

// Test only the exported transport constructor. The imported private controller
// is never invoked: no filesystem profile, DPAPI or cloud request is performed.
function transportFixture(recovery=false){
 const operationId=randomUUID(),agentAccess='a'.repeat(43),calls=[];
 const transport=boundedProductionPurchaseTransport({operationId,agentAccess,recovery,fetcher:async(url,init)=>{calls.push({url,method:init.method,headers:new Headers(init.headers),body:init.body});return Response.json({ok:true});}});
 const mcp=(name,args={})=>({method:'POST',headers:{authorization:'Bearer '+agentAccess,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 const request=(method='POST',body='{}')=>({method,headers:{authorization:'Bearer '+agentAccess,'content-type':'application/json'},body});
 return {transport,calls,operationId,agentAccess,mcp,request,endpoint:C.origin+'/api/market/orders/'+operationId+'/x402'};
}
for(const [target,init] of [
 ['https://other.example/api/mcp',f=>f.mcp('get_service',{id:C.serviceId})],
 [C.origin+'/api/bazaar/seller/tick',f=>f.request()],
 [C.origin+'/api/market/orders/'+randomUUID()+'/x402',f=>f.request()],
 [C.origin+'/api/mcp?secret=1',f=>f.mcp('get_service',{id:C.serviceId})],
 [C.origin+'/api/mcp#private',f=>f.mcp('get_service',{id:C.serviceId})],
 [C.origin+'/api/mcp',f=>f.mcp('report_market_capacity',{})],
 [C.origin+'/api/mcp',f=>f.mcp('get_market_order',{operationId:f.operationId})],
 ]){
 const f=transportFixture();await rejected(()=>f.transport.marketFetch(target,init(f)),/PURCHASE_TRANSPORT_BOUND|EXACT_OWN_BUYER_TRANSPORT_REQUIRED|NO_OTHER_ORDER_PROVIDER_OR_TICK_TARGET|ONLY_OWN_PURCHASE_MCP_ALLOWED/);check(f.calls.length,0);scenarios++;
}
const recoverTransport=transportFixture(true);
await recoverTransport.transport.marketFetch(C.origin+'/api/market/orders/'+recoverTransport.operationId,{...recoverTransport.request('GET'),body:undefined});
await recoverTransport.transport.marketFetch(C.origin+'/api/mcp',recoverTransport.mcp('get_market_order',{operationId:recoverTransport.operationId}));
check(recoverTransport.calls.length,2);
await rejected(()=>recoverTransport.transport.marketFetch(recoverTransport.endpoint,recoverTransport.request()),/NO_OTHER_ORDER_PROVIDER_OR_TICK_TARGET/);
await rejected(()=>recoverTransport.transport.rpcFetch('https://soroban-testnet.stellar.org/',{method:'POST',body:JSON.stringify({method:'getLatestLedger'})}),/EXACT_READ_ONLY_TESTNET_RPC_REQUIRED/);check(recoverTransport.calls.length,2);scenarios++;
const deniedRpc=transportFixture();
await rejected(()=>deniedRpc.transport.rpcFetch('https://soroban-testnet.stellar.org/',{method:'POST',body:JSON.stringify({method:'sendTransaction'})}),/NO_RPC_TRANSACTION_SUBMISSION/);check(deniedRpc.calls.length,0);scenarios++;

for(const change of [c=>c.operationId='../../other',c=>c.operationId='invalid',c=>c.agentAccess='short',c=>c.agentAccess='!'.repeat(43),c=>c.recovery='true',c=>c.fetcher=null]){
 const configuration={operationId:randomUUID(),agentAccess:'a'.repeat(43),recovery:false,fetcher:async()=>{throw Error('NO_FAKE_FETCH_EXPECTED');}};change(configuration);
 assert.throws(()=>boundedProductionPurchaseTransport(configuration),/EXACT_LOCAL_PURCHASE_TRANSPORT_CONFIGURATION/);assertions++;scenarios++;
}
for(const init of [
 f=>({...f.mcp('get_bazaar_identity'),body:'x'.repeat(65537)}),
 f=>({...f.mcp('get_bazaar_identity'),headers:{authorization:'Bearer '+f.agentAccess,'x-large':'x'.repeat(65537)}}),
 f=>({...f.mcp('get_bazaar_identity'),headers:{authorization:'Bearer '+'z'.repeat(43)}}),
 f=>({...f.mcp('get_bazaar_identity'),headers:{authorization:'Bearer '+f.agentAccess,'x-vercel-protection-bypass':'forbidden'}}),
 f=>f.mcp('get_service',{id:'other-service'}),
 f=>f.mcp('get_service',{id:C.serviceId,private:'forbidden'}),
 f=>({...f.mcp('get_service',{id:C.serviceId}),headers:{authorization:'Bearer '+f.agentAccess,'payment-signature':'forbidden'}}),
 ]){
 const f=transportFixture();await rejected(()=>f.transport.marketFetch(C.origin+'/api/mcp',init(f)),/PURCHASE_TRANSPORT_BOUND|EXACT_OWN_BUYER_TRANSPORT_REQUIRED|ONLY_ORIGINAL_SERVICE_ALLOWED|ONLY_OWN_PURCHASE_MCP_ALLOWED/);check(f.calls.length,0);scenarios++;
}
const orderArgs=f=>({operationId:f.operationId,serviceId:C.serviceId,cardHash:C.cardHash,payer:C.payer,input:clone(C.defaultInput),paymentProtocol:buyerProtocol});
for(const change of [a=>a.operationId=randomUUID(),a=>a.serviceId='other',a=>a.cardHash='f'.repeat(64),a=>a.payer=seller.publicKey(),a=>a.paymentProtocol='different',a=>a.input.topic='Changed input']){
 const f=transportFixture(),args=orderArgs(f);change(args);
 await rejected(()=>f.transport.marketFetch(C.origin+'/api/mcp',f.mcp('create_market_order',args)),/ONLY_OWN_PURCHASE_MCP_ALLOWED|ONLY_ORIGINAL_ORDER_ONCE_ALLOWED/);check(f.calls.length,0);scenarios++;
}
const onceCreate=transportFixture();await onceCreate.transport.marketFetch(C.origin+'/api/mcp',onceCreate.mcp('create_market_order',orderArgs(onceCreate)));
await rejected(()=>onceCreate.transport.marketFetch(C.origin+'/api/mcp',onceCreate.mcp('create_market_order',orderArgs(onceCreate))),/ONLY_ORIGINAL_ORDER_ONCE_ALLOWED/);check(onceCreate.calls.length,1);scenarios++;
const onceChallenge=transportFixture();await onceChallenge.transport.marketFetch(onceChallenge.endpoint,onceChallenge.request());
await rejected(()=>onceChallenge.transport.marketFetch(onceChallenge.endpoint,onceChallenge.request()),/PAYMENT_CHALLENGE_ONCE_BOUND/);check(onceChallenge.calls.length,1);scenarios++;
const oncePay=transportFixture(),paidInit=oncePay.request();paidInit.headers['payment-signature']='offline-proof';
await oncePay.transport.marketFetch(oncePay.endpoint,paidInit);await rejected(()=>oncePay.transport.marketFetch(oncePay.endpoint,paidInit),/PAYMENT_SUBMISSION_ONCE_BOUND/);check(oncePay.calls.length,1);scenarios++;
let attemptsAfterLoss=0;const lostId=randomUUID(),lostTransport=boundedProductionPurchaseTransport({operationId:lostId,agentAccess:'a'.repeat(43),fetcher:async()=>{attemptsAfterLoss++;throw Error('SYNTHETIC_TRANSPORT_LOSS');}});
const lostInit={method:'POST',headers:{authorization:'Bearer '+'a'.repeat(43),'payment-signature':'offline-proof'},body:'{}'},lostEndpoint=C.origin+'/api/market/orders/'+lostId+'/x402';
await rejected(()=>lostTransport.marketFetch(lostEndpoint,lostInit),/SYNTHETIC_TRANSPORT_LOSS/);await rejected(()=>lostTransport.marketFetch(lostEndpoint,lostInit),/PAYMENT_SUBMISSION_ONCE_BOUND/);check(attemptsAfterLoss,1);scenarios++;
let attested=0,attestFetches=0;const attestId=randomUUID(),attestTransport=boundedProductionPurchaseTransport({operationId:attestId,agentAccess:'a'.repeat(43),attestSubmission:async()=>{attested++;throw Error('SYNTHETIC_SEALED_PROOF_MISMATCH');},fetcher:async()=>{attestFetches++;return Response.json({ok:true});}});
const attestEndpoint=C.origin+'/api/market/orders/'+attestId+'/x402';await rejected(()=>attestTransport.marketFetch(attestEndpoint,lostInit),/SYNTHETIC_SEALED_PROOF_MISMATCH/);await rejected(()=>attestTransport.marketFetch(attestEndpoint,lostInit),/PAYMENT_SUBMISSION_ONCE_BOUND/);check(attested,1);check(attestFetches,0);scenarios++;
for(const [method,allowed] of [['getLatestLedger',1],['getLedgerEntries',1],['simulateTransaction',2]]){
 const f=transportFixture(),init={method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{}})};
 for(let i=0;i<allowed;i++)await f.transport.rpcFetch('https://soroban-testnet.stellar.org/',init);
 await rejected(()=>f.transport.rpcFetch('https://soroban-testnet.stellar.org/',init),/RPC_METHOD_ONCE_BOUND/);check(f.calls.length,allowed);scenarios++;
}
const boundedResponses=[
 ()=>new Response('x'.repeat(262145)),
 ()=>new Response('{}',{headers:{'x-large':'x'.repeat(65537)}}),
 ()=>new Response(null,{status:302,headers:{location:'https://other.example'}}),
 ()=>{const r=Response.json({});Object.defineProperty(r,'url',{value:'https://other.example'});return r;},
 ];
for(const response of boundedResponses){
 const operationId=randomUUID(),transport=boundedProductionPurchaseTransport({operationId,agentAccess:'a'.repeat(43),fetcher:async()=>response()});
 await rejected(()=>transport.marketFetch(C.origin+'/api/mcp',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(43)},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_bazaar_identity',arguments:{}}})}),/PURCHASE_RESPONSE_BOUND|PURCHASE_REDIRECT_DENIED/);scenarios++;
}
const bounds=transportFixture();await bounds.transport.marketFetch(C.origin+'/api/mcp',bounds.mcp('get_bazaar_identity'));
check(bounds.calls[0].headers.get('authorization'),'Bearer '+'a'.repeat(43));check(bounds.calls[0].method,'POST');
check(bounds.transport.counts().marketRequests,1);check(bounds.transport.counts().paymentAttempts,0);scenarios++;
const marketQuota=transportFixture();for(let i=0;i<12;i++)await marketQuota.transport.marketFetch(C.origin+'/api/mcp',marketQuota.mcp('get_bazaar_identity'));
await rejected(()=>marketQuota.transport.marketFetch(C.origin+'/api/mcp',marketQuota.mcp('get_bazaar_identity')),/EXACT_OWN_BUYER_TRANSPORT_REQUIRED/);check(marketQuota.calls.length,12);scenarios++;
const rpcQuota=transportFixture();for(const method of ['getLatestLedger','getLedgerEntries','simulateTransaction','simulateTransaction'])await rpcQuota.transport.rpcFetch('https://soroban-testnet.stellar.org/',{method:'POST',body:JSON.stringify({method})});
await rejected(()=>rpcQuota.transport.rpcFetch('https://soroban-testnet.stellar.org/',{method:'POST',body:JSON.stringify({method:'simulateTransaction'})}),/EXACT_READ_ONLY_TESTNET_RPC_REQUIRED/);check(rpcQuota.calls.length,4);scenarios++;
truth(Object.isFrozen(C.publicCard));truth(Object.isFrozen(C.sourceDigests));
const copiedApproval=productionPurchaseApproval(happy.intent,{approved:true,policy:happy.policy});copiedApproval.sourceDigests.bazaar='f'.repeat(64);
check(happy.policy.sourceDigests.bazaar,C.sourceDigests.bazaar);scenarios++;

console.log(JSON.stringify({status:'PASS',scenarios,assertions,externalRequests:0,realPayments:0,realWalletsRead:0,dpapiReads:0,filesystemWrites:0,syntheticSignaturesPerIntentMaximum:1,syntheticPaymentPostsPerIntentMaximum:1}));
