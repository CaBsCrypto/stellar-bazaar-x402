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
import { creditOperationalPrincipal } from './acceptance-meter.ts';

import {sha,canonical,orderMemo} from './marketplace-identity.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {marketSubmissionGuard} from './market-permissions.ts';
import {marketPage,type MarketPageInput} from './market-pagination.ts';
import {marketplacePurchaseDescriptor} from './marketplace-discovery.ts';
export {sha,canonical} from './marketplace-identity.ts';
export const marketEnabled=()=>process.env.BAZAAR_ENABLE_MARKETPLACE==='true';
export function assertMarketEnabled(){if(!marketEnabled())throw new WorkspaceError('MARKET_DISABLED');}
export const newServiceSchema=z.object({submissionId:z.string().uuid(),card:z.unknown(),controlProof:z.object({method:z.enum(['dns-txt','http-well-known']),domain:z.string().max(253)}).strict()}).strict();
export const newOrderSchema=z.object({operationId:z.string().uuid(),serviceId:z.string().min(1).max(100),cardHash:z.string().regex(/^[a-f0-9]{64}$/),payer:z.string().regex(/^G[A-Z2-7]{55}$/),input:z.record(z.string(),z.union([z.string().max(2000),z.number().finite(),z.boolean()])),paymentProtocol:z.literal('x402-stellar-exact-v2')}).strict();
export const orderActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare')}).strict(),
 z.object({action:z.literal('pay'),signedXdr:z.string().min(20).max(16000)}).strict(),
 z.object({action:z.literal('reconcile')}).strict(),
 z.object({action:z.literal('claim'),attemptId:z.string().uuid()}).strict(),
 z.object({action:z.literal('deliver'),attemptId:z.string().uuid(),text:z.string().min(1).max(2000)}).strict(),
 z.object({action:z.literal('fail'),attemptId:z.string().uuid(),reason:z.string().min(1).max(500)}).strict(),
 z.object({action:z.literal('execution-uncertain'),attemptId:z.string().uuid(),reason:z.string().min(1).max(500)}).strict(),
]);
function submissionToken(id:string,owner:string){const secret=process.env.BAZAAR_MARKET_REVIEW_SECRET;if(!secret||secret.length<32)throw new WorkspaceError('MARKET_UNAVAILABLE');return createHmac('sha256',secret).update(`${owner}:${id}`).digest('hex');}
function human(p:WorkspacePrincipal){if(p.role!=='human')throw new WorkspaceError('FORBIDDEN',403);}
export function marketCard(raw:unknown):ServiceCard {
 const parsed=parseServiceCardShape(raw);if(!parsed.ok)throw new WorkspaceError('INVALID_SERVICE',400);
 const c=parsed.card,u=new URL(c.url);
 // New publication and purchase use the fixed beta price and exact testnet asset.
 if(c.kind!=='http'||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(u.port&&u.port!=='443')||!StrKey.isValidEd25519PublicKey(c.payment.destination)||c.network!=='stellar:testnet'||c.payment.scheme!=='exact'||c.payment.asset!=='USDC'||!isCanonicalUsdcTestnet(c.payment.identity)||c.paymentOptions||c.payment.amount!=='0.01'||c.payment.marketplace?.protocol!=='x402-stellar-exact-v2'||c.payment.marketplace.resourceTemplate!=='/api/market/orders/{operationId}/x402'||!c.delivery||c.delivery.result.contentType!=='text/plain'||!c.delivery.idempotency.required||isReservedServiceId(c.id)||validateCardRules(c).failedOutcomes.length)throw new WorkspaceError('INVALID_SERVICE',400);
 return c;
}
export async function submitMarketService(p:WorkspacePrincipal,input:z.infer<typeof newServiceSchema>){
 newServiceSchema.parse(input);const guard=await marketSubmissionGuard(p),card=marketCard(input.card),cardHash=computeCanonicalServiceCardHash(card),token=submissionToken(input.submissionId,p.ownerId);
 // Persist ownership before entering the existing review queue. Explicit replay uses the same intent.
 await configuredMarketStore().transact(s=>{if(s.paused)throw new WorkspaceError('MARKET_PAUSED');const old=s.services.find(v=>v.submissionId===input.submissionId);if(old){if(old.ownerId!==p.ownerId||old.cardHash!==cardHash)throw new WorkspaceError('SUBMISSION_CONFLICT',409);return;}
 if(s.services.some(v=>v.card.id===card.id))throw new WorkspaceError('SERVICE_CONFLICT',409);
 s.services.push({submissionId:input.submissionId,ownerId:p.ownerId,cardHash,card,withdrawn:false,createdAt:new Date().toISOString()});},guard);
 const result=await submitProviderDraft(card,input.controlProof,{submissionId:input.submissionId,submissionToken:token});
 if(!result.ok)throw new WorkspaceError(result.error.code,result.error.code==='STORE_UNAVAILABLE'?503:409);
 return result.value;
}
async function reviewed(service:MarketService){const r=await getSubmissionForOperator(service.submissionId,false);if(!r.ok){if(r.error.code==='SUBMISSION_NOT_FOUND')return undefined;throw new WorkspaceError('REVIEW_UNAVAILABLE');}if(computeCanonicalServiceCardHash(r.value.card)!==service.cardHash)throw new WorkspaceError('REVIEW_MISMATCH');return r.value;}
type ServiceSnapshot = { service: MarketService; review?: ProviderSubmission; active: boolean };
export async function marketServiceSnapshot() {
 const snapshot=await configuredMarketStore().transact(s=>({services:s.services,paused:s.paused??false}));
 if(!snapshot.services.length)return {records:[] as ServiceSnapshot[],paused:snapshot.paused};
 const [reviews,owners]=await Promise.all([getMarketReviewSnapshot(snapshot.services.map(s=>s.submissionId)),configuredWorkspaceStore().activeOwnerIds(snapshot.services.map(s=>s.ownerId))]);
 if(!reviews.ok)throw new WorkspaceError('REVIEW_UNAVAILABLE');
 const byId=new Map(reviews.value.map(r=>[r.submissionId,r]));
 const records=snapshot.services.map(service=>{const review=byId.get(service.submissionId);if(review&&computeCanonicalServiceCardHash(review.card)!==service.cardHash)throw new WorkspaceError('REVIEW_MISMATCH');let purchasable=false;try{marketCard(service.card);purchasable=true;}catch{}return {service,review,active:purchasable&&!service.withdrawn&&review?.status==='activated'&&owners.has(service.ownerId)};});
 return {records,paused:snapshot.paused};
}
export function marketServiceDto({service,review}:ServiceSnapshot,owner=false,origin?:string){return {submissionId:service.submissionId,card:service.card,cardHash:service.cardHash,execution:'seller-mcp-task' as const,status:service.withdrawn?'withdrawn':review?.status??'submission-unconfirmed',...(owner&&review?{control:review.control,...(review.review?{review:{decision:review.review.decision,reasons:review.review.reasons,reviewedAt:review.review.reviewedAt}}:{})}:{}),...(origin&&service.card.payment.marketplace?{purchase:marketplacePurchaseDescriptor(service.card,origin)}:{})};}
const serviceAnchor=({service}:ServiceSnapshot)=>({createdAt:service.createdAt,id:service.submissionId});
export function pageMarketServices(snapshot:Awaited<ReturnType<typeof marketServiceSnapshot>>,options:MarketPageInput,origin:string,ownerId?:string,maxBytes?:number){
 const page=marketPage(snapshot.records.filter(r=>ownerId?r.service.ownerId===ownerId:r.active),options,ownerId?`mine:${ownerId}`:'catalog',serviceAnchor,r=>marketServiceDto(r,!!ownerId,origin),maxBytes);
 return {services:page.items,nextCursor:page.nextCursor,partialResults:page.partialResults};
}
export async function marketCatalogPage(options:MarketPageInput,origin:string){const snapshot=await marketServiceSnapshot();return {...pageMarketServices(snapshot,options,origin),paused:snapshot.paused};}
export async function marketServices(ownerId?:string){const snapshot=await marketServiceSnapshot();return snapshot.records.filter(r=>ownerId?r.service.ownerId===ownerId:r.active).map(r=>marketServiceDto(r,!!ownerId));}
export async function readMarketSubmission(p:WorkspacePrincipal,id:string,origin:string){
 if(p.role!=='human'&&p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 const service=await configuredMarketStore().transact(s=>s.services.find(s=>s.submissionId===id&&s.ownerId===p.ownerId));
 if(!service)throw new WorkspaceError('NOT_FOUND',404);
 return marketServiceDto({service,review:await reviewed(service),active:false},true,origin);
}
export async function withdrawService(p:WorkspacePrincipal,id:string){human(p);const cardId=await configuredMarketStore().transact(s=>{const r=s.services.find(v=>v.submissionId===id&&v.ownerId===p.ownerId);if(!r)throw new WorkspaceError('NOT_FOUND',404);r.withdrawn=true;return r.card.id;});await withdrawDynamicServiceCard(cardId);return {withdrawn:true};}
function validateInput(c:ServiceCard,input:Record<string,unknown>){if(Object.keys(input).some(k=>!c.input.some(v=>v.name===k))||c.input.some(v=>v.required&&!(v.name in input)||v.name in input&&typeof input[v.name]!==v.type))throw new WorkspaceError('INVALID_SERVICE_INPUT',400);}
export function authorizeOrder(o:MarketOrder,p:WorkspacePrincipal){if(o.buyerOwnerId!==p.ownerId&&o.sellerOwnerId!==p.ownerId)throw new WorkspaceError('NOT_FOUND',404);}
export async function createMarketOrder(p:WorkspacePrincipal,input:z.infer<typeof newOrderSchema>){
 newOrderSchema.parse(input);if(p.role!=='human'&&p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);if(process.env.BAZAAR_X402_MARKETPLACE_ENABLED!=='true')throw new WorkspaceError('X402_PAYMENTS_DISABLED',503);
 if(!StrKey.isValidEd25519PublicKey(input.payer))throw new WorkspaceError('INVALID_PAYER',400);
 const prior=await configuredMarketStore().transact(s=>s.orders.find(v=>v.operationId===input.operationId));
 if(prior){authorizeOrder(prior,p);if(prior.buyerOwnerId!==p.ownerId||prior.serviceId!==input.serviceId||prior.cardHash!==input.cardHash||prior.payer!==input.payer||prior.paymentProtocol!==input.paymentProtocol||canonical(prior.input)!==canonical(input.input))throw new WorkspaceError('OPERATION_CONFLICT',409);return prior;}
 const service=await configuredMarketStore().transact(s=>s.services.find(v=>v.card.id===input.serviceId&&!v.withdrawn));
 if(!service||service.cardHash!==input.cardHash||(await reviewed(service))?.status!=='activated')throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 if(service.card.payment.marketplace?.protocol!==input.paymentProtocol)throw new WorkspaceError('PAYMENT_PROTOCOL_MISMATCH',409);
 if(!await configuredWorkspaceStore().isOwnerActive(service.ownerId))throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);
 marketCard(service.card); // Legacy records remain readable, but cannot start another legacy payment.
 if(service.ownerId===p.ownerId)throw new WorkspaceError('SELF_PURCHASE_DISABLED',409);validateInput(service.card,input.input);
 const now=new Date().toISOString(),order:MarketOrder={...input,...(input.paymentProtocol?{inputHash:sha(canonical(input.input))}:{}),buyerOwnerId:p.ownerId,sellerOwnerId:service.ownerId,card:service.card,destination:service.card.payment.destination,amount:service.card.payment.amount,settlement:{...service.card.payment.identity!},memoHash:orderMemo(p.ownerId,input.operationId,input.cardHash,input.input),phase:'awaiting-payment',createdAt:now,updatedAt:now};
 return configuredMarketStore().transact(s=>{if(s.paused)throw new WorkspaceError('MARKET_PAUSED');if(s.orders.some(v=>v.operationId===input.operationId))throw new WorkspaceError('OPERATION_CONFLICT',409);if(s.services.find(v=>v.submissionId===service.submissionId)?.withdrawn)throw new WorkspaceError('SERVICE_NOT_ACTIVE',409);s.orders.push(order);return order;});
}
export async function readMarketOrder(p:WorkspacePrincipal,id:string){return configuredMarketStore().transact(s=>{const o=s.orders.find(v=>v.operationId===id);if(!o)throw new WorkspaceError('NOT_FOUND',404);authorizeOrder(o,p);return o;});}
export async function listMarketOrders(p:WorkspacePrincipal){return configuredMarketStore().transact(s=>s.orders.filter(o=>o.buyerOwnerId===p.ownerId||o.sellerOwnerId===p.ownerId).map(o=>({...o,perspective:o.buyerOwnerId===p.ownerId?'purchase':'sale'})));}
export async function listMarketOrdersPage(p:WorkspacePrincipal,options:MarketPageInput){const orders=await listMarketOrders(p);const page=marketPage(orders,options,`orders:${p.ownerId}`,o=>({createdAt:o.createdAt,id:o.operationId}),o=>o);return {orders:page.items,nextCursor:page.nextCursor,partialResults:page.partialResults};}
export async function sellerOrderAction(p:WorkspacePrincipal,id:string,action:Extract<z.infer<typeof orderActionSchema>,{attemptId:string}>){
 if(p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 return configuredMarketStore().transact(s=>{const o=s.orders.find(v=>v.operationId===id&&v.sellerOwnerId===p.ownerId);if(!o)throw new WorkspaceError('NOT_FOUND',404);
 if(action.action==='claim') {if(o.attemptId){if(o.attemptId!==action.attemptId||o.agentId!==p.agentId)throw new WorkspaceError('CLAIM_CONFLICT',409);return o;}if(o.phase!=='paid')throw new WorkspaceError('PAYMENT_REQUIRED',409);o.attemptId=action.attemptId;o.agentId=p.agentId;o.phase='executing';}
 else {if(o.attemptId!==action.attemptId||o.agentId!==p.agentId)throw new WorkspaceError('CLAIM_CONFLICT',409);
 if(action.action==='deliver'){if(o.delivery){if(o.delivery.text!==action.text)throw new WorkspaceError('DELIVERY_CONFLICT',409);return o;}if(!['executing','execution-uncertain'].includes(o.phase))throw new WorkspaceError('INVALID_TRANSITION',409);o.delivery={text:action.text,sha256:sha(action.text),recordedAt:new Date().toISOString(),reference:`bazaar-order:${o.operationId}`};o.phase='delivered';}
 else if(action.action==='execution-uncertain'){if(o.phase==='execution-uncertain'&&o.executionUncertainty===action.reason)return o;if(o.phase!=='executing')throw new WorkspaceError('INVALID_TRANSITION',409);o.executionUncertainty=action.reason;o.phase='execution-uncertain';}
 else {if(o.phase==='delivery-failed'&&o.failure===action.reason)return o;if(!['executing','execution-uncertain'].includes(o.phase))throw new WorkspaceError('INVALID_TRANSITION',409);o.failure=action.reason;o.phase='delivery-failed';}}
 o.updatedAt=new Date().toISOString();return o;});
}
export async function marketOperator(authorization:string|null){const expected=process.env.BAZAAR_MARKET_OPERATOR_HASH,match=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(authorization??'');if(!expected||!match||!/^[a-f0-9]{64}$/.test(expected)||!timingSafeEqual(Buffer.from(sha(match[1]),'hex'),Buffer.from(expected,'hex')))throw new WorkspaceError('UNAUTHORIZED',401);await creditOperationalPrincipal();}
