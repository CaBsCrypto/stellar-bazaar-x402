import {maximumMarketRecordBytes} from './marketplace-capacity.ts';
import {demoEnabled} from './demo-wallet.ts';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';
import {z} from 'zod';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {configuredMarketStore,type MarketOrder,type MarketService} from './marketplace-store.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {parseServiceCardShape} from './service-card-schema.ts';
import {validateCardRules} from './service-ingest.ts';
import {isReservedServiceId,withdrawDynamicServiceCard} from './dynamic-registry.ts';
import {submitProviderDraft,getSubmissionForOperator,getMarketReviewSnapshot,type ProviderSubmission} from './provider-self-listing.ts';
import type {ServiceCard} from './types.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {reserveMarketFilesInState,assertMarketFileDeliveryReady} from './market-file-delivery.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {marketIntentHash,marketRecoveryRecord,type MarketRecovery} from './market-retention-schema.ts';
import {configuredMarketX402Store} from './marketplace-x402-store.ts';
import {demoConfiguration} from './demo-configuration.ts';
import {purchaseAdmissionConfiguration} from './market-purchase-admission.ts';
import {freeDemoWindow} from './free-demo-window.ts';
import {probeMarketStorage} from './market-storage-probe.ts';
import { creditOperationalPrincipal } from './acceptance-meter.ts';
import {isOnDemandTextService,ensureMarketTextReadiness} from './market-text-seller-runtime.ts';
import {assertExternalBuyerPilotPurchase} from './external-buyer-pilot.ts';
import {assertCompactV2NewOrderInput} from './free-plan-transport-profile.ts';
import {assertPublicBuyerPurchase,assertPublicBuyerOrderQuota,assertNewPublicBuyerOperationId} from './public-buyer-admission.ts';

import {sha,canonical,orderMemo} from './marketplace-identity.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {marketSubmissionGuard} from './market-permissions.ts';
import {marketPage,type MarketPageInput} from './market-pagination.ts';
import {marketplacePurchaseDescriptor} from './marketplace-discovery.ts';
import {marketSearchQuery,rankMarketRecords} from './market-search.ts';
import {sellerCapacityReportSchema,reportCapacityInState,reserveSellerCapacity,assertSellerReservation,sellerCapacityDto} from './market-seller-capacity.ts';
import {sellerAdmissionExpiresAt} from './marketplace-capacity.ts';
import {marketPerOrderStorageEnabled,perOrderOperationId,LEGACY_ORIGINAL_MARKET_OPERATION,configuredMarketOrderRepository,perOrderAdmissionSnapshot,combineMarketOrderGuards,listPerOrderMarketOrdersPage,assertMarketOrderFinancialStorage} from './market-order-storage.ts';
export {sha,canonical} from './marketplace-identity.ts';
export const marketEnabled=()=>process.env.BAZAAR_ENABLE_MARKETPLACE==='true';
export function assertMarketEnabled(){if(!marketEnabled())throw new WorkspaceError('MARKET_DISABLED',503);if(process.env.VERCEL==='1'&&!demoConfiguration().features.catalogue.enabled)throw new WorkspaceError('MARKET_CONFIGURATION_INCOMPLETE',503);}
/** Fresh admission only. Existing order/payment recovery must precede this guard. */
export function assertMarketPurchaseAdmission(p?:Pick<WorkspacePrincipal,'ownerId'|'purpose'>){
 if(p?.purpose==='treasury-controls')throw new WorkspaceError('TREASURY_CONTROL_SCOPE',403);
 if(process.env.BAZAAR_X402_MARKETPLACE_ENABLED!=='true')throw new WorkspaceError('X402_PAYMENTS_DISABLED',503);
 if(process.env.BAZAAR_ENABLE_MARKET_PURCHASES!=='true')throw new WorkspaceError('PURCHASES_PAUSED',503);
 if(!freeDemoWindow().admissionOpen)throw new WorkspaceError('PURCHASES_PAUSED',503);
 const admission=purchaseAdmissionConfiguration(process.env,p?.ownerId);
 if(!admission.configured)throw new WorkspaceError('PURCHASE_ADMISSION_CONFIGURATION_INCOMPLETE',503);
 if(!admission.allowed)throw new WorkspaceError('BUYER_ADMISSION_RESTRICTED',503);
 if(process.env.VERCEL==='1'&&!demoConfiguration(process.env,p?.ownerId).features.purchases.enabled)throw new WorkspaceError('X402_CONFIGURATION_INCOMPLETE',503);
}
export function assertMarketDeliveryAdmission(card:ServiceCard){if(deliveryStorage(card.delivery).mode!=='text'&&process.env.BAZAAR_MARKET_FILES_ENABLED!=='true')throw new WorkspaceError('FILE_STORAGE_DISABLED',503);}
export const newServiceSchema=z.object({submissionId:z.string().uuid(),card:z.unknown(),controlProof:z.object({method:z.enum(['dns-txt','http-well-known']),domain:z.string().max(253)}).strict()}).strict();
export const newOrderSchema=z.object({operationId:z.string().uuid(),serviceId:z.string().min(1).max(100),cardHash:z.string().regex(/^[a-f0-9]{64}$/),payer:z.string().regex(/^G[A-Z2-7]{55}$/),input:z.record(z.string(),z.union([z.string().max(2000),z.number().finite(),z.boolean()])),paymentProtocol:z.literal('x402-stellar-exact-v2')}).strict();
export const orderActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare')}).strict(),
 z.object({action:z.literal('pay'),signedXdr:z.string().min(20).max(16000)}).strict(),
 z.object({action:z.literal('reconcile'),transactionHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict(),
 z.object({action:z.literal('claim'),attemptId:z.string().uuid()}).strict(),
 z.object({action:z.literal('deliver'),attemptId:z.string().uuid(),text:z.string().min(1).max(2000),manifestHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict(),
 z.object({action:z.literal('fail'),attemptId:z.string().uuid(),reason:z.string().min(1).max(500)}).strict(),
 z.object({action:z.literal('execution-uncertain'),attemptId:z.string().uuid(),reason:z.string().min(1).max(500)}).strict(),
]);
function submissionToken(id:string,owner:string){const secret=process.env.BAZAAR_MARKET_REVIEW_SECRET;if(!secret||secret.length<32)throw new WorkspaceError('MARKET_UNAVAILABLE');return createHmac('sha256',secret).update(`${owner}:${id}`).digest('hex');}
function human(p:WorkspacePrincipal){if(p.role!=='human')throw new WorkspaceError('FORBIDDEN',403);}
export function marketCard(raw:unknown):ServiceCard {
 const parsed=parseServiceCardShape(raw);if(!parsed.ok)throw new WorkspaceError('INVALID_SERVICE',400);
 const c=parsed.card,u=new URL(c.url);
 // The reviewed card freezes its positive price, exact Testnet asset and delivery mode.
 if(c.kind!=='http'||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(u.port&&u.port!=='443')||!StrKey.isValidEd25519PublicKey(c.payment.destination)||c.network!=='stellar:testnet'||c.payment.scheme!=='exact'||c.payment.asset!=='USDC'||!isCanonicalUsdcTestnet(c.payment.identity)||c.paymentOptions||c.payment.marketplace?.protocol!=='x402-stellar-exact-v2'||c.payment.marketplace.resourceTemplate!=='/api/market/orders/{operationId}/x402'||!c.delivery||(deliveryStorage(c.delivery).mode==='text'&&c.delivery.result.contentType!=='text/plain')||!c.delivery.idempotency.required||isReservedServiceId(c.id)||validateCardRules(c).failedOutcomes.length)throw new WorkspaceError('INVALID_SERVICE',400);
 return c;
}
export async function submitMarketService(p:WorkspacePrincipal,input:z.infer<typeof newServiceSchema>){
 newServiceSchema.parse(input);const guard=await marketSubmissionGuard(p),card=marketCard(input.card),cardHash=computeCanonicalServiceCardHash(card),token=submissionToken(input.submissionId,p.ownerId);
 // Persist ownership before entering the existing review queue. Explicit replay uses the same intent.
 await configuredMarketStore().transact(s=>{if(s.paused)throw new WorkspaceError('MARKET_PAUSED');const old=s.services.find(v=>v.submissionId===input.submissionId);if(old){if(old.ownerId!==p.ownerId||old.cardHash!==cardHash)throw new WorkspaceError('SUBMISSION_CONFLICT',409);return;}
 if(!freeDemoWindow().admissionOpen)throw new WorkspaceError('ADMISSIONS_PAUSED',503);
 if(s.services.some(v=>v.card.id===card.id))throw new WorkspaceError('SERVICE_CONFLICT',409);
 s.services.push({submissionId:input.submissionId,ownerId:p.ownerId,cardHash,card,withdrawn:false,createdAt:new Date().toISOString()});},guard);
 const result=await submitProviderDraft(card,input.controlProof,{submissionId:input.submissionId,submissionToken:token});
 if(!result.ok)throw new WorkspaceError(result.error.code,result.error.code==='STORE_UNAVAILABLE'?503:409);
 return result.value;
}
async function reviewed(service:MarketService){const r=await getSubmissionForOperator(service.submissionId,false);if(!r.ok){if(r.error.code==='SUBMISSION_NOT_FOUND')return undefined;throw new WorkspaceError('REVIEW_UNAVAILABLE');}if(computeCanonicalServiceCardHash(r.value.card)!==service.cardHash)throw new WorkspaceError('REVIEW_MISMATCH');return r.value;}
type ServiceSnapshot = { service: MarketService; review?: ProviderSubmission; active: boolean;availability?:ReturnType<typeof sellerCapacityDto> };
export async function marketServiceSnapshot() {
 const snapshot=await configuredMarketStore().transact(s=>({services:s.services,paused:s.paused??false,availability:Object.fromEntries(s.services.map(v=>[v.submissionId,sellerCapacityDto(s,v.card.id,v.cardHash)]))}));
 if(!snapshot.services.length)return {records:[] as ServiceSnapshot[],paused:snapshot.paused};
 const [reviews,owners]=await Promise.all([getMarketReviewSnapshot(snapshot.services.map(s=>s.submissionId)),configuredWorkspaceStore().activeOwnerIds(snapshot.services.map(s=>s.ownerId))]);
 if(!reviews.ok)throw new WorkspaceError('REVIEW_UNAVAILABLE');
 const byId=new Map(reviews.value.map(r=>[r.submissionId,r]));
 const records=snapshot.services.map(service=>{const review=byId.get(service.submissionId);if(review&&computeCanonicalServiceCardHash(review.card)!==service.cardHash)throw new WorkspaceError('REVIEW_MISMATCH');let purchasable=false;try{marketCard(service.card);purchasable=true;}catch{}return {service,review,active:purchasable&&!service.withdrawn&&review?.status==='activated'&&owners.has(service.ownerId),availability:snapshot.availability[service.submissionId]};});
 return {records,paused:snapshot.paused};
}
export function marketServiceDto({service,review,availability}:ServiceSnapshot,owner=false,origin?:string){let onDemand=false;try{onDemand=isOnDemandTextService(service);}catch{}return {submissionId:service.submissionId,card:service.card,cardHash:service.cardHash,execution:'seller-mcp-task' as const,status:service.withdrawn?'withdrawn':review?.status??'submission-unconfirmed',...(availability?{availability:{...availability,...(onDemand?{mode:'on-demand' as const,...(!availability.ready&&availability.reason!=='SELLER_CAPACITY_EXHAUSTED'?{reason:'CHECK_ON_ORDER'}:{})}:{})}}:{}),...(owner&&review?{control:review.control,...(review.review?{review:{decision:review.review.decision,reasons:review.review.reasons,reviewedAt:review.review.reviewedAt}}:{})}:{}),...(origin&&service.card.payment.marketplace?{purchase:marketplacePurchaseDescriptor(service.card,origin)}:{})};}
const serviceAnchor=({service}:ServiceSnapshot)=>({createdAt:service.createdAt,id:service.submissionId});
export function pageMarketServices(snapshot:Awaited<ReturnType<typeof marketServiceSnapshot>>,options:MarketPageInput,origin:string,ownerId?:string,maxBytes?:number){
 const page=marketPage(snapshot.records.filter(r=>ownerId?r.service.ownerId===ownerId:r.active),options,ownerId?`mine:${ownerId}`:'catalog',serviceAnchor,r=>marketServiceDto(r,!!ownerId,origin),maxBytes);
 return {services:page.items,nextCursor:page.nextCursor,partialResults:page.partialResults};
}
export function searchMarketServices(snapshot:Awaited<ReturnType<typeof marketServiceSnapshot>>,query:string,options:MarketPageInput,origin:string){
 const normalized=marketSearchQuery(query);if(!normalized)throw new WorkspaceError('INVALID_REQUEST',400);
 const {records,matches}=rankMarketRecords(snapshot.records,normalized);
 const page=marketPage(records,options,`search:${sha(normalized)}`,serviceAnchor,r=>{const match=matches.get(r.service.card.id)!;return {...marketServiceDto(r,false,origin),score:match.score,reasons:match.reasons};});
 return {query:normalized,ranking:{version:'lexical-v1' as const,ai:false},services:page.items,nextCursor:page.nextCursor,partialResults:page.partialResults};
}
export async function marketCatalogPage(options:MarketPageInput,origin:string,query?:string){
 const snapshot=await marketServiceSnapshot(),normalized=marketSearchQuery(query);let purchasesEnabled=false,purchaseAdmissionReason:string|null=null;
 try{assertMarketPurchaseAdmission();purchasesEnabled=true;}catch(error){
  // Public discovery has no buyer principal. A restricted cohort is different
  // from a deployment-wide pause; expose only these bounded public codes.
  const publicReasons=['BUYER_ADMISSION_RESTRICTED','PURCHASE_ADMISSION_CONFIGURATION_INCOMPLETE','PURCHASES_PAUSED','X402_PAYMENTS_DISABLED','X402_CONFIGURATION_INCOMPLETE'];
  purchaseAdmissionReason=error instanceof WorkspaceError&&publicReasons.includes(error.code)?error.code:'PURCHASES_UNAVAILABLE';
 }
 const admissionMode=purchaseAdmissionConfiguration().mode;
 return {...(normalized?searchMarketServices(snapshot,normalized,options,origin):pageMarketServices(snapshot,options,origin)),paused:snapshot.paused,purchasesEnabled,purchaseAdmissionReason,purchaseAdmission:admissionMode==='public-budgeted'?'public':admissionMode};
}
export async function marketServices(ownerId?:string){const snapshot=await marketServiceSnapshot();return snapshot.records.filter(r=>ownerId?r.service.ownerId===ownerId:r.active).map(r=>marketServiceDto(r,!!ownerId));}
export async function readMarketSubmission(p:WorkspacePrincipal,id:string,origin:string){
 if(p.role!=='human'&&p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 const service=await configuredMarketStore().transact(s=>s.services.find(s=>s.submissionId===id&&s.ownerId===p.ownerId));
 if(!service)throw new WorkspaceError('NOT_FOUND',404);
 return marketServiceDto({service,review:await reviewed(service),active:false},true,origin);
}
export async function withdrawService(p:WorkspacePrincipal,id:string){human(p);const cardId=await configuredMarketStore().transact(s=>{const r=s.services.find(v=>v.submissionId===id&&v.ownerId===p.ownerId);if(!r)throw new WorkspaceError('NOT_FOUND',404);r.withdrawn=true;return r.card.id;});await withdrawDynamicServiceCard(cardId);return {withdrawn:true};}
export async function reportMarketCapacity(p:WorkspacePrincipal,input:z.infer<typeof sellerCapacityReportSchema>){
 sellerCapacityReportSchema.parse(input);if(p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 const snapshot=await configuredWorkspaceStore().walletIdentity(p),service=await configuredMarketStore().transact(s=>s.services.find(v=>v.card.id===input.serviceId&&v.ownerId===p.ownerId&&v.cardHash===input.cardHash&&!v.withdrawn));
 if(!service||(await reviewed(service))?.status!=='activated')throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 return configuredMarketStore().transact(s=>{const c=reportCapacityInState(s,p,input);return {reportId:c.reportId,receivedAt:c.receivedAt,leaseExpiresAt:c.leaseExpiresAt,...sellerCapacityDto(s,input.serviceId,input.cardHash)};},snapshot.guard);
}
/** Revalidate the current seller generation and protect it in the payment CAS. */
export async function sellerPaymentGuard(order:MarketOrder,p?:WorkspacePrincipal){
 assertMarketOrderFinancialStorage(order.operationId);
 assertMarketDeliveryAdmission(order.card);
 const admissionExpiresAt=assertExternalBuyerPilotPurchase(order.buyerOwnerId,order,{ownerId:order.sellerOwnerId,cardHash:order.cardHash,card:order.card});
 assertPublicBuyerPurchase(order.buyerOwnerId,order,{ownerId:order.sellerOwnerId,cardHash:order.cardHash,card:order.card});
 if(marketPerOrderStorageEnabled(order.operationId)&&perOrderOperationId(order.operationId)){
  const snapshot=await perOrderAdmissionSnapshot(order.buyerOwnerId,order.sellerOwnerId),state=snapshot.state;
  const service=state.services.find(service=>service.card.id===order.serviceId&&service.ownerId===order.sellerOwnerId&&service.cardHash===order.cardHash&&!service.withdrawn);
  if(!service||state.paused||(await reviewed(service))?.status!=='activated')throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
  const day=new Date().toISOString().slice(0,10);
  if(order.sellerReservation?.day!==day||order.createdAt.slice(0,10)!==day)throw new WorkspaceError('SELLER_RESERVATION_EXPIRED',503,60);
  const history=await configuredMarketOrderRepository().admissionSnapshot(order.sellerOwnerId,'seller',{limit:50});
  let committed=0;
  for(const record of history.records){
   if(record.sellerOwnerId!==order.sellerOwnerId||record.cardHash!==order.cardHash||record.phase&&record.serviceId!==order.serviceId||Date.parse(record.createdAt)>Date.now())throw new WorkspaceError('PER_ORDER_ADMISSION_UNAVAILABLE',503);
   if(record.phase?record.sellerReservation?.day===day&&record.sellerReservation.committed:record.createdAt.slice(0,10)===day&&record.paymentPhase==='confirmed')committed++;
  }
  if(history.nextCursor&&(!history.nextCreatedAt||history.nextCreatedAt.slice(0,10)>=day))throw new WorkspaceError('PER_ORDER_ADMISSION_WINDOW_CAPACITY',503);
  // Legacy reports remain immutable. The temporary admission view adds the
  // committed new-storage rows to their retained daily charge. The seller
  // history revision serializes concurrent transitions into financial work.
  for(const capacity of state.sellerCapacities??[])if(capacity.ownerId===order.sellerOwnerId&&capacity.day===day)capacity.admittedUsed+=committed;
  const capacity=assertSellerReservation(state,order),expiresAt=Math.min(sellerAdmissionExpiresAt(capacity,order),admissionExpiresAt??Infinity);
  try{
   const store=configuredWorkspaceStore(),seller=(await store.walletIdentity({role:'agent',ownerId:capacity.ownerId,workspaceId:capacity.workspaceId,agentId:capacity.agentId,generation:capacity.generation})).guard;
   if(!seller||!seller.keys[0]||seller.keys.length!==seller.values.length)throw new WorkspaceError('SELLER_AUTHORIZATION_UNAVAILABLE',503);
   if(p){if(p.ownerId!==order.buyerOwnerId)throw new WorkspaceError('FORBIDDEN',403);const buyer=(await store.walletIdentity(p)).guard;if(!buyer||buyer.keys[0]!==seller.keys[0]||buyer.values[0]!==seller.values[0])throw new WorkspaceError('AUTHORIZATION_SNAPSHOT_CHANGED',503);}
   return combineMarketOrderGuards(snapshot.guard,history.guard,{keys:seller.keys.slice(0,1),values:seller.values.slice(0,1),admissionExpiresAt:expiresAt});
  }catch(error){if(error instanceof WorkspaceError&&['UNAUTHORIZED','FORBIDDEN'].includes(error.code))throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);throw error;}
 }
 const c=await configuredMarketStore().transact(s=>assertSellerReservation(s,s.orders.find(o=>o.operationId===order.operationId)??order));
 try{const store=configuredWorkspaceStore(),seller=(await store.walletIdentity({role:'agent',ownerId:c.ownerId,workspaceId:c.workspaceId,agentId:c.agentId,generation:c.generation})).guard;
  if(!seller)throw new WorkspaceError('SELLER_AUTHORIZATION_UNAVAILABLE',503);
  // Both identities are generation-bound by the shared registry snapshot. The
  // additional market:submit permission key is owner-specific and does not
  // authorize a payment; buyer and seller permission documents must differ.
  if(!seller.keys[0]||seller.values.length!==seller.keys.length)throw new WorkspaceError('SELLER_AUTHORIZATION_UNAVAILABLE',503);
  if(p){const buyer=(await store.walletIdentity(p)).guard;if(!buyer||buyer.keys[0]!==seller.keys[0]||buyer.values[0]!==seller.values[0])throw new WorkspaceError('AUTHORIZATION_SNAPSHOT_CHANGED',503);}
  return {keys:seller.keys.slice(0,1),values:seller.values.slice(0,1),...(admissionExpiresAt===undefined?{}:{admissionExpiresAt})};}
 catch(error){if(error instanceof WorkspaceError&&['UNAUTHORIZED','FORBIDDEN'].includes(error.code))throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);throw error;}
}
function validateInput(c:ServiceCard,input:Record<string,unknown>){if(Object.keys(input).some(k=>!c.input.some(v=>v.name===k))||c.input.some(v=>v.required&&!(v.name in input)||v.name in input&&typeof input[v.name]!==v.type))throw new WorkspaceError('INVALID_SERVICE_INPUT',400);}
export function authorizeOrder(o:MarketOrder,p:WorkspacePrincipal){if(o.buyerOwnerId!==p.ownerId&&o.sellerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);}
export function assertMarketContentLive(o:MarketOrder){if(Date.parse(marketContentExpiresAt(o))<=Date.now())throw new WorkspaceError('ORDER_CONTENT_EXPIRED',410);}
export async function readMarketRecovery(p:WorkspacePrincipal,id:string):Promise<MarketRecovery|undefined>{
 if(marketPerOrderStorageEnabled(id)&&perOrderOperationId(id)){
  const envelope=await configuredMarketOrderRepository().read(id);
  if(envelope){
   const record=envelope.order??envelope.recovery;if(!record||record.buyerOwnerId!==p.ownerId&&record.sellerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);
   return envelope.recovery??(envelope.order&&Date.parse(marketContentExpiresAt(envelope.order))<=Date.now()?marketRecoveryRecord(envelope.order,envelope.settlement):undefined);
  }
 }
 const snapshot=await configuredMarketStore().transact(s=>{const archived=s.archived?.find(r=>r.operationId===id),order=s.orders.find(o=>o.operationId===id&&Date.parse(marketContentExpiresAt(o))<=Date.now());const record=archived??order;if(record&&record.buyerOwnerId!==p.ownerId&&record.sellerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);return {archived,order};});
 if(snapshot.archived||!snapshot.order)return snapshot.archived;
 const settlement=await configuredMarketX402Store().transact(s=>s.records.find(r=>r.operationId===id));
 return marketRecoveryRecord(snapshot.order,settlement);
}
export async function createMarketOrder(p:WorkspacePrincipal,input:z.infer<typeof newOrderSchema>){
 if(p.purpose==='treasury-controls')throw new WorkspaceError('TREASURY_CONTROL_SCOPE',403);
 newOrderSchema.parse(input);if(p.role!=='human'&&p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 if(!StrKey.isValidEd25519PublicKey(input.payer))throw new WorkspaceError('INVALID_PAYER',400);
 const perOrder=marketPerOrderStorageEnabled(input.operationId);
 if(perOrder&&perOrderOperationId(input.operationId)){
  const existing=await configuredMarketOrderRepository().read(input.operationId);
  if(existing){const prior=existing.order??existing.recovery;if(!prior||prior.buyerOwnerId!==p.ownerId&&prior.sellerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);if(prior.buyerOwnerId!==p.ownerId||existing.intentHash!==marketIntentHash(input))throw new WorkspaceError('OPERATION_CONFLICT',409);if(!existing.order)throw new WorkspaceError('ORDER_CONTENT_EXPIRED',410);assertMarketContentLive(existing.order);return existing.order;}
 }
 const prior=await configuredMarketStore().transact(s=>s.orders.find(v=>v.operationId===input.operationId));
 if(prior){authorizeOrder(prior,p);if(prior.buyerOwnerId!==p.ownerId||marketIntentHash(prior)!==marketIntentHash(input))throw new WorkspaceError('OPERATION_CONFLICT',409);assertMarketContentLive(prior);return prior;}
 const archived=await readMarketRecovery(p,input.operationId);
 if(archived){if(archived.buyerOwnerId!==p.ownerId||archived.intentHash!==marketIntentHash(input))throw new WorkspaceError('OPERATION_CONFLICT',409);throw new WorkspaceError('ORDER_CONTENT_EXPIRED',410);}
 if(process.env.BAZAAR_MARKET_ORDER_STORAGE==='per-order-v1'&&input.operationId===LEGACY_ORIGINAL_MARKET_OPERATION)throw new WorkspaceError('LEGACY_ORDER_REQUIRED',409);
 if(perOrder&&!perOrderOperationId(input.operationId))throw new WorkspaceError('INVALID_OPERATION_ID',400);
 assertNewPublicBuyerOperationId(input.operationId);
 assertCompactV2NewOrderInput(input.input);
 assertMarketPurchaseAdmission(p);
 const service=await configuredMarketStore().transact(s=>{const found=s.services.find(v=>v.card.id===input.serviceId&&!v.withdrawn);if(found)assertPublicBuyerOrderQuota(s,p.ownerId,input);return found;});
 if(!service||service.cardHash!==input.cardHash||(await reviewed(service))?.status!=='activated')throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 if(service.card.payment.marketplace?.protocol!==input.paymentProtocol)throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);
 if(!await configuredWorkspaceStore().isOwnerActive(service.ownerId))throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 marketCard(service.card); // Legacy records remain readable, but cannot start another legacy payment.
 if(service.ownerId===p.ownerId)throw new WorkspaceError('SELF_PURCHASE_DISABLED',409);validateInput(service.card,input.input);
 assertMarketDeliveryAdmission(service.card);
 if(perOrder&&deliveryStorage(service.card.delivery).mode!=='text')throw new WorkspaceError('PER_ORDER_TEXT_STORAGE_ONLY',503);
 const admissionExpiresAt=assertExternalBuyerPilotPurchase(p.ownerId,input,service);
 assertPublicBuyerPurchase(p.ownerId,input,service);
 const onDemand=isOnDemandTextService(service);
 if(onDemand)await ensureMarketTextReadiness(service);
 if(deliveryStorage(service.card.delivery).mode==='bazaar'){const probe=await probeMarketStorage();if(!probe.reachable)throw new WorkspaceError(probe.code,503);}
 // Readiness makes authenticated MCP calls which update the shared registry's
 // quotas. Capture its generation guard after those calls, immediately before
 // committing the order. Revocation still fails this read or the atomic guard.
 const walletSnapshot=demoEnabled()?await configuredWorkspaceStore().walletIdentity(p):undefined;
 const now=new Date().toISOString(),order:MarketOrder={...input,...(onDemand?{executionMode:'on-demand' as const}:{}),...(input.paymentProtocol?{inputHash:sha(canonical(input.input))}:{}),buyerOwnerId:p.ownerId,sellerOwnerId:service.ownerId,card:service.card,destination:service.card.payment.destination,amount:service.card.payment.amount,settlement:{...service.card.payment.identity!},memoHash:orderMemo(p.ownerId,input.operationId,input.cardHash,input.input),phase:'awaiting-payment',createdAt:now,updatedAt:now};
 if(perOrder){
  const snapshot=await perOrderAdmissionSnapshot(p.ownerId,service.ownerId),s=snapshot.state;
  assertMarketPurchaseAdmission(p);assertExternalBuyerPilotPurchase(p.ownerId,input,service);assertPublicBuyerPurchase(p.ownerId,input,service);
  if(s.paused)throw new WorkspaceError('MARKET_PAUSED',503);
  if(s.orders.some(value=>value.operationId===input.operationId)||s.archived?.some(value=>value.operationId===input.operationId))throw new WorkspaceError('OPERATION_CONFLICT',409);
  assertPublicBuyerOrderQuota(s,p.ownerId,input);
  const current=s.services.find(value=>value.submissionId===service.submissionId);
  if(!current||current.withdrawn||current.cardHash!==service.cardHash||current.ownerId!==service.ownerId)throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
  const sellerCapacity=reserveSellerCapacity(s,order);
  // The reduced NEW profile finances a warm payment, never a second automatic
  // financial readiness renewal. Its immutable seat cannot outlive that proof.
  if(process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&order.executionMode==='on-demand'&&order.paymentProtocol==='x402-stellar-exact-v2'&&maximumMarketRecordBytes(order)<=49152){
   const expires=Math.min(Date.parse(order.sellerReservation!.expiresAt),Date.parse(sellerCapacity.leaseExpiresAt)-60001);
   if(!Number.isFinite(expires)||expires<=Date.now())throw new WorkspaceError('SELLER_UNAVAILABLE',503,60);
   order.sellerReservation!.expiresAt=new Date(expires).toISOString();
  }
  const admissionGuard={keys:[],values:[],admissionExpiresAt:Math.min(sellerAdmissionExpiresAt(sellerCapacity,order),admissionExpiresAt??Infinity),...(process.env.BAZAAR_FREE_DEMO_MODE==='continuous'?{continuousOperation:{operationId:order.operationId,principalHash:sha(p.ownerId),action:'reserve' as const}}:{})};
  const result=await configuredMarketOrderRepository().create(order,{guard:combineMarketOrderGuards(snapshot.guard,walletSnapshot?.guard,admissionGuard)});
  if(!result.envelope.order)throw new WorkspaceError('ORDER_CONTENT_EXPIRED',410);return result.envelope.order;
 }
 const guard=process.env.BAZAAR_FREE_DEMO_MODE==='continuous'?{keys:walletSnapshot?.guard?.keys??[],values:walletSnapshot?.guard?.values??[],continuousOperation:{operationId:order.operationId,principalHash:sha(p.ownerId),action:'reserve' as const},...(admissionExpiresAt===undefined?{}:{admissionExpiresAt})}:walletSnapshot?.guard;
 return configuredMarketStore().transact(s=>{assertMarketPurchaseAdmission(p);assertExternalBuyerPilotPurchase(p.ownerId,input,service);assertPublicBuyerPurchase(p.ownerId,input,service);if(s.paused)throw new WorkspaceError('MARKET_PAUSED',503);if(s.orders.some(v=>v.operationId===input.operationId)||s.archived?.some(v=>v.operationId===input.operationId))throw new WorkspaceError('OPERATION_CONFLICT',409);assertPublicBuyerOrderQuota(s,p.ownerId,input);if(s.services.find(v=>v.submissionId===service.submissionId)?.withdrawn)throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);reserveSellerCapacity(s,order);reserveMarketFilesInState(order,s);s.orders.push(order);return order;},guard);
}
export async function readMarketOrder(p:WorkspacePrincipal,id:string){if(marketPerOrderStorageEnabled(id)&&perOrderOperationId(id)){const envelope=await configuredMarketOrderRepository().read(id);if(envelope){const o=envelope.order??envelope.recovery;if(!o)throw new WorkspaceError('NOT_FOUND',404);authorizeOrder(o as MarketOrder,p);if(!envelope.order)throw new WorkspaceError('ORDER_CONTENT_EXPIRED',410);assertMarketContentLive(envelope.order);return envelope.order;}}return configuredMarketStore().transact(s=>{const o=s.orders.find(v=>v.operationId===id);if(!o){const r=s.archived?.find(r=>r.operationId===id);if(r&&(r.buyerOwnerId===p.ownerId||r.sellerOwnerId===p.ownerId))throw new WorkspaceError('ORDER_CONTENT_EXPIRED',410);throw new WorkspaceError('NOT_FOUND',404);}authorizeOrder(o,p);assertMarketContentLive(o);return o;});}
export async function listMarketOrders(p:WorkspacePrincipal){if(marketPerOrderStorageEnabled())throw new WorkspaceError('PER_ORDER_PAGINATION_REQUIRED',400);return configuredMarketStore().transact(s=>s.orders.filter(o=>(o.buyerOwnerId===p.ownerId||o.sellerOwnerId===p.ownerId)&&Date.parse(marketContentExpiresAt(o))>Date.now()).map(o=>({...o,expiresAt:marketContentExpiresAt(o),perspective:o.buyerOwnerId===p.ownerId?'purchase':'sale'})));}
export async function listMarketOrdersPage(p:WorkspacePrincipal,options:MarketPageInput){if(marketPerOrderStorageEnabled())return listPerOrderMarketOrdersPage(p,options);const orders=await listMarketOrders(p);const page=marketPage(orders,options,`orders:${p.ownerId}`,o=>({createdAt:o.createdAt,id:o.operationId}),o=>o);return {orders:page.items,nextCursor:page.nextCursor,partialResults:page.partialResults};}
export async function sellerOrderAction(p:WorkspacePrincipal,id:string,action:Extract<z.infer<typeof orderActionSchema>,{attemptId:string}>){
 if(p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 const perOrder=marketPerOrderStorageEnabled(id);
 const guard=demoEnabled()?(await configuredWorkspaceStore().walletIdentity(p)).guard:undefined;
 if(perOrder&&perOrderOperationId(id)){
  const repository=configuredMarketOrderRepository(),existing=await repository.read(id);
  if(existing){
   const terminal=process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&['deliver','fail'].includes(action.action)&&existing.order&&!['delivered','delivery-failed'].includes(existing.order.phase);
   const commitGuard=terminal?combineMarketOrderGuards(guard,{keys:[],values:[],continuousOperation:{operationId:id,principalHash:sha(existing.buyerOwnerId),action:'release'}}):guard;
   return repository.transact(id,envelope=>{const o=envelope.order;if(!o||o.sellerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);return applySellerOrderAction(p,o,action);},{guard:commitGuard});
  }
 }
 const snapshot=process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&['deliver','fail'].includes(action.action)?await configuredMarketStore().transact(s=>s.orders.find(o=>o.operationId===id&&o.sellerOwnerId===p.ownerId)):undefined;
 const commitGuard=snapshot?{keys:guard?.keys??[],values:guard?.values??[],continuousOperation:{operationId:id,principalHash:sha(snapshot.buyerOwnerId),action:'release' as const}}:guard;
 return configuredMarketStore().transact(s=>{const o=s.orders.find(v=>v.operationId===id&&v.sellerOwnerId===p.ownerId);if(!o)throw new WorkspaceError('NOT_FOUND',404);return applySellerOrderAction(p,o,action);},commitGuard);
}
function applySellerOrderAction(p:WorkspacePrincipal,o:MarketOrder,action:Extract<z.infer<typeof orderActionSchema>,{attemptId:string}>){
 assertMarketContentLive(o);
 if(action.action==='claim') {if(o.attemptId){if(o.attemptId!==action.attemptId||o.agentId!==p.agentId)throw new WorkspaceError('CLAIM_CONFLICT',409);return o;}if(o.phase!=='paid')throw new WorkspaceError('PAYMENT_REQUIRED',409);o.attemptId=action.attemptId;o.agentId=p.agentId;o.phase='executing';}
 else {if(o.attemptId!==action.attemptId||o.agentId!==p.agentId)throw new WorkspaceError('CLAIM_CONFLICT',409);
 if(action.action==='deliver'){assertMarketFileDeliveryReady(o,action.manifestHash);if(deliveryStorage(o.card.delivery).mode!=='text'&&action.manifestHash!==o.fileDelivery?.manifestHash)throw new WorkspaceError('FILE_MANIFEST_REQUIRED',409);if(o.delivery){if(o.delivery.text!==action.text)throw new WorkspaceError('DELIVERY_CONFLICT',409);return o;}if(!['executing','execution-uncertain'].includes(o.phase))throw new WorkspaceError('INVALID_TRANSITION',409);o.delivery={text:action.text,sha256:sha(action.text),recordedAt:new Date().toISOString(),reference:`bazaar-order:${o.operationId}`};o.phase='delivered';}
 else if(action.action==='execution-uncertain'){if(o.phase==='execution-uncertain'&&o.executionUncertainty===action.reason)return o;if(o.phase!=='executing')throw new WorkspaceError('INVALID_TRANSITION',409);o.executionUncertainty=action.reason;o.phase='execution-uncertain';}
 else {if(o.phase==='delivery-failed'&&o.failure===action.reason)return o;if(!['executing','execution-uncertain'].includes(o.phase))throw new WorkspaceError('INVALID_TRANSITION',409);o.failure=action.reason;o.phase='delivery-failed';}}
 o.updatedAt=new Date().toISOString();if(o.textWake){if(['delivered','delivery-failed'].includes(o.phase))o.textWake.status='completed';else if(o.phase==='execution-uncertain')o.textWake.status='needs-operator';o.textWake.updatedAt=o.updatedAt;}return o;
}
export async function marketOperator(authorization:string|null){const expected=process.env.BAZAAR_MARKET_OPERATOR_HASH,match=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(authorization??'');if(!expected||!match||!/^[a-f0-9]{64}$/.test(expected)||!timingSafeEqual(Buffer.from(sha(match[1]),'hex'),Buffer.from(expected,'hex')))throw new WorkspaceError('UNAUTHORIZED',401);await creditOperationalPrincipal();}
