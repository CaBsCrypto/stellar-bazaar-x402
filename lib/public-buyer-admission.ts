import {createHash} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';
import {z} from 'zod';
import type {MarketOrder,MarketState} from './marketplace-store.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {canonical} from './marketplace-identity.ts';
import {COMPACT_TRANSPORT_V2_ORDER_INPUT_MAX_BYTES} from './free-plan-transport-profile.ts';
import {WorkspaceError} from './workspace-types.ts';
import {continuousPerOrderStorage} from './per-order-storage-profile.ts';
import {multisellerPolicySchema,multisellerServiceMatches,assertMultisellerCredentials} from './multiseller-pilot.ts';

type Environment=Readonly<Record<string,string|undefined>>;
const originalOperation='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const serviceId='guionista-bazaar-production-text-v1';
const destination='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C';
const hash=z.string().regex(/^[a-f0-9]{64}$/),owner=/^ow_[a-f0-9]{32}$/;
const publicOperationId=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const iso=z.string().refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);
export const PUBLIC_BUYER_WINDOW_MS=31*86400000;
// One measured buyer after registration: full145154048 + privatecheck8126464
// + portable-client4456448. This is protected headroom, never a ledger credit.
export const PUBLIC_BUYER_REGISTRATION_TRANSFER_FLOOR_BYTES=157736960;
// New storage only: create12 instead of6MiB, plus two history12 instead of2MiB
// requests (one complete-flow history and one preflight). Existing accounts,
// ledgers and held operations are not repriced or rewritten.
export const PER_ORDER_BUYER_REGISTRATION_TRANSFER_FLOOR_BYTES=184999936;
const legacySchema=z.object({version:z.literal(1),mode:z.literal('public-budgeted'),enabled:z.boolean(),startsAt:iso,serviceId:z.literal(serviceId),cardHash:hash,sellerOwnerFingerprint:hash,resourceProfile:z.literal('compact-registry-v2'),windowMs:z.literal(PUBLIC_BUYER_WINDOW_MS),maxOrdersPerOwner:z.literal(1)}).strict();
const schema=z.union([legacySchema,multisellerPolicySchema]);
export type PublicBuyerPolicy=Readonly<z.infer<typeof schema>>;
export type PublicBuyerConfiguration={enabled:boolean;configured:boolean;admissionOpen:boolean;policy?:PublicBuyerPolicy;registrationTransferFloorBytes:number};
type Service={ownerId:string;cardHash:string;card:MarketOrder['card']};
const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');

/** Server-owned automatic admission. No buyer names, wallet list or credential
 * is part of this policy. Invalid public policy closes fresh admission only. */
export function publicBuyerConfiguration(environment:Environment=process.env,now=Date.now()):PublicBuyerConfiguration{
 const raw=environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON,base={registrationTransferFloorBytes:continuousPerOrderStorage(environment)?PER_ORDER_BUYER_REGISTRATION_TRANSFER_FLOOR_BYTES:PUBLIC_BUYER_REGISTRATION_TRANSFER_FLOOR_BYTES};
 if(raw===undefined)return {...base,enabled:false,configured:true,admissionOpen:false};
 const invalid={...base,enabled:true,configured:false,admissionOpen:false};
 try{
  if(!Number.isSafeInteger(now)||now<0||Buffer.byteLength(raw)>4096||environment.BAZAAR_EXTERNAL_BUYER_PILOT_JSON!==undefined)return invalid;
  const p=schema.parse(JSON.parse(raw));
  if(environment.VERCEL_ENV!=='production'||environment.BAZAAR_WORKSPACE_BACKEND!=='redis'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!==p.resourceProfile||!['9900000000','9950000000'].includes(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES??'')||environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand'||environment.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID!==originalOperation||p.version===1&&(environment.BAZAAR_TEXT_SELLER_SERVICE_ID!==p.serviceId||environment.BAZAAR_TEXT_SELLER_CARD_HASH!==p.cardHash||environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT!==p.sellerOwnerFingerprint))return invalid;
  // The single old account is an incident/configuration anchor, not the list
  // of eligible new buyers. Preserve the existing command configuration proof for both reviewed caps.
  const anchors:unknown=JSON.parse(environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON??'null');
  if(!Array.isArray(anchors)||anchors.length!==1||typeof anchors[0]!=='string'||!owner.test(anchors[0]))return invalid;
  if(p.version===2){if(environment.BAZAAR_MARKET_ORDER_STORAGE!=='per-order-v1'||environment.BAZAAR_PER_ORDER_X402_MODE!=='stellar-testnet-v1'||environment.BAZAAR_PER_ORDER_PROVIDER_PROTOCOL!=='bazaar.per-order-provider/v1')return invalid;assertMultisellerCredentials(p,environment);}
  const policy=Object.freeze({...p,...(p.version===2?{sellers:Object.freeze(p.sellers.map(s=>Object.freeze(s)))}:{})}) as PublicBuyerPolicy;return {...base,enabled:p.enabled,configured:true,admissionOpen:p.enabled&&now>=Date.parse(p.startsAt),policy};
 }catch{return invalid;}
}
export function publicBuyerServiceMatches(p:PublicBuyerPolicy,service:Service):boolean{
 if(p.version===2)return multisellerServiceMatches(p,service);
 try{const c=service.card;return fingerprint(service.ownerId)===p.sellerOwnerFingerprint&&service.cardHash===p.cardHash&&c.id===p.serviceId&&computeCanonicalServiceCardHash(c)===p.cardHash&&c.network==='stellar:testnet'&&c.payment.scheme==='exact'&&c.payment.asset==='USDC'&&c.payment.amount==='0.01'&&c.payment.destination===destination&&isCanonicalUsdcTestnet(c.payment.identity)&&c.payment.marketplace?.protocol==='x402-stellar-exact-v2'&&c.payment.marketplace.resourceTemplate==='/api/market/orders/{operationId}/x402'&&deliveryStorage(c.delivery).mode==='text'&&c.delivery?.result.contentType==='text/plain';}catch{return false;}
}
/** Historical matching intentionally survives a policy pause. Fresh payment
 * admission still calls assertPublicBuyerPurchase; paid recovery does not. */
export function publicBuyerOrderMatches(order:MarketOrder,configuration:PublicBuyerConfiguration,now=Date.now()):boolean{
 const p=configuration.configured?configuration.policy:undefined;if(!p||!Number.isSafeInteger(now)||now<0)return false;
 try{const created=Date.parse(order.createdAt);return publicOperationId.test(order.operationId)&&order.operationId!==originalOperation&&(p.version===2||order.serviceId===p.serviceId)&&owner.test(order.buyerOwnerId)&&Number.isFinite(created)&&created>=Date.parse(p.startsAt)&&created<=now&&publicBuyerServiceMatches(p,{ownerId:order.sellerOwnerId,cardHash:order.cardHash,card:order.card})&&StrKey.isValidEd25519PublicKey(order.payer)&&order.executionMode==='on-demand'&&order.amount==='0.01'&&order.destination===(p.version===2?order.card.payment.destination:destination)&&order.paymentProtocol==='x402-stellar-exact-v2'&&isCanonicalUsdcTestnet(order.settlement)&&Buffer.byteLength(canonical(order.input))<=COMPACT_TRANSPORT_V2_ORDER_INPUT_MAX_BYTES;}catch{return false;}
}
/** Only fresh public intents must match the financial transport's canonical
 * operation path. Existing native replays are resolved before this guard. */
export function assertNewPublicBuyerOperationId(operationId:string,environment:Environment=process.env){
 if(environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON!==undefined&&!publicOperationId.test(operationId))throw new WorkspaceError('PUBLIC_ORDER_ID_MUST_BE_CANONICAL_UUID_V4',400);
}
export function assertPublicBuyerPurchase(ownerId:string,input:Pick<MarketOrder,'serviceId'|'cardHash'|'payer'>,service:Service,environment:Environment=process.env,now=Date.now()){
 if(environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON===undefined)return;
 const c=publicBuyerConfiguration(environment,now),p=c.policy;
 if(c.admissionOpen&&p&&owner.test(ownerId)&&ownerId!==service.ownerId&&input.serviceId===service.card.id&&input.cardHash===service.cardHash&&StrKey.isValidEd25519PublicKey(input.payer)&&publicBuyerServiceMatches(p,service))return;
 throw new WorkspaceError('PUBLIC_BUYER_ADMISSION_UNAVAILABLE',503);
}
/** Only new order creation calls this guard, before readiness and again inside
 * the native CAS. Kept recovery tombstones count after visible history expires.
 * archivedAt is later than creation, so its window is conservative, not a reset. */
export function assertPublicBuyerOrderQuota(state:MarketState,ownerId:string,input:Pick<MarketOrder,'operationId'|'serviceId'|'cardHash'>,environment:Environment=process.env,now=Date.now()){
 if(environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON===undefined)return;
 const c=publicBuyerConfiguration(environment,now),p=c.policy;if(!c.admissionOpen||!p)throw new WorkspaceError('PUBLIC_BUYER_ADMISSION_UNAVAILABLE',503);
 if(p.version===1&&(input.serviceId!==p.serviceId||input.cardHash!==p.cardHash))return;
 const cutoff=now-p.windowMs,times:number[]=[];
 for(const o of state.orders){if(o.operationId===originalOperation||o.operationId===input.operationId||o.buyerOwnerId!==ownerId||p.version===1&&(o.cardHash!==p.cardHash||fingerprint(o.sellerOwnerId)!==p.sellerOwnerFingerprint))continue;const at=Date.parse(o.createdAt);if(!Number.isFinite(at)||at>now)throw new WorkspaceError('BUYER_QUOTA_UNAVAILABLE',503);if(at>=cutoff)times.push(at);}
 for(const o of state.archived??[]){if(o.operationId===originalOperation||o.operationId===input.operationId||o.buyerOwnerId!==ownerId||p.version===1&&(o.cardHash!==p.cardHash||fingerprint(o.sellerOwnerId)!==p.sellerOwnerFingerprint))continue;const at=Date.parse(o.archivedAt);if(!Number.isFinite(at)||at>now)throw new WorkspaceError('BUYER_QUOTA_UNAVAILABLE',503);if(at>=cutoff)times.push(at);}
 if(times.length>=p.maxOrdersPerOwner)throw new WorkspaceError('BUYER_ORDER_LIMIT',429,Math.max(1,Math.ceil((Math.max(...times)+p.windowMs-now)/1000)));
}
