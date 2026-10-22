import {randomUUID} from 'node:crypto';
import {FeeBumpTransaction,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
import {encodePaymentRequiredHeader} from '@x402/core/http';
import type {SettleResponse} from '@x402/core/types';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {canonical,sha} from './marketplace-identity.ts';
import type {MarketOrderRepository,MarketOrderEnvelope} from './market-order-repository.ts';
import {configuredMarketOrderRepository,combineMarketOrderGuards} from './market-order-storage.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {assertMarketEnabled,assertMarketPurchaseAdmission,sellerPaymentGuard,assertMarketContentLive} from './marketplace.ts';
import {workspaceHeaders} from './workspace-http.ts';
import {operationalRequestGate} from './operational-budget.ts';
import {configuredMarketStore,type MarketOrder} from './marketplace-store.ts';
import type {MarketCommitGuard} from './marketplace-capacity.ts';
import type {MarketX402Settlement} from './marketplace-x402-store.ts';
import {queueMarketTextWake} from './market-text-seller-runtime.ts';
import {assertPerOrderPaymentCapability,perOrderPaymentCapabilityKind,type PerOrderPaymentSimulationDependencies} from './per-order-payment-profile.ts';
import {buyer,createMarketX402Challenge,marketX402OrderBinding,marketX402Authorization,parseProof,assertRecordBinding,paidResponse} from './marketplace-x402.ts';
import {ensurePerOrderSellerPaymentReadiness} from './per-order-seller-readiness.ts';

export type PerOrderX402Dependencies=PerOrderPaymentSimulationDependencies&{repository?:MarketOrderRepository};
const uncertain=()=>new WorkspaceError('X402_PAYMENT_OUTCOME_UNCERTAIN',409);
function repository(id:string,deps:PerOrderX402Dependencies){assertPerOrderPaymentCapability(id,deps);if(perOrderPaymentCapabilityKind(id)==='production'&&deps.repository!==undefined)throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);return deps.repository??configuredMarketOrderRepository();}
function orderIn(record:MarketOrderEnvelope,p:WorkspacePrincipal){
 const order=record.order;if(!order||order.buyerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);
 buyer(p,order);assertMarketContentLive(order);return order;
}
function bound(record:MarketOrderEnvelope,p:WorkspacePrincipal){const order=orderIn(record,p),settlement=record.settlement;if(!settlement)throw new WorkspaceError('X402_SETTLEMENT_BINDING_MISMATCH',409);assertRecordBinding(settlement,order);return {order,settlement};}
function matches(record:MarketOrderEnvelope,p:WorkspacePrincipal,attemptId:string,payloadHash:string,authorizationFingerprint:string){
 const value=bound(record,p);if(value.settlement.attemptId!==attemptId||value.settlement.payloadHash!==payloadHash||value.settlement.authorizationFingerprint!==authorizationFingerprint||value.order.settlementAttemptId!==attemptId)throw new WorkspaceError('OPERATION_CONFLICT',409);return value;
}
function unsignedEnvelope(transaction:string){
 try{const envelope=TransactionBuilder.fromXDR(transaction,Networks.TESTNET);if(envelope instanceof FeeBumpTransaction||envelope.signatures.length!==0)throw Error();}
 catch{throw new WorkspaceError('X402_AUTHORIZATION_MISMATCH',402);}
}
/** Native writes are single attempts. Any failed acknowledgement exits this
 * invocation; a subsequent explicit request reads the same durable operation. */
async function change(repo:MarketOrderRepository,id:string,p:WorkspacePrincipal,record:MarketX402Settlement,op:(order:MarketOrder,settlement:MarketX402Settlement)=>void,guard?:MarketCommitGuard){
 if(!record.attemptId||!record.payloadHash||!record.authorizationFingerprint)throw uncertain();
 return repo.transact(id,envelope=>{const current=matches(envelope,p,record.attemptId!,record.payloadHash!,record.authorizationFingerprint!);op(current.order,current.settlement);const now=new Date().toISOString();current.order.updatedAt=now;current.settlement.updatedAt=now;return current;},{guard});
}
async function reject(repo:MarketOrderRepository,id:string,p:WorkspacePrincipal,record:MarketX402Settlement){
 return change(repo,id,p,record,(order,settlement)=>{
  if(!['verifying','settling'].includes(settlement.phase)||settlement.transactionHash||settlement.outcome||order.transactionHash||order.paymentVerifiedAt)throw new WorkspaceError('OPERATION_CONFLICT',409);
  settlement.phase='rejected';order.phase='awaiting-payment';
  // The immutable seat expiry is preserved. A definitive no-send releases its
  // committed status; the unpaid seat expires at its original short deadline.
  if(order.sellerReservation)order.sellerReservation.committed=false;
 });
}
async function markUncertain(repo:MarketOrderRepository,id:string,p:WorkspacePrincipal,record:MarketX402Settlement){
 return change(repo,id,p,record,(order,settlement)=>{
  if(['confirmed','rejected'].includes(settlement.phase))throw new WorkspaceError('OPERATION_CONFLICT',409);
  settlement.phase='uncertain';if(['payment-submitting','payment-uncertain'].includes(order.phase))order.phase='payment-uncertain';
 });
}
function validOutcome(outcome:SettleResponse,order:MarketOrder){return outcome?.network==='stellar:testnet'&&outcome.payer===order.payer&&typeof outcome.transaction==='string'&&/^[a-f0-9]{64}$/.test(outcome.transaction);}
async function providerReady(id:string,deps:PerOrderX402Dependencies){
 assertPerOrderPaymentCapability(id,deps);
 if(perOrderPaymentCapabilityKind(id)!=='production')return;
 const provider=await import('./per-order-production-provider.ts');
 assertPerOrderPaymentCapability(id,deps);await provider.assertPerOrderProductionProviderReady(id);assertPerOrderPaymentCapability(id,deps);
}
async function quoteGuard(order:MarketOrder,p:WorkspacePrincipal,budgetProfile?:'batch-v1'){
 const expiry=Date.parse(order.sellerReservation?.expiresAt??'');
 if(!Number.isFinite(expiry)||expiry<=Date.now()||order.sellerReservation?.committed)throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);
 const market=configuredMarketStore();if(!market.orderAdmissionSnapshot)throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);
 const snapshot=await market.orderAdmissionSnapshot(),service=snapshot.state.services.find(value=>value.card.id===order.serviceId&&value.ownerId===order.sellerOwnerId&&value.cardHash===order.cardHash&&!value.withdrawn);
 if(budgetProfile==='batch-v1'){const capacity=snapshot.state.sellerCapacities?.find(c=>c.serviceId===order.serviceId&&c.cardHash===order.cardHash&&c.ownerId===order.sellerOwnerId);if(!capacity||!capacity.ready||Date.parse(capacity.leaseExpiresAt)-Date.now()<60000)throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);}
 if(snapshot.state.paused||!service)throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 const identity=await configuredWorkspaceStore().walletIdentity(p);
 if(!identity.guard)throw new WorkspaceError('AUTHORIZATION_SNAPSHOT_CHANGED',409);
 // A402 response quotes a previously accepted immutable order. It does not
 // reserve a new seller slot or authorize payment. Signed admission performs
 // the full fresh review, capacity and both-generation checks below.
 return combineMarketOrderGuards(snapshot.guard,identity.guard,{keys:[],values:[],admissionExpiresAt:expiry});
}
async function finalize(repo:MarketOrderRepository,id:string,p:WorkspacePrincipal,record:MarketX402Settlement,deps:PerOrderX402Dependencies){
 const current=await repo.read(id);if(!current)throw new WorkspaceError('NOT_FOUND',404);const value=bound(current,p),o=value.order,r=value.settlement;
 if(r.attemptId!==record.attemptId||r.payloadHash!==record.payloadHash||r.authorizationFingerprint!==record.authorizationFingerprint)throw new WorkspaceError('OPERATION_CONFLICT',409);
 const transaction=r.transactionHash??r.outcome?.transaction;
 if(!transaction||!/^[a-f0-9]{64}$/.test(transaction)||!r.authorizationFingerprint||o.transactionHash!==transaction)throw uncertain();
 if(r.phase==='confirmed'){
  if(!o.paymentVerifiedAt||!['paid','executing','execution-uncertain','delivered','delivery-failed'].includes(o.phase)||r.outcome?.transaction!==transaction||r.outcome?.success!==true)throw uncertain();
  return {order:o,settlement:r};
 }
 if(!['settling','settled','uncertain'].includes(r.phase))throw uncertain();
 assertPerOrderPaymentCapability(id,deps);const chain=await deps.rpc.transaction(transaction);
 if(chain.status!=='SUCCESS'||!chain.envelopeXdr)throw uncertain();
 const proof=marketX402Authorization(chain.envelopeXdr,o,true);
 if(proof.transactionHash!==transaction||proof.fingerprint!==r.authorizationFingerprint)throw new WorkspaceError('X402_PAYMENT_NOT_VERIFIED',409);
 const submitted=TransactionBuilder.fromXDR(chain.envelopeXdr,Networks.TESTNET),feeSource=submitted instanceof FeeBumpTransaction?submitted.feeSource:submitted.source;
 if(feeSource===o.payer)throw new WorkspaceError('X402_PAYMENT_NOT_VERIFIED',409);
 const receipt:SettleResponse={success:true,network:'stellar:testnet',payer:o.payer,transaction};
 return change(repo,id,p,r,(order,settlement)=>{
  if(!['settling','settled','uncertain'].includes(settlement.phase)||settlement.transactionHash!==transaction||order.transactionHash!==transaction||order.paymentVerifiedAt||!['payment-submitting','payment-uncertain'].includes(order.phase))throw new WorkspaceError('OPERATION_CONFLICT',409);
  settlement.phase='confirmed';settlement.outcome=receipt;order.phase='paid';order.paymentVerifiedAt=new Date().toISOString();
  queueMarketTextWake({version:1,services:[],orders:[]},order,Date.parse(order.paymentVerifiedAt));
 });
}

/** The state machine accepts only the exact dependencies bound to an explicit
 * offline simulation or reviewed, operation-scoped production capability. */
export async function executePerOrderX402Payment(p:WorkspacePrincipal,id:string,origin:string,signature:string|undefined,deps:PerOrderX402Dependencies):Promise<Response>{
 const repo=repository(id,deps);assertMarketEnabled();let envelope=await repo.read(id);if(!envelope)throw new WorkspaceError('NOT_FOUND',404);
 let order=orderIn(envelope,p),record=envelope.settlement;const hadChallenge=Boolean(record);
 if(!record){
  if(order.phase!=='awaiting-payment')throw new WorkspaceError('X402_SETTLEMENT_UNAVAILABLE',409);
  assertMarketPurchaseAdmission(p);const guard=await quoteGuard(order,p,envelope.budgetProfile);await operationalRequestGate({profile:'authenticated',newOperation:true,workload:'financial'});
  const challenge=createMarketX402Challenge(order,origin);
  record=await repo.transact(id,current=>{const native=orderIn(current,p);assertMarketPurchaseAdmission(p);if(current.settlement||native.phase!=='awaiting-payment')throw new WorkspaceError('OPERATION_CONFLICT',409);const now=new Date().toISOString();current.settlement={operationId:id,buyerOwnerId:p.ownerId,orderBinding:marketX402OrderBinding(native),challenge,phase:'challenged',createdAt:now,updatedAt:now};return current.settlement;},{guard});
 }
 assertRecordBinding(record,order);
 if(!signature){
  if(hadChallenge&&envelope.budgetProfile==='batch-v1'&&record.phase==='challenged')await quoteGuard(order,p,envelope.budgetProfile);
  if(record.phase==='confirmed'){const paid=await finalize(repo,id,p,record,deps);return paidResponse(paid.order,paid.settlement,origin);}
  if(record.phase!=='challenged')throw new WorkspaceError(record.phase==='rejected'?'X402_PAYMENT_REJECTED':'X402_PAYMENT_OUTCOME_UNCERTAIN',record.phase==='rejected'?402:409);
  return Response.json(record.challenge,{status:402,headers:{...workspaceHeaders,'PAYMENT-REQUIRED':encodePaymentRequiredHeader(record.challenge)}});
 }
 const proof=parseProof(signature,record,order);unsignedEnvelope(proof.payload.payload.transaction as string);
 if(record.payloadHash){
  if(record.payloadHash!==proof.payloadHash||record.authorizationFingerprint!==proof.authorizationFingerprint)throw new WorkspaceError('OPERATION_CONFLICT',409);
  if(record.phase==='confirmed'){const paid=await finalize(repo,id,p,record,deps);return paidResponse(paid.order,paid.settlement,origin);}
  throw new WorkspaceError(record.phase==='rejected'?'X402_PAYMENT_REJECTED':'X402_PAYMENT_OUTCOME_UNCERTAIN',record.phase==='rejected'?402:409);
 }
 assertMarketPurchaseAdmission(p);await providerReady(id,deps);await ensurePerOrderSellerPaymentReadiness(order,p,await quoteGuard(order,p,envelope.budgetProfile),envelope.budgetProfile);const paymentGuard=await sellerPaymentGuard(order,p);await operationalRequestGate({profile:'authenticated',newOperation:true,workload:'financial'});const attemptId=randomUUID();
 // The proof, permanent nonce claim and submitting order are accepted together.
 const verifying=await repo.transact(id,current=>{const native=orderIn(current,p),r=current.settlement;if(!r)throw new WorkspaceError('OPERATION_CONFLICT',409);assertRecordBinding(r,native);assertMarketPurchaseAdmission(p);if(r.phase!=='challenged'||r.payloadHash||native.phase!=='awaiting-payment')throw new WorkspaceError('OPERATION_CONFLICT',409);Object.assign(r,proof,{attemptId,phase:'verifying',updatedAt:new Date().toISOString()});native.phase='payment-submitting';native.settlementAttemptId=attemptId;native.updatedAt=r.updatedAt;if(native.sellerReservation)native.sellerReservation.committed=true;return {order:native,settlement:r};},{guard:paymentGuard});record=verifying.settlement;order=verifying.order;
 let verified;assertPerOrderPaymentCapability(id,deps);
 try{verified=await deps.facilitator.verify(proof.payload,record.challenge.accepts[0]);}
 catch{await reject(repo,id,p,record);throw new WorkspaceError('X402_PAYMENT_REJECTED',402);}
 if(verified?.isValid!==true||verified.payer!==order.payer){await reject(repo,id,p,record);throw new WorkspaceError('X402_PAYMENT_REJECTED',402);}
 let guard:MarketCommitGuard;try{assertMarketPurchaseAdmission(p);await providerReady(id,deps);guard=await sellerPaymentGuard(order,p);}catch(error){await reject(repo,id,p,record);throw error;}
 const wallStart=Date.now(),monotonicStart=performance.now();
 const settling=await change(repo,id,p,record,(_order,r)=>{if(r.phase!=='verifying')throw new WorkspaceError('OPERATION_CONFLICT',409);r.phase='settling';},guard);record=settling.settlement;order=settling.order;
 const admissionNow=Math.max(Date.now(),wallStart+Math.max(0,performance.now()-monotonicStart));
 try{if(!Number.isSafeInteger(guard.admissionExpiresAt)||admissionNow>=guard.admissionExpiresAt!)throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);assertMarketPurchaseAdmission(p);}catch(error){await reject(repo,id,p,record);throw error;}
 let outcome:SettleResponse;assertPerOrderPaymentCapability(id,deps);
 try{outcome=await deps.facilitator.settle(proof.payload,record.challenge.accepts[0]);}
 catch{await markUncertain(repo,id,p,record);throw uncertain();}
 // Persist a returned hash even when success is not yet established. A failed
 // outcome-save ACK exits without another write or any automatic external call.
 const saved=await change(repo,id,p,record,(o,r)=>{if(r.phase!=='settling')throw new WorkspaceError('OPERATION_CONFLICT',409);r.responseHash=sha(canonical(outcome));if(validOutcome(outcome,o)){r.transactionHash=outcome.transaction;o.transactionHash=outcome.transaction;}if(outcome.success===true&&validOutcome(outcome,o)){r.phase='settled';r.outcome={success:true,network:'stellar:testnet',transaction:outcome.transaction,payer:o.payer};}else{r.phase='uncertain';o.phase='payment-uncertain';}});record=saved.settlement;
 if(outcome.success!==true||!validOutcome(outcome,saved.order))throw uncertain();
 let paid;try{paid=await finalize(repo,id,p,record,deps);}catch(error){if(error instanceof WorkspaceError)throw error;throw uncertain();}
 return paidResponse(paid.order,paid.settlement,origin);
}
/** An explicit recovery request can only read the one already saved hash.
 * It never verifies again, adopts an arbitrary hash, settles or submits. */
export async function reconcilePerOrderX402Payment(p:WorkspacePrincipal,id:string,deps:PerOrderX402Dependencies){
 const repo=repository(id,deps),current=await repo.read(id);if(!current)throw new WorkspaceError('NOT_FOUND',404);const {settlement}=bound(current,p);
 if(!settlement.transactionHash&&!settlement.outcome?.transaction)throw uncertain();
 try{return (await finalize(repo,id,p,settlement,deps)).order;}catch(error){if(error instanceof WorkspaceError)throw error;throw uncertain();}
}
