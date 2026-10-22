import {randomUUID} from 'node:crypto';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import type {MarketOrder} from './marketplace-store.ts';
import {configuredMarketStore} from './marketplace-store.ts';
import {configuredMarketOrderRepository,perOrderAdmissionSnapshot,combineMarketOrderGuards,perOrderOperationId,marketPerOrderStorageEnabled} from './market-order-storage.ts';
import {perOrderBinding} from './market-order-repository.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {inspectSellerReadinessReservation,SELLER_PAYMENT_READINESS_MARGIN_MS} from './market-seller-capacity.ts';
import {getSubmissionForOperator} from './provider-self-listing.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {assertMarketPurchaseAdmission,assertMarketDeliveryAdmission,assertMarketContentLive} from './marketplace.ts';
import {assertExternalBuyerPilotPurchase} from './external-buyer-pilot.ts';
import {assertPublicBuyerPurchase,assertPublicBuyerOrderQuota} from './public-buyer-admission.ts';
import {isOnDemandTextService,ensureMarketTextReadiness,createMarketTextSellerRuntime,textSellerConfiguration} from './market-text-seller-runtime.ts';
import {isPerOrderPaymentEnabled,perOrderPaymentCapabilityKind} from './per-order-payment-profile.ts';
import {meteredExternal,withPerOrderProductionBackgroundMeter} from './acceptance-meter.ts';
import type {MarketCommitGuard} from './marketplace-capacity.ts';

const unavailable=()=>new WorkspaceError('SELLER_UNAVAILABLE',503,60);
const unconfirmed=()=>new WorkspaceError('SELLER_READINESS_RENEWAL_UNCONFIRMED',503,60);
/** The new signed flow gives readiness its own bounded background accounting.
 * This fetch exists only inside the reviewed factory, never in HTTP arguments. */
function observedReadinessFetch(operationId:string,order:MarketOrder):typeof fetch{
 return async(input,init)=>{
  const assertEnabled=()=>{if(!isPerOrderPaymentEnabled(operationId)||perOrderPaymentCapabilityKind(operationId)!=='production')throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);};assertEnabled();
  const binding=textSellerConfiguration(process.env,{serviceId:order.serviceId,cardHash:order.cardHash,sellerOwnerId:order.sellerOwnerId}),target=String(input instanceof Request?input.url:input);if(!binding||target!==binding.url||init?.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||Buffer.byteLength(init.body)>256)throw unavailable();
  const body=JSON.parse(init.body);if(body.mode!=='readiness'||Object.keys(body).sort().join(',')!=='budgetProfile,mode'||body.budgetProfile!=='bazaar-text-redis-wire/v2')throw unavailable();
  const outgoing=Buffer.byteLength(init.body)+Buffer.byteLength(JSON.stringify([...new Headers(init.headers)]));let incoming=0;
  return meteredExternal('provider',async()=>{
   assertEnabled();const response=await globalThis.fetch(input,init);incoming=Buffer.byteLength(JSON.stringify([...response.headers]));
   if(response.redirected||response.url&&response.url!==target||response.headers.has('location')||incoming>4096){await response.body?.cancel().catch(()=>{});throw unavailable();}
   const reader=response.body?.getReader(),parts:Uint8Array[]=[];if(!reader)throw unavailable();let bodyBytes=0;
   try{for(;;){const part=await reader.read();if(part.done)break;bodyBytes+=part.value.byteLength;incoming+=part.value.byteLength;if(bodyBytes>8192){await reader.cancel();throw unavailable();}parts.push(part.value);}}finally{reader.releaseLock();}
   return new Response(Buffer.concat(parts),{status:response.status,headers:response.headers});
  },{origin:new URL(target).origin,path:new URL(target).pathname,method:'POST'},()=>({outboundBytes:outgoing,inboundBytes:incoming}));
 };
}
/** Only a first, parsed payment proof may call this helper. It cannot return a
 * financial guard, consume a nonce or mark a seller seat committed. A guarded
 * native UUID is saved before the single possible readiness debit and POST. */
export async function ensurePerOrderSellerPaymentReadiness(order:MarketOrder,p:WorkspacePrincipal,quoteGuard:MarketCommitGuard,budgetProfile?:'batch-v1'):Promise<void>{
 const id=order.operationId,assertEnabled=()=>{if(!perOrderOperationId(id)||!marketPerOrderStorageEnabled(id)||!isPerOrderPaymentEnabled(id))throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);};assertEnabled();
 if(p.ownerId!==order.buyerOwnerId||!['human','agent'].includes(p.role))throw new WorkspaceError('NOT_FOUND',404);
 if(order.phase!=='awaiting-payment'||order.executionMode!=='on-demand'||order.paymentVerifiedAt||order.transactionHash||order.sellerReservation?.committed)throw new WorkspaceError('OPERATION_CONFLICT',409);
 assertMarketContentLive(order);assertMarketPurchaseAdmission(p);assertMarketDeliveryAdmission(order.card);
 const now=Date.now(),day=new Date(now).toISOString().slice(0,10),expiry=Date.parse(order.sellerReservation?.expiresAt??'');
 if(!Number.isFinite(expiry)||expiry<=now||order.sellerReservation?.day!==day||order.createdAt.slice(0,10)!==day)throw new WorkspaceError('SELLER_RESERVATION_EXPIRED',503,60);
 const store=configuredMarketStore();if(!store.orderAdmissionSnapshot)throw unavailable();
 const cached=await store.orderAdmissionSnapshot(),existing=cached.state.sellerCapacities?.find(c=>c.serviceId===order.serviceId&&c.cardHash===order.cardHash&&c.ownerId===order.sellerOwnerId);
 // A lease with an entire bounded financial request remaining needs no refresh
 // or marker. The strict financial guard below still validates every rule.
 if(existing&&Date.parse(existing.leaseExpiresAt)-Date.now()>=SELLER_PAYMENT_READINESS_MARGIN_MS)return;
 // A reduced NEW hold never finances a cold financial renewal. Old envelopes
 // retain the existing automatic readiness and its original reservation.
 if(budgetProfile==='batch-v1')throw unavailable();
 const snapshot=await perOrderAdmissionSnapshot(order.buyerOwnerId,order.sellerOwnerId),state=snapshot.state,service=state.services.find(s=>s.card.id===order.serviceId&&s.cardHash===order.cardHash&&s.ownerId===order.sellerOwnerId&&!s.withdrawn);
 if(!service||state.paused||!isOnDemandTextService(service))throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 const review=await getSubmissionForOperator(service.submissionId,false);if(!review.ok||review.value.status!=='activated'||computeCanonicalServiceCardHash(review.value.card)!==service.cardHash)throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 const externalExpiry=assertExternalBuyerPilotPurchase(order.buyerOwnerId,order,service);assertPublicBuyerPurchase(order.buyerOwnerId,order,service);assertPublicBuyerOrderQuota(state,p.ownerId,order);
 const history=await configuredMarketOrderRepository().admissionSnapshot(order.sellerOwnerId,'seller',{limit:50});let committed=0;
 for(const record of history.records){if(record.sellerOwnerId!==order.sellerOwnerId||record.cardHash!==order.cardHash||record.phase&&record.serviceId!==order.serviceId||Date.parse(record.createdAt)>Date.now())throw new WorkspaceError('PER_ORDER_ADMISSION_UNAVAILABLE',503);if(record.phase?record.sellerReservation?.day===day&&record.sellerReservation.committed:record.createdAt.slice(0,10)===day&&record.paymentPhase==='confirmed')committed++;}
 if(history.nextCursor&&(!history.nextCreatedAt||history.nextCreatedAt.slice(0,10)>=day))throw new WorkspaceError('PER_ORDER_ADMISSION_WINDOW_CAPACITY',503);
 for(const capacity of state.sellerCapacities??[])if(capacity.ownerId===order.sellerOwnerId&&capacity.day===day)capacity.admittedUsed+=committed;
 const eligible=inspectSellerReadinessReservation(state,order),capacity=state.sellerCapacities!.find(c=>c.serviceId===order.serviceId&&c.cardHash===order.cardHash&&c.ownerId===order.sellerOwnerId)!;
 const workspace=configuredWorkspaceStore();let seller,buyer;
 try{seller=(await workspace.walletIdentity({role:'agent',ownerId:capacity.ownerId,workspaceId:capacity.workspaceId,agentId:capacity.agentId,generation:capacity.generation})).guard;buyer=(await workspace.walletIdentity(p)).guard;}catch(error){if(error instanceof WorkspaceError&&['UNAUTHORIZED','FORBIDDEN'].includes(error.code))throw unavailable();throw error;}
 if(!seller||!buyer||!seller.keys[0]||seller.keys.length!==seller.values.length||buyer.keys[0]!==seller.keys[0]||buyer.values[0]!==seller.values[0])throw new WorkspaceError('AUTHORIZATION_SNAPSHOT_CHANGED',409);
 if(!eligible.renewalRequired)return;
 const guard=combineMarketOrderGuards(quoteGuard,snapshot.guard,history.guard,{keys:seller.keys.slice(0,1),values:seller.values.slice(0,1),admissionExpiresAt:Math.min(expiry,Date.parse(day+'T00:00:00.000Z')+86400000,externalExpiry??Infinity)});
 assertEnabled();await configuredMarketOrderRepository().transact(id,current=>{
  assertEnabled();const native=current.order,r=current.settlement;
  if(!native||native.buyerOwnerId!==p.ownerId||current.binding!==perOrderBinding(order)||native.phase!=='awaiting-payment'||native.sellerReservation?.committed||!r||r.phase!=='challenged'||r.payloadHash)throw new WorkspaceError('OPERATION_CONFLICT',409);
  if(current.readinessAttemptId)throw unconfirmed();
  current.readinessAttemptId=randomUUID();return undefined;
 },{guard});
 // Any unknown marker acknowledgement exits above, before charging background
 // budget or contacting the provider. There is deliberately no retry loop.
 assertEnabled();
 if(perOrderPaymentCapabilityKind(id)==='production')await withPerOrderProductionBackgroundMeter(id,()=>createMarketTextSellerRuntime({fetch:observedReadinessFetch(id,order)}).readiness(service,order,true));
 else await ensureMarketTextReadiness(service,order,true);
 assertEnabled();
}
