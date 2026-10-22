import {createHash} from 'node:crypto';
import {StrKey} from '@stellar/stellar-sdk';
import {z} from 'zod';
import type {MarketOrder,MarketState} from './marketplace-store.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {WorkspaceError} from './workspace-types.ts';

type Environment=Readonly<Record<string,string|undefined>>;
const digest=z.string().regex(/^[a-f0-9]{64}$/),owner=z.string().regex(/^ow_[a-f0-9]{32}$/);
const iso=z.string().refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value);
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Reviewed destinations only. URLs are server configuration; no card, request,
 * provider response or caller argument may redirect a credentialed request. */
export function multisellerHttpsEndpoint(value:string){
 try{const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.href!==value||url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!host.includes('.')||host.endsWith('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.includes(':')||/^\d+(?:\.\d+){3}$/.test(host))return false;
  return true;
 }catch{return false;}
}
const sellerSchema=z.object({serviceId:z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),cardHash:digest,sellerOwnerId:owner,destination:z.string().refine(v=>StrKey.isValidEd25519PublicKey(v)),providerUrl:z.string().max(512).refine(multisellerHttpsEndpoint),tokenEnvironment:z.enum(['BAZAAR_MULTI_SELLER_A_TOKEN','BAZAAR_MULTI_SELLER_B_TOKEN','BAZAAR_MULTI_SELLER_C_TOKEN']),protectionEnvironment:z.enum(['BAZAAR_MULTI_SELLER_A_PROTECTION','BAZAAR_MULTI_SELLER_B_PROTECTION','BAZAAR_MULTI_SELLER_C_PROTECTION']).optional()}).strict();
export const multisellerPolicySchema=z.object({version:z.literal(2),mode:z.literal('public-budgeted'),enabled:z.boolean(),startsAt:iso,resourceProfile:z.literal('compact-registry-v2'),windowMs:z.literal(31*86400000),maxOrdersPerOwner:z.literal(1),sellers:z.array(sellerSchema).min(1).max(3)}).strict().superRefine((p,ctx)=>{
 for(const field of ['sellerOwnerId','serviceId','cardHash','destination','tokenEnvironment'] as const)if(new Set(p.sellers.map(s=>s[field])).size!==p.sellers.length)ctx.addIssue({code:'custom',message:'Duplicate seller binding'});
 for(const s of p.sellers)if(s.protectionEnvironment&&s.protectionEnvironment!==s.tokenEnvironment.replace('_TOKEN','_PROTECTION'))ctx.addIssue({code:'custom',message:'Invalid credential slot'});
});
export type MultisellerPolicy=Readonly<z.infer<typeof multisellerPolicySchema>>;
export type MultisellerBinding=Readonly<MultisellerPolicy['sellers'][number]>;
export type SellerIdentity={serviceId:string;cardHash:string;sellerOwnerId:string};
type Service={ownerId:string;cardHash:string;card:MarketOrder['card']};
/** Parses only the opt-in version. A malformed v2 cannot fall back to v1. */
export function configuredMultisellerPolicy(environment:Environment=process.env):MultisellerPolicy|undefined{
 const raw=environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON;if(raw===undefined)return;
 try{if(Buffer.byteLength(raw)>4096)throw Error();const p=JSON.parse(raw);if(p?.version!==2)return;return multisellerPolicySchema.parse(p);}catch{throw new WorkspaceError('MULTISELLER_CONFIGURATION_INCOMPLETE',503);}
}
export function multisellerBindingFor(policy:MultisellerPolicy,identity:SellerIdentity){return policy.sellers.find(s=>s.serviceId===identity.serviceId&&s.cardHash===identity.cardHash&&s.sellerOwnerId===identity.sellerOwnerId);}
export function multisellerServiceMatches(policy:MultisellerPolicy,service:Service){
 try{const c=service.card,s=multisellerBindingFor(policy,{serviceId:c.id,cardHash:service.cardHash,sellerOwnerId:service.ownerId});return Boolean(s&&computeCanonicalServiceCardHash(c)===s.cardHash&&c.network==='stellar:testnet'&&c.payment.scheme==='exact'&&c.payment.asset==='USDC'&&c.payment.amount==='0.01'&&c.payment.destination===s.destination&&isCanonicalUsdcTestnet(c.payment.identity)&&c.paymentOptions===undefined&&c.payment.marketplace?.protocol==='x402-stellar-exact-v2'&&c.payment.marketplace.resourceTemplate==='/api/market/orders/{operationId}/x402'&&deliveryStorage(c.delivery).mode==='text'&&c.delivery?.result.contentType==='text/plain'&&multisellerHttpsEndpoint(new URL(c.url).href)&&new URL(c.url).origin===new URL(s.providerUrl).origin);}catch{return false;}
}
/** Secrets are read from three fixed operator-controlled slots only. Every
 * configured seller must be complete, otherwise fresh v2 admission is closed. */
export function assertMultisellerCredentials(policy:MultisellerPolicy,environment:Environment=process.env){
 for(const s of policy.sellers){const token=environment[s.tokenEnvironment],protection=s.protectionEnvironment?environment[s.protectionEnvironment]:undefined;if(!/^[A-Za-z0-9_-]{43}$/.test(token??'')||s.protectionEnvironment&&(!protection||protection.length>1024||/[\r\n]/.test(protection)))throw new WorkspaceError('MULTISELLER_CONFIGURATION_INCOMPLETE',503);}
}
export function multisellerRuntimeBinding(identity:SellerIdentity,environment:Environment=process.env){
 const p=configuredMultisellerPolicy(environment);if(!p)return;
 const s=multisellerBindingFor(p,identity);if(!s)return;
 assertMultisellerCredentials(p,environment);
 return {serviceId:s.serviceId,cardHash:s.cardHash,ownerFingerprint:sha(s.sellerOwnerId),url:s.providerUrl,token:environment[s.tokenEnvironment]!,...(s.protectionEnvironment?{protection:environment[s.protectionEnvironment]!}:{}),profile:'multiseller-v2' as const};
}
/** Registration's signed wallet challenge supplies this identity. A reviewed
 * card or a provider report alone never proves control of its destination. */
export function assertMultisellerWallet(identity:SellerIdentity,wallet:{wallet:string;network:string}|null|undefined,environment:Environment=process.env){
 const p=configuredMultisellerPolicy(environment),s=p&&multisellerBindingFor(p,identity);if(!s)return;
 if(wallet?.wallet!==s.destination||wallet.network!=='stellar:testnet')throw new WorkspaceError('SELLER_WALLET_BINDING_REQUIRED',503);
}
/** Native publication calls this in its market CAS after the workspace
 * generation guard. Control proof and manual activation remain mandatory. */
export function assertMultisellerSubmission(state:MarketState,ownerId:string,card:MarketOrder['card'],submissionId:string,environment:Environment=process.env){
 const p=configuredMultisellerPolicy(environment);if(!p)return;
 if(!multisellerServiceMatches(p,{ownerId,cardHash:computeCanonicalServiceCardHash(card),card}))throw new WorkspaceError('SELLER_BINDING_NOT_REVIEWED',403);
 if(state.services.some(s=>s.ownerId===ownerId&&!s.withdrawn&&s.submissionId!==submissionId))throw new WorkspaceError('SELLER_SERVICE_LIMIT',409);
}
