import {createHash} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';
import {z} from 'zod';
import type {MarketOrder} from './marketplace-store.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {WorkspaceError} from './workspace-types.ts';

type Environment=Readonly<Record<string,string|undefined>>;
const originalOperation='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const serviceId='guionista-bazaar-production-text-v1';
const originalPayer='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU';
const destination='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C';
const owner=z.string().regex(/^ow_[a-f0-9]{32}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const wallet=z.string().refine(value=>StrKey.isValidEd25519PublicKey(value));
const iso=z.string().refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value);
const schema=z.object({version:z.literal(1),originalOwnerId:owner,serviceId:z.literal(serviceId),cardHash:digest,sellerOwnerId:owner,startsAt:iso,expiresAt:iso,buyers:z.tuple([z.object({ownerId:owner,payer:wallet}).strict(),z.object({ownerId:owner,payer:wallet}).strict()])}).strict();
export type ExternalBuyerPilot=Readonly<z.infer<typeof schema>>;
export type ExternalBuyerPilotConfiguration={enabled:boolean;configured:boolean;admissionOpen:boolean;policy?:ExternalBuyerPilot};
type PilotService={ownerId:string;cardHash:string;card:MarketOrder['card']};

function serviceMatches(p:ExternalBuyerPilot,service:PilotService):boolean{
 const c=service.card;
 return service.ownerId===p.sellerOwnerId&&service.cardHash===p.cardHash&&c.id===p.serviceId&&computeCanonicalServiceCardHash(c)===p.cardHash&&c.network==='stellar:testnet'&&c.payment.scheme==='exact'&&c.payment.asset==='USDC'&&c.payment.amount==='0.01'&&c.payment.destination===destination&&isCanonicalUsdcTestnet(c.payment.identity)&&c.payment.marketplace?.protocol==='x402-stellar-exact-v2'&&c.payment.marketplace.resourceTemplate==='/api/market/orders/{operationId}/x402'&&deliveryStorage(c.delivery).mode==='text'&&c.delivery?.result.contentType==='text/plain';
}

/** Optional server-owned policy, never client input. Invalid policy closes new
 * external admissions without throwing from legacy budget or recovery paths. */
export function externalBuyerPilotConfiguration(environment:Environment=process.env,now=Date.now()):ExternalBuyerPilotConfiguration{
 const raw=environment.BAZAAR_EXTERNAL_BUYER_PILOT_JSON;
 if(raw===undefined)return {enabled:false,configured:true,admissionOpen:false};
 const invalid={enabled:true,configured:false,admissionOpen:false};
 try{
  if(!Number.isSafeInteger(now)||now<0||Buffer.byteLength(raw)>4096)return invalid;
  const p=schema.parse(JSON.parse(raw)),start=Date.parse(p.startsAt),end=Date.parse(p.expiresAt);
  if(end<=start||end-start>86400000)return invalid;
  if(environment.VERCEL_ENV!=='production'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||!['compact-registry-v1','compact-registry-v2'].includes(environment.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE??'')||!['9900000000','9950000000'].includes(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES??'')||environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand'||environment.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID!==originalOperation||environment.BAZAAR_TEXT_SELLER_SERVICE_ID!==p.serviceId||environment.BAZAAR_TEXT_SELLER_CARD_HASH!==p.cardHash||environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT!==createHash('sha256').update(p.sellerOwnerId).digest('hex'))return invalid;
  const incumbents:unknown=JSON.parse(environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON??'null');
  if(!Array.isArray(incumbents)||incumbents.length!==1||incumbents[0]!==p.originalOwnerId)return invalid;
  if(new Set([p.originalOwnerId,p.sellerOwnerId,...p.buyers.map(b=>b.ownerId)]).size!==4||new Set(p.buyers.map(b=>b.payer)).size!==2||p.buyers.some(b=>[originalPayer,destination].includes(b.payer)))return invalid;
  const policy=Object.freeze({...p,buyers:Object.freeze(p.buyers.map(b=>Object.freeze(b)))}) as unknown as ExternalBuyerPilot;
  return {enabled:true,configured:true,admissionOpen:now>=start&&now<end,policy};
 }catch{return invalid;}
}

/** A closed window does not invalidate an already admitted immutable order.
 * Native callers still prove live account ownership, revisions and payment. */
export function externalBuyerPilotOrderMatches(order:MarketOrder,configuration:ExternalBuyerPilotConfiguration,now=Date.now()):boolean{
 const p=configuration.configured?configuration.policy:undefined;
 if(!p||!Number.isSafeInteger(now)||now<0)return false;
 try{
  const created=Date.parse(order.createdAt);
  return order.operationId!==originalOperation&&Number.isFinite(created)&&new Date(created).toISOString()===order.createdAt&&created>=Date.parse(p.startsAt)&&created<Date.parse(p.expiresAt)&&created<=now&&p.buyers.some(b=>b.ownerId===order.buyerOwnerId&&b.payer===order.payer)&&order.serviceId===p.serviceId&&serviceMatches(p,{ownerId:order.sellerOwnerId,cardHash:order.cardHash,card:order.card})&&order.executionMode==='on-demand'&&order.amount==='0.01'&&order.destination===destination&&order.paymentProtocol==='x402-stellar-exact-v2'&&isCanonicalUsdcTestnet(order.settlement);
 }catch{return false;}
}

/** New order admission only, after native ownership/review and before readiness.
 * The native CAS repeats it. Existing order recovery never calls this guard. */
export function assertExternalBuyerPilotPurchase(ownerId:string,input:Pick<MarketOrder,'serviceId'|'cardHash'|'payer'>,service:PilotService,environment:Environment=process.env,now=Date.now()):number|undefined{
 if(environment.BAZAAR_EXTERNAL_BUYER_PILOT_JSON===undefined)return;
 try{
  const incumbents:unknown=JSON.parse(environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON??'null');
  if(Array.isArray(incumbents)&&incumbents.length===1&&incumbents[0]===ownerId)return;
  const configuration=externalBuyerPilotConfiguration(environment,now),p=configuration.policy;
  if(configuration.admissionOpen&&p&&p.buyers.some(b=>b.ownerId===ownerId&&b.payer===input.payer)&&input.serviceId===p.serviceId&&input.cardHash===p.cardHash&&serviceMatches(p,service))return Date.parse(p.expiresAt);
 }catch{/* Native public failure contains no policy members or payer values. */}
 throw new WorkspaceError('BUYER_PILOT_INTENT_RESTRICTED',503);
}
