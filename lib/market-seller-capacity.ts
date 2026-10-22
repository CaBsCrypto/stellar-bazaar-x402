import {z} from 'zod';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {canonical,sha} from './marketplace-identity.ts';
import type {MarketOrder,MarketState} from './marketplace-store.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';

export const SELLER_LEASE_MS=360000,SELLER_RESERVATION_MS=300000,SELLER_DAILY_LIMIT=50,SELLER_PENDING_LIMIT=1;
const recoveryIncident='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const recoveryService='guionista-bazaar-production-text-v1';
const recoveryPayer='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU';
const recoveryDestination='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C';
const recoveryAuthorization='f3f6b5faabcd76dc9e71d2e49875ce186d69fc6d423ab05da0ae94890e597293';
/** Default off. The original uncertain incident still occupies its full seat;
 * this narrowly scoped opt-in allows one independently authorized new order.
 * Configuration is server-owned, never a provider report or MCP argument. */
export function effectiveSellerPendingLimit(state:MarketState,order:MarketOrder,environment:Readonly<Record<string,string|undefined>>=process.env){
 const optIn=environment.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID;
 if(optIn===undefined)return SELLER_PENDING_LIMIT;
 if(optIn!==recoveryIncident||environment.VERCEL_ENV!=='production'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand')throw new WorkspaceError('RECOVERY_SLOT_CONFIGURATION_INCOMPLETE',503);
 if(order.serviceId!==recoveryService)return SELLER_PENDING_LIMIT;
 const configuredCard=environment.BAZAAR_TEXT_SELLER_CARD_HASH,configuredOwner=environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT;
 if(environment.BAZAAR_TEXT_SELLER_SERVICE_ID!==recoveryService||!/^[a-f0-9]{64}$/.test(configuredCard??'')||!/^[a-f0-9]{64}$/.test(configuredOwner??''))throw new WorkspaceError('RECOVERY_SLOT_CONFIGURATION_INCOMPLETE',503);
 if(order.cardHash!==configuredCard||sha(order.sellerOwnerId)!==configuredOwner)return SELLER_PENDING_LIMIT;
 let owners:unknown;try{const raw=environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;if(raw===undefined||Buffer.byteLength(raw)>4096)throw Error();owners=JSON.parse(raw);}catch{throw new WorkspaceError('RECOVERY_SLOT_CONFIGURATION_INCOMPLETE',503);}
 if(!Array.isArray(owners)||owners.length!==1||typeof owners[0]!=='string'||!/^ow_[a-f0-9]{32}$/.test(owners[0]))throw new WorkspaceError('RECOVERY_SLOT_CONFIGURATION_INCOMPLETE',503);
 const live=state.orders.find(o=>o.operationId===recoveryIncident),archived=state.archived?.find(o=>o.operationId===recoveryIncident);
 const incident=live??archived;
 if(!incident||live&&archived||incident.buyerOwnerId!==owners[0]||incident.sellerOwnerId!==order.sellerOwnerId||incident.cardHash!==configuredCard||incident.amount!=='0.01'||incident.payer!==recoveryPayer||incident.destination!==recoveryDestination||incident.paymentProtocol!=='x402-stellar-exact-v2'||!isCanonicalUsdcTestnet(incident.settlement)||incident.transactionHash||incident.paymentVerifiedAt)return SELLER_PENDING_LIMIT;
 if(live&&(live.serviceId!==recoveryService||live.phase!=='payment-uncertain'||live.sellerReservation?.committed!==true||!live.settlementAttemptId||live.textWake||live.delivery))return SELLER_PENDING_LIMIT;
 if(archived&&(archived.paymentPhase!=='uncertain'||archived.sellerReservationPending!==true||archived.authorizationFingerprint!==recoveryAuthorization))return SELLER_PENDING_LIMIT;
 // Empty operationId is only the native read-only service-capacity probe.
 if(order.operationId!==''&&(order.buyerOwnerId!==owners[0]||order.amount!=='0.01'||order.payer!==recoveryPayer||order.destination!==recoveryDestination||order.paymentProtocol!=='x402-stellar-exact-v2'||!isCanonicalUsdcTestnet(order.settlement)))return SELLER_PENDING_LIMIT;
 return SELLER_PENDING_LIMIT+1;
}
const digest=z.string().regex(/^[a-f0-9]{64}$/),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const sellerCapacityReportSchema=z.object({serviceId:z.string().min(1).max(100),cardHash:digest,reportId:z.string().uuid(),ready:z.boolean(),day,usedToday:z.number().int().min(0).max(SELLER_DAILY_LIMIT),observedAt:z.string().datetime()}).strict();
export const sellerCapacitySchema=z.object({serviceId:z.string().min(1).max(100),cardHash:digest,ownerId:z.string(),workspaceId:z.string().uuid(),agentId:z.string(),generation:z.number().int().positive(),reportId:z.string().uuid(),reportDigest:digest,observedAt:z.string().datetime(),receivedAt:z.string().datetime(),leaseExpiresAt:z.string().datetime(),day,reportedUsed:z.number().int().min(0).max(SELLER_DAILY_LIMIT),admittedUsed:z.number().int().min(0).max(SELLER_DAILY_LIMIT),ready:z.boolean()}).strict();
export const sellerReservationSchema=z.object({day,expiresAt:z.string().datetime(),committed:z.boolean()}).strict();
export type SellerCapacity=z.infer<typeof sellerCapacitySchema>;
export type SellerReservation=z.infer<typeof sellerReservationSchema>;
const utcDay=(now:number)=>new Date(now).toISOString().slice(0,10);
const unavailable=()=>new WorkspaceError('SELLER_UNAVAILABLE',503,60);
function capacity(state:MarketState,order:MarketOrder,now:number){
 const record=state.sellerCapacities?.find(c=>c.serviceId===order.serviceId&&c.cardHash===order.cardHash&&c.ownerId===order.sellerOwnerId);
 if(!record||!record.ready||record.day!==utcDay(now)||Date.parse(record.leaseExpiresAt)<=now||Date.parse(record.receivedAt)>now)throw unavailable();
 const service=state.services.find(s=>s.card.id===order.serviceId&&s.cardHash===order.cardHash&&s.ownerId===order.sellerOwnerId&&!s.withdrawn);
 if(!service||state.paused)throw unavailable();return record;
}
function pending(state:MarketState,order:MarketOrder,now:number){
 return state.orders.filter(o=>o.operationId!==order.operationId&&o.sellerOwnerId===order.sellerOwnerId&&!['delivered','delivery-failed'].includes(o.phase)&&
  (o.phase!=='awaiting-payment'||o.sellerReservation?.committed||o.sellerReservation&&Date.parse(o.sellerReservation.expiresAt)>now)).length+
  (state.archived??[]).filter(o=>o.sellerOwnerId===order.sellerOwnerId&&(o.paymentPhase==='uncertain'||o.sellerReservationPending)).length;
}
function usedBySeller(state:MarketState,c:SellerCapacity){return Math.max(0,...(state.sellerCapacities??[]).filter(v=>v.ownerId===c.ownerId&&v.day===c.day).flatMap(v=>[v.reportedUsed,v.admittedUsed]));}
function remaining(state:MarketState,order:MarketOrder,c:SellerCapacity,now:number){
 const held=state.orders.filter(o=>o.operationId!==order.operationId&&o.sellerOwnerId===order.sellerOwnerId&&o.sellerReservation?.day===c.day&&!o.sellerReservation.committed&&Date.parse(o.sellerReservation.expiresAt)>now).length;
 return SELLER_DAILY_LIMIT-usedBySeller(state,c)-held;
}
/** The agent reports a saved intention. Replays never extend its server expiry. */
export function reportCapacityInState(state:MarketState,p:WorkspacePrincipal,input:z.infer<typeof sellerCapacityReportSchema>,now=Date.now()){
 sellerCapacityReportSchema.parse(input);if(p.role!=='agent')throw new WorkspaceError('FORBIDDEN',403);
 const service=state.services.find(s=>s.card.id===input.serviceId&&s.ownerId===p.ownerId&&s.cardHash===input.cardHash&&!s.withdrawn);
 if(!service)throw new WorkspaceError('NOT_FOUND',404);
 const old=state.sellerCapacities?.find(c=>c.serviceId===input.serviceId),intent=sha(canonical(input));
 if(old?.reportId===input.reportId){if(old.reportDigest!==intent||old.generation!==p.generation||old.agentId!==p.agentId)throw new WorkspaceError('CAPACITY_REPORT_CONFLICT',409);return old;}
 if(input.day!==utcDay(now)||Math.abs(Date.parse(input.observedAt)-now)>30000||old&&Date.parse(input.observedAt)<=Date.parse(old.observedAt))throw new WorkspaceError('CAPACITY_REPORT_STALE',409);
 const sameDay=old?.day===input.day;
 const record:SellerCapacity={serviceId:input.serviceId,cardHash:input.cardHash,ownerId:p.ownerId,workspaceId:p.workspaceId,agentId:p.agentId,generation:p.generation,reportId:input.reportId,reportDigest:intent,observedAt:input.observedAt,receivedAt:new Date(now).toISOString(),leaseExpiresAt:new Date(now+SELLER_LEASE_MS).toISOString(),day:input.day,reportedUsed:Math.max(input.usedToday,sameDay?old!.reportedUsed:0),admittedUsed:sameDay?old!.admittedUsed:0,ready:input.ready};
 state.sellerCapacities??=[];const index=state.sellerCapacities.findIndex(c=>c.serviceId===input.serviceId);if(index<0)state.sellerCapacities.push(record);else state.sellerCapacities[index]=record;return record;
}
/** Pure callback; durable order and its single pending seat are written together. */
export function reserveSellerCapacity(state:MarketState,order:MarketOrder,now=Date.now()){
 const c=capacity(state,order,now);if(order.sellerReservation?.committed)return assertSellerReservation(state,order,now);
 if(pending(state,order,now)>=effectiveSellerPendingLimit(state,order)||remaining(state,order,c,now)<=0)throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503,60);
 const existing=order.sellerReservation;
 if(!existing||existing.day!==utcDay(now)||Date.parse(existing.expiresAt)<=now)order.sellerReservation={day:utcDay(now),expiresAt:new Date(now+SELLER_RESERVATION_MS).toISOString(),committed:false};
 return c;
}
export function assertSellerReservation(state:MarketState,order:MarketOrder,now=Date.now()){
 const c=capacity(state,order,now),r=order.sellerReservation;
 if(!r||!r.committed&&(r.day!==utcDay(now)||Date.parse(r.expiresAt)<=now))throw new WorkspaceError('SELLER_RESERVATION_EXPIRED',503,60);
 if(pending(state,order,now)>=effectiveSellerPendingLimit(state,order)||!r.committed&&remaining(state,order,c,now)<=0)throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503,60);return c;
}
/** Called inside the joint market/settlement CAS before first authorization. */
export function commitSellerReservation(state:MarketState,order:MarketOrder,now=Date.now()){
 const c=assertSellerReservation(state,order,now);
 if(!order.sellerReservation!.committed){c.admittedUsed=usedBySeller(state,c)+1;order.sellerReservation!.committed=true;}return c;
}
export function sellerCapacityDto(state:MarketState,serviceId:string,cardHash:string,now=Date.now()){
 const service=state.services.find(s=>s.card.id===serviceId&&s.cardHash===cardHash),c=state.sellerCapacities?.find(c=>c.serviceId===serviceId&&c.cardHash===cardHash);
 if(!service||!c)return {ready:false,reason:'SELLER_UNAVAILABLE',pendingLimit:SELLER_PENDING_LIMIT,dailyLimit:SELLER_DAILY_LIMIT};
 const probe={operationId:'',serviceId,cardHash,sellerOwnerId:service.ownerId} as MarketOrder;
 const pendingLimit=effectiveSellerPendingLimit(state,probe);
 let ready=false,reason:string|null=null;try{capacity(state,probe,now);if(pending(state,probe,now)>=pendingLimit||remaining(state,probe,c,now)<=0)throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503);ready=true;}catch(error){reason=error instanceof WorkspaceError?error.code:'SELLER_UNAVAILABLE';}
 return {ready,reason,leaseExpiresAt:c.leaseExpiresAt,pendingLimit,dailyLimit:SELLER_DAILY_LIMIT};
}
