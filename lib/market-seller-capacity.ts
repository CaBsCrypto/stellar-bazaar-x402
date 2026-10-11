import {z} from 'zod';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {canonical,sha} from './marketplace-identity.ts';
import type {MarketOrder,MarketState} from './marketplace-store.ts';

export const SELLER_LEASE_MS=360000,SELLER_RESERVATION_MS=300000,SELLER_DAILY_LIMIT=50,SELLER_PENDING_LIMIT=1;
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
 if(pending(state,order,now)>=SELLER_PENDING_LIMIT||remaining(state,order,c,now)<=0)throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503,60);
 const existing=order.sellerReservation;
 if(!existing||existing.day!==utcDay(now)||Date.parse(existing.expiresAt)<=now)order.sellerReservation={day:utcDay(now),expiresAt:new Date(now+SELLER_RESERVATION_MS).toISOString(),committed:false};
 return c;
}
export function assertSellerReservation(state:MarketState,order:MarketOrder,now=Date.now()){
 const c=capacity(state,order,now),r=order.sellerReservation;
 if(!r||!r.committed&&(r.day!==utcDay(now)||Date.parse(r.expiresAt)<=now))throw new WorkspaceError('SELLER_RESERVATION_EXPIRED',503,60);
 if(pending(state,order,now)>=SELLER_PENDING_LIMIT||!r.committed&&remaining(state,order,c,now)<=0)throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503,60);return c;
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
 let ready=false,reason:string|null=null;try{capacity(state,probe,now);if(pending(state,probe,now)>=SELLER_PENDING_LIMIT||remaining(state,probe,c,now)<=0)throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503);ready=true;}catch(error){reason=error instanceof WorkspaceError?error.code:'SELLER_UNAVAILABLE';}
 return {ready,reason,leaseExpiresAt:c.leaseExpiresAt,pendingLimit:SELLER_PENDING_LIMIT,dailyLimit:SELLER_DAILY_LIMIT};
}
