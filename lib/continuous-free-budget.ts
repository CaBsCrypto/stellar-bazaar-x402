import {createHash} from 'node:crypto';
import {Redis} from '@upstash/redis';
import {WorkspaceError} from './workspace-types.ts';
import {operationalRequestEnvelope} from './operational-budget.ts';
import type {FreeDemoRequestClass} from './free-demo-budget.ts';
import type {MarketOrder} from './marketplace-store.ts';
import {isCanonicalUsdcTestnet} from './payment-assets.ts';
import {deliveryStorage} from './delivery-contract.ts';
import {computeCanonicalServiceCardHash} from './canonical-service-card.ts';
import {meteredExampleBudgetRedis} from './example-budget-wire.ts';

export const CONTINUOUS_FREE_WINDOW_MS=31*86400000;
export const CONTINUOUS_FREE_COMMAND_MAX=400000;
export const CONTINUOUS_FREE_TRANSFER_MAX=8_000_000_000;
export const CONTINUOUS_FREE_LIMITS=Object.freeze({public:155000,authenticated:90000,recovery:105000,background:50000});
export const CONTINUOUS_FREE_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:2_000_000_000});
export const CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:900_000_000});
const recoveryIncident='31c97193-be74-4b9d-b0a3-f3890b0a41e8',recoveryService='guionista-bazaar-production-text-v1';
export type ContinuousFreeProfile=keyof typeof CONTINUOUS_FREE_LIMITS;
export type ContinuousFreeConfiguration={mode:'continuous';windowId:'rolling-31-days-v1';windowMs:number;limits:Record<ContinuousFreeProfile,number>;transferBytes:number;configurationId:string};
export type ContinuousFreeOperation={operationId:string;principalHash:string;action:'reserve'|'release'};
export interface ContinuousFreeRedis {eval(script:string,keys:string[],args:string[]):Promise<unknown>;get?(key:string):Promise<unknown>}
type Environment=Readonly<Record<string,string|undefined>>;
export const CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION='example-text-wire/v1' as const;
export const CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V2='example-text-wire/v2' as const;
export const CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3='example-text-wire/v3' as const;
type ExampleBudgetVersion=typeof CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION|typeof CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V2|typeof CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3;
const exampleVersions=[CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION,CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V2,CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3] as const;
const finiteExampleVersions=[CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V2,CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3] as const;
// This enforced provider-only bound excludes native readiness/dispatch CAS and
// native MCP I/O. It must not be used as a complete per-tick credit by itself.
export const CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND=Object.freeze({commands:1000,transferBytes:40*1048576});
export const CONTINUOUS_EXAMPLE_TEXT_NATIVE_BACKGROUND_BOUND=Object.freeze({commands:256,transferBytes:16*1048576});
export const CONTINUOUS_EXAMPLE_TEXT_BACKGROUND_RESERVATION=Object.freeze({
 commands:CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND.commands+CONTINUOUS_EXAMPLE_TEXT_NATIVE_BACKGROUND_BOUND.commands,
 transferBytes:CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND.transferBytes+CONTINUOUS_EXAMPLE_TEXT_NATIVE_BACKGROUND_BOUND.transferBytes,
});
const exampleService='bazaar-recovery-example-text-v1';
export type ContinuousExampleBudgetMarker={version:ExampleBudgetVersion;bindingHash:string};
export type ContinuousExampleBudgetProof=Readonly<{version:ExampleBudgetVersion;scope:'operation'|'control'|'public';operationId?:string;principalHash:string;bindingHash:string;requestClassHash?:string}>;
export type ContinuousExampleWireContext=FreeDemoRequestClass|{profile:'background';reason:'readiness'|'wake';operationId:string;principalHash:string};
type MarkedExampleOrder=MarketOrder&{budgetProfile?:ContinuousExampleBudgetMarker};
const exampleProofs=new WeakSet<object>();
const exampleProofBindings=new WeakMap<object,string>();
function exampleProfileEnabled(environment:Environment){return exampleVersions.includes(environment.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE as ExampleBudgetVersion)&&environment.BAZAAR_FREE_DEMO_MODE==='continuous'&&['preview','production'].includes(environment.VERCEL_ENV??'');}
function exampleWorkerEndpointValid(endpoint:URL,environment:Environment){return endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&!endpoint.port&&!endpoint.search&&!endpoint.hash&&endpoint.pathname==='/api/bazaar/example/tick'&&/^ai-video-scriptwriter(?:-[a-z0-9-]+)?(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/.test(endpoint.hostname)&&(environment.VERCEL_ENV==='preview'||['ai-video-scriptwriter.vercel.app','ai-video-scriptwriter-example.vercel.app'].includes(endpoint.hostname));}
function publicExampleBinding(cardHash:string,ownerFingerprint:string,endpoint:URL,version:ExampleBudgetVersion=CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION){
 const publicBinding={version,serviceId:exampleService,cardHash,ownerFingerprint,workerUrl:endpoint.href};
 const encodedBinding=JSON.stringify(Object.fromEntries(Object.entries(publicBinding).sort(([a],[b])=>a.localeCompare(b))));
 return {...publicBinding,bindingHash:createHash('sha256').update(encodedBinding).digest('hex'),providerOrigin:endpoint.origin};
}
/** Private server configuration. Numeric bounds and profiles are never MCP
 * fields. A credential rotation does not invalidate the immutable budget marker. */
function exampleBudgetBinding(environment:Environment){
 if(environment.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE===undefined)return undefined;
 try{
  if(!exampleProfileEnabled(environment))throw Error();
  const raw=environment.BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON;if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)throw Error();
  const value=JSON.parse(raw),required=['serviceId','cardHash','ownerFingerprint','url','token'];
  if(!value||Array.isArray(value)||typeof value!=='object'||!required.every(k=>Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,'protection'].includes(k))||Object.values(value).some(v=>typeof v!=='string'))throw Error();
  const endpoint=new URL(value.url),preview=environment.VERCEL_ENV==='preview';
  if(value.serviceId!==exampleService||!/^[a-f0-9]{64}$/.test(value.cardHash)||!/^[a-f0-9]{64}$/.test(value.ownerFingerprint)||!/^[a-zA-Z0-9_-]{43}$/.test(value.token)||!exampleWorkerEndpointValid(endpoint,environment)||value.protection!==undefined&&(!preview||!value.protection||value.protection.length>1024||/[\r\n]/.test(value.protection)))throw Error();
  return publicExampleBinding(value.cardHash,value.ownerFingerprint,endpoint,environment.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE as ExampleBudgetVersion);
 }catch{throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_BINDING_UNAVAILABLE',503);}
}
function validExampleOrder(order:MarketOrder,binding:NonNullable<ReturnType<typeof exampleBudgetBinding>>){
 try{
  const input=order.input,card=order.card;
  return Buffer.byteLength(JSON.stringify(card))<=8192&&order.serviceId===exampleService&&card.id===exampleService&&order.cardHash===binding.cardHash&&computeCanonicalServiceCardHash(card)===binding.cardHash&&createHash('sha256').update(order.sellerOwnerId).digest('hex')===binding.ownerFingerprint&&card.url===binding.providerOrigin&&card.routeTemplate==='/v1/bazaar-recovery-example'&&card.network==='stellar:testnet'&&card.payment.scheme==='exact'&&card.payment.asset==='USDC'&&isCanonicalUsdcTestnet(card.payment.identity)&&isCanonicalUsdcTestnet(order.settlement)&&order.paymentProtocol==='x402-stellar-exact-v2'&&order.executionMode==='on-demand'&&deliveryStorage(card.delivery).mode==='text'&&card.delivery?.result.contentType==='text/plain'&&card.payment.amount==='0.01'&&order.amount==='0.01'&&order.destination===card.payment.destination&&/^G[A-Z2-7]{55}$/.test(order.payer)&&/^ow_[a-f0-9]{32}$/.test(order.buyerOwnerId)&&/^ow_[a-f0-9]{32}$/.test(order.sellerOwnerId)&&input&&Object.keys(input).join(',')==='format'&&input.format==='text'&&order.inputHash===createHash('sha256').update('{"format":"text"}').digest('hex');
 }catch{return false;}
}
/** Native createMarketOrder calls this only for a newly prepared order, before
 * readiness and atomic admission. Existing orders must never be restamped. */
export function continuousExampleBudgetMarker(order:MarketOrder,environment:Environment=process.env):ContinuousExampleBudgetMarker|undefined{
 const binding=exampleBudgetBinding(environment);if(!binding||order.serviceId!==exampleService)return undefined;
 operationShape(order.operationId,createHash('sha256').update(order.buyerOwnerId).digest('hex'));
 if(!validExampleOrder(order,binding)||order.phase!=='awaiting-payment'||(order as MarkedExampleOrder).budgetProfile!==undefined||order.transactionHash||order.paymentVerifiedAt||order.attemptId||order.settlementAttemptId||order.delivery||order.textWake)throw new WorkspaceError('EXAMPLE_TEXT_NEW_ORDER_PROFILE_REQUIRED',503);
 return Object.freeze({version:binding.version,bindingHash:binding.bindingHash});
}
/** Handler credentials/permissions are verified before this internal mint.
 * The proof cannot be recreated through a JSON tool argument or response. */
export function createContinuousExampleBudgetProof(order:MarketOrder,principalHash:string,environment:Environment=process.env):ContinuousExampleBudgetProof|undefined{
 const marker=(order as MarkedExampleOrder).budgetProfile;if(marker===undefined)return undefined;
 // Recovery is tied to the persisted order, not today's publication, owner or
 // worker credential. Rotating current server configuration cannot resize an
 // existing hold or strand an otherwise valid marked operation.
 let binding:ReturnType<typeof publicExampleBinding>;
 try{
  if(!exampleProfileEnabled(environment)||!marker||Object.keys(marker).sort().join(',')!=='bindingHash,version'||!exampleVersions.includes(marker.version)||!/^[a-f0-9]{64}$/.test(marker.bindingHash))throw Error();
  const endpoint=new URL('/api/bazaar/example/tick',order.card.url);
  if(!exampleWorkerEndpointValid(endpoint,environment)||order.card.url!==endpoint.origin)throw Error();
  binding=publicExampleBinding(order.cardHash,createHash('sha256').update(order.sellerOwnerId).digest('hex'),endpoint,marker.version);
  if(marker.bindingHash!==binding.bindingHash||!validExampleOrder(order,binding)||principalHash!==createHash('sha256').update(order.buyerOwnerId).digest('hex'))throw Error();
 }catch{throw new WorkspaceError('EXAMPLE_TEXT_ORDER_PROFILE_UNAVAILABLE',503);}
 operationShape(order.operationId,principalHash);
 const proof=Object.freeze({version:marker.version,scope:'operation' as const,operationId:order.operationId,principalHash,bindingHash:binding.bindingHash});
 exampleProofs.add(proof);exampleProofBindings.set(proof,binding.bindingHash);return proof;
}
export function validateContinuousExampleBudgetProof(value:unknown):ContinuousExampleBudgetProof{
 if(!value||typeof value!=='object'||!exampleProofs.has(value))throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);
 const proof=value as ContinuousExampleBudgetProof;
 if(!exampleVersions.includes(proof.version)||proof.bindingHash!==exampleProofBindings.get(value))throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);
 return proof;
}
function exampleControlClass(kind:FreeDemoRequestClass){
 if(kind.operationId!==undefined||kind.principalHash!==undefined||kind.operationLookup===true||kind.bootstrapCreation)return undefined;
 const eligible=kind.profile==='public'&&kind.newOperation===false&&['metadata','observed-metadata','catalog'].includes(kind.workload??'')||kind.profile==='recovery'&&kind.newOperation===false&&['identity','orders'].includes(kind.workload??'')||kind.profile==='authenticated'&&kind.workload==='capacity';
 if(!eligible)return undefined;
 return createHash('sha256').update(JSON.stringify({profile:kind.profile,newOperation:kind.newOperation,workload:kind.workload})).digest('hex');
}
/** A verified account may receive bounded control costs. The exact reviewed
 * buyer allowlist and configured seller are the only principals eligible.
 * Requested-order recovery never falls back to this control-only proof. */
export function createContinuousExampleControlProof(principalOwnerId:string,kind:FreeDemoRequestClass,environment:Environment=process.env):ContinuousExampleBudgetProof|undefined{
 const binding=exampleBudgetBinding(environment),requestClassHash=exampleControlClass(kind);if(!binding||!requestClassHash)return undefined;
 if(!/^ow_[a-f0-9]{32}$/.test(principalOwnerId))throw new WorkspaceError('EXAMPLE_TEXT_CONTROL_PRINCIPAL_REQUIRED',503);
 let buyers:unknown;
 try{const raw=environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;if(typeof raw!=='string'||Buffer.byteLength(raw)>4096)throw Error();buyers=JSON.parse(raw);}catch{throw new WorkspaceError('EXAMPLE_TEXT_CONTROL_PRINCIPAL_REQUIRED',503);}
 if(!Array.isArray(buyers)||buyers.length!==1||typeof buyers[0]!=='string'||!/^ow_[a-f0-9]{32}$/.test(buyers[0]))throw new WorkspaceError('EXAMPLE_TEXT_CONTROL_PRINCIPAL_REQUIRED',503);
 const principalHash=createHash('sha256').update(principalOwnerId).digest('hex');if(principalOwnerId!==buyers[0]&&principalHash!==binding.ownerFingerprint)return undefined;
 const proof=Object.freeze({version:binding.version,scope:'control' as const,principalHash,bindingHash:binding.bindingHash,requestClassHash});
 exampleProofs.add(proof);exampleProofBindings.set(proof,binding.bindingHash);return proof;
}
export function continuousExampleBudgetContext(value:unknown){const proof=validateContinuousExampleBudgetProof(value);return proof.scope==='operation'?{operationId:proof.operationId!,principalHash:proof.principalHash}:{};}
function publicExampleClassHash(kind:FreeDemoRequestClass){
 if(kind.profile!=='public'||kind.newOperation!==false||!['metadata','catalog'].includes(kind.workload??'')||kind.operationId!==undefined||kind.principalHash!==undefined||kind.operationLookup||kind.bootstrapCreation||kind.exampleBudgetPath!==undefined)return undefined;
 return createHash('sha256').update(JSON.stringify({profile:kind.profile,newOperation:false,workload:kind.workload,credentialRead:kind.credentialRead===true})).digest('hex');
}
/** Public native reads remain public. This server-only proof changes pricing,
 * never authentication or permission checks, and cannot select a payment path. */
export function createContinuousExamplePublicProof(kind:FreeDemoRequestClass,environment:Environment=process.env):ContinuousExampleBudgetProof|undefined{
 if(!finiteExampleVersions.some(version=>environment.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE===version)||environment.BAZAAR_ENABLE_MARKETPLACE!=='true')return undefined;
 const requestClassHash=publicExampleClassHash(kind);if(!requestClassHash)return undefined;
 const binding=exampleBudgetBinding(environment);if(!binding)return undefined;
 const proof=Object.freeze({version:binding.version,scope:'public' as const,principalHash:binding.bindingHash,bindingHash:binding.bindingHash,requestClassHash});
 exampleProofs.add(proof);exampleProofBindings.set(proof,binding.bindingHash);return proof;
}
/** Provider I/O and the separately enforced native scope both count. A guardian
 * sweep cannot select this per-operation worker profile. */
export function continuousExampleBudgetBackgroundReservation(value:unknown,reason:'readiness'|'wake'|'guardian'){
 const proof=validateContinuousExampleBudgetProof(value);
 if(proof.scope!=='operation'||!['readiness','wake'].includes(reason))throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);
 return CONTINUOUS_EXAMPLE_TEXT_BACKGROUND_RESERVATION;
}
/** The guard never authorizes more native work than its charged credit. The
 * provider has its own 40-MiB guard; native background I/O is separate. */
export function continuousExampleBudgetWireLimits(value:unknown,kind?:ContinuousExampleWireContext){
 const proof=validateContinuousExampleBudgetProof(value);
 if(kind){
  if(kind.profile==='background'){
   if(proof.scope!=='operation'||!['readiness','wake'].includes(kind.reason)||kind.operationId!==proof.operationId||kind.principalHash!==proof.principalHash)throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);
  }else validateExampleRequestProof(kind,proof);
 }
 if(!kind)throw new WorkspaceError('EXAMPLE_TEXT_WIRE_CONTEXT_REQUIRED',503);
 const background=kind.profile==='background';
 const credit=background?CONTINUOUS_EXAMPLE_TEXT_NATIVE_BACKGROUND_BOUND:continuousFreeReservation(kind,proof);
 const combined=background?credit.transferBytes:credit.transferBytes-262144;
 return {maximumRedisRequests:background?32:112,maximumRedisCommands:credit.commands,maximumOutboundBytes:combined,maximumInboundBytes:combined,maximumCombinedBytes:combined};
}
/** An explicit reviewed exception. This changes no ledger, bucket, old hold or
 * command configuration id. Values other than the exact proposal fail closed. */
function textRecoveryTransferConfiguration(environment:Environment){
 if(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES===undefined)return undefined;
 if(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES!=='8500000000'||environment.VERCEL_ENV!=='production'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand'||environment.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID!==recoveryIncident||environment.BAZAAR_TEXT_SELLER_SERVICE_ID!==recoveryService||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_TEXT_SELLER_CARD_HASH??'')||!/^[a-f0-9]{64}$/.test(environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT??''))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 let owners:unknown;try{const raw=environment.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON;if(raw===undefined||Buffer.byteLength(raw)>4096)throw Error();owners=JSON.parse(raw);}catch{throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}
 if(!Array.isArray(owners)||owners.length!==1||typeof owners[0]!=='string'||!/^ow_[a-f0-9]{32}$/.test(owners[0]))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 return {transferBytes:8_500_000_000,buyerOwnerId:owners[0] as string};
}
/** Prepared, restricted example proposal. This private deployment flag never
 * rewrites usage or reservations and leaves the existing Guion cap unchanged.
 * Applying it requires a fresh shared Free-quota and complete-flow review. */
function exampleV2TransferConfiguration(environment:Environment){
 if(environment.BAZAAR_EXAMPLE_TEXT_TRANSFER_BUDGET_BYTES===undefined)return undefined;
 if(environment.BAZAAR_EXAMPLE_TEXT_TRANSFER_BUDGET_BYTES!=='9900000000'||environment.VERCEL_ENV!=='production'||!finiteExampleVersions.some(version=>environment.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE===version)||environment.BAZAAR_ENABLE_MARKETPLACE!=='true'||!textRecoveryTransferConfiguration(environment))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const binding=exampleBudgetBinding(environment);
 if(!binding||binding.cardHash!=='c96bdee6b8a9bdeba35b4e723f5aea79a62b579d488cb70aa6ab2e939d2b45e1'||binding.workerUrl!=='https://ai-video-scriptwriter-example.vercel.app/api/bazaar/example/tick')throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 return {transferBytes:9_900_000_000};
}
export function continuousFreeBudgetConfiguration(environment:Environment=process.env):ContinuousFreeConfiguration|undefined{
 const mode=environment.BAZAAR_FREE_DEMO_MODE;
 if(mode===undefined){if(environment.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES!==undefined||environment.BAZAAR_EXAMPLE_TEXT_TRANSFER_BUDGET_BYTES!==undefined)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');return undefined;}
 if(mode!=='continuous'||environment.BAZAAR_FREE_DEMO_ADMISSION_UNTIL!==undefined)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 let limits:unknown=CONTINUOUS_FREE_LIMITS;
 if(environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON!==undefined){try{const raw=environment.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON;if(Buffer.byteLength(raw)>512)throw Error();limits=JSON.parse(raw);}catch{throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}}
 const names=Object.keys(CONTINUOUS_FREE_LIMITS) as ContinuousFreeProfile[];
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).sort().join(',')!==names.sort().join(',')||names.some(n=>!Number.isSafeInteger((limits as Record<ContinuousFreeProfile,number>)[n])||(limits as Record<ContinuousFreeProfile,number>)[n]<1)||names.reduce((s,n)=>s+(limits as Record<ContinuousFreeProfile,number>)[n],0)>CONTINUOUS_FREE_COMMAND_MAX)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const copy=Object.fromEntries((['public','authenticated','recovery','background'] as const).map(name=>[name,(limits as Record<ContinuousFreeProfile,number>)[name]])) as Record<ContinuousFreeProfile,number>;
 const textRecovery=textRecoveryTransferConfiguration(environment),exampleV2=exampleV2TransferConfiguration(environment);
 return {mode:'continuous',windowId:'rolling-31-days-v1',windowMs:CONTINUOUS_FREE_WINDOW_MS,limits:copy,transferBytes:exampleV2?.transferBytes??textRecovery?.transferBytes??CONTINUOUS_FREE_TRANSFER_MAX,configurationId:createHash('sha256').update(JSON.stringify(copy)).digest('hex')};
}
export function continuousFreeBudgetKey(prefix:string){
 if(!/^bazaar-workspace:(?:pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32}|local-test|preview|production)$/.test(prefix))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const tag=prefix.split(':')[1];return `${prefix}:{${tag}}:continuous-free-budget:v1`;
}
type ExampleScopedRequest=FreeDemoRequestClass&{exampleBudgetProof?:ContinuousExampleBudgetProof};
function validateExampleRequestProof(kind:FreeDemoRequestClass,proof:ContinuousExampleBudgetProof){if(proof.scope==='operation'?(kind.operationId!==proof.operationId||kind.principalHash!==proof.principalHash):(proof.scope==='public'?publicExampleClassHash(kind):exampleControlClass(kind))!==proof.requestClassHash)throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);if(kind.exampleBudgetPath!==undefined&&(!finiteExampleVersions.some(version=>proof.version===version)||proof.scope!=='operation'||kind.profile!=='recovery'||kind.exampleBudgetPath==='order-read'&&kind.workload!=='orders'||kind.exampleBudgetPath==='challenge'&&kind.workload!=='financial'))throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);}
function v2RequestReservation(kind:FreeDemoRequestClass,proof:ContinuousExampleBudgetProof){
 if(!finiteExampleVersions.some(version=>proof.version===version))return undefined;
 const cost=(commands:number,miB:number)=>({commands,transferBytes:miB*1048576+262144});
 if(kind.profile==='public'&&kind.workload==='metadata')return cost(32,proof.version===CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION_V3?8.5:10);
 if(kind.profile==='public'&&kind.workload==='catalog')return proof.scope==='public'&&kind.credentialRead!==true?cost(64,16):cost(112,36);
 if(kind.profile==='recovery'&&kind.workload==='identity')return cost(64,20);
 if(kind.profile==='authenticated'&&kind.workload==='capacity')return cost(96,32);
 if(kind.profile==='recovery'&&kind.workload==='orders')return cost(proof.scope==='control'||kind.exampleBudgetPath==='order-read'?64:96,proof.scope==='control'||kind.exampleBudgetPath==='order-read'?20:28);
 if(kind.profile==='recovery'&&kind.workload==='financial'&&kind.exampleBudgetPath==='challenge')return cost(96,36);
 return undefined;
}
export function continuousFreeReservation(kind:ExampleScopedRequest,exampleProof?:ContinuousExampleBudgetProof){
 const suppliedProof=exampleProof??kind.exampleBudgetProof;
 if(exampleProof&&kind.exampleBudgetProof&&exampleProof!==kind.exampleBudgetProof)throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);
 if(suppliedProof)validateExampleRequestProof(kind,validateContinuousExampleBudgetProof(suppliedProof));
 if(suppliedProof){const v2=v2RequestReservation(kind,suppliedProof);if(v2)return v2;}
 const envelope=operationalRequestEnvelope(kind.profile,kind.workload);
 // Native atomic storage guards add two GETs and two Lua commands per write.
 // Storage is changed through bounded patches inside native Lua, not by
 // transporting the global ledger. Include the command-ledger transport.
 const metadata=kind.profile==='public'&&kind.workload==='metadata';
 const light=kind.profile==='public'&&kind.workload==='observed-metadata'||kind.profile==='recovery'&&(kind.workload==='identity'||kind.workload==='orders')||kind.profile==='authenticated'&&kind.workload==='capacity';
 // Stateless initialize/notification/tools-list/GET and anonymous static
 // capabilities have no account quota/history observer. Continuous ingress
 // makes exactly one READ/CAS attempt, with at most one credential proof.
 // Two 1-MiB registry reads can JSON-wrap to 4 MiB inbound; their snapshot/
 // replacement CAS is at most 4 MiB outbound. Eight outbound MiB leave room
 // for bounded SDK envelopes, guards, DTO and protocol headers.
 // Light native controls make one ingress and account CAS, with at most one
 // observer write. Six wrapped registry reads plus three guarded replacements,
 // bounded owner/permission snapshots, review/market reads and DTO fit 32 MiB
 // combined. Continuous financial/error paths make no ingress/quota retry:
 // the native typed-snapshot upper bound is below 96 MiB, including a first
 // signed request, joint guards, uncertainty writes and the HTTP access stage.
 // The default/legacy operational envelopes remain unchanged elsewhere.
 const transferBytes=metadata?12*1048576+128*1024+131072:light?32*1048576+128*1024+131072:kind.profile==='recovery'&&kind.workload==='financial'?96*1048576+262144:kind.profile==='authenticated'&&kind.workload==='order-create'?48*1048576+262144:envelope.inboundBytes+envelope.outboundBytes+131072;
 return {commands:envelope.redisCommands+80+(kind.credentialRead||kind.profile!=='public'&&!kind.bootstrapCreation?4:0),transferBytes};
}

/** Finite recovery for NEW marked example orders: two forced readiness checks,
 * three targeted delivery wakes, at most seven seller order calls per wake,
 * three buyer financial calls and two buyer reads, plus one archived financial
 * check and read. Metadata/identity/capacity remain globally charged. Existing
 * held entries are returned unchanged by the atomic reservation function. */
export function continuousExampleOperationReservation(version:ExampleBudgetVersion=CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION){
 if(finiteExampleVersions.some(supported=>version===supported)){
  // Three bounded wakes need at most 14 native order calls in the reviewed
  // worker failure/ACK matrix. Keep one extra write slot: 10 reads + 5 writes.
  const read={commands:64,transferBytes:20*1048576+262144},write={commands:96,transferBytes:28*1048576+262144};
  const challenge={commands:96,transferBytes:36*1048576+262144};
  const financial=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'financial'}),archive=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'orders'});
  return Object.freeze({recoveryCommands:12*read.commands+5*write.commands+challenge.commands+3*financial.commands+archive.commands,backgroundCommands:5*(CONTINUOUS_EXAMPLE_TEXT_BACKGROUND_RESERVATION.commands+4),transferBytes:12*read.transferBytes+5*write.transferBytes+challenge.transferBytes+3*financial.transferBytes+archive.transferBytes+5*(CONTINUOUS_EXAMPLE_TEXT_BACKGROUND_RESERVATION.transferBytes+4096)});
 }
 if(version!==CONTINUOUS_EXAMPLE_TEXT_BUDGET_VERSION)throw new WorkspaceError('EXAMPLE_TEXT_ORDER_PROFILE_UNAVAILABLE',503);
 const orders=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'orders'});
 const financial=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'financial'});
 const ticks=5,orderCalls=3*7+2+1,financialCalls=3+1;
 return Object.freeze({
  recoveryCommands:orderCalls*orders.commands+financialCalls*financial.commands,
  backgroundCommands:ticks*(CONTINUOUS_EXAMPLE_TEXT_BACKGROUND_RESERVATION.commands+4),
  transferBytes:ticks*(CONTINUOUS_EXAMPLE_TEXT_BACKGROUND_RESERVATION.transferBytes+4096)+orderCalls*orders.transferBytes+financialCalls*financial.transferBytes,
 });
}

/** Daily buckets are kept until their entire day lies outside 31 days. This is
 * deliberately conservative (at most one extra day), never a midnight reset.
 * Held payment work is independent of buckets and has no TTL. */
export const CONTINUOUS_FREE_BUDGET_FUNCTIONS=`
local function budget_prepare(raw,config,request)
 local names={'public','authenticated','recovery','background'}
 local zero={public=0,authenticated=0,recovery=0,background=0}
 local state={version=2,configuration=config.configurationId,last=0,buckets={},held={}}
 if raw then
  if string.len(raw)>262144 then return nil,-2 end
  local ok,parsed=pcall(cjson.decode,raw)
  if not ok or type(parsed)~='table' or parsed.version~=2 or parsed.configuration~=config.configurationId or type(parsed.last)~='number' or parsed.last<0 or parsed.last%1~=0 or type(parsed.buckets)~='table' or type(parsed.held)~='table' then return nil,-2 end
  state=parsed
 end
 local clock=redis.call('TIME');local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
 if state.last>now then return nil,-2 end
 local day=math.floor(now/86400000);local oldest=math.floor((now-config.windowMs)/86400000)
 local buckets={};local used={public=0,authenticated=0,recovery=0,background=0};local totalBytes=0;local previous=-1;local current=nil
 for _,b in ipairs(state.buckets) do
  if type(b)~='table' or type(b.day)~='number' or b.day%1~=0 or b.day<=previous or b.day>day or type(b.used)~='table' or type(b.bytes)~='number' or b.bytes<0 or b.bytes%1~=0 then return nil,-2 end
  previous=b.day
  for _,n in ipairs(names) do if type(b.used[n])~='number' or b.used[n]<0 or b.used[n]%1~=0 then return nil,-2 end end
  if b.day>=oldest then
   table.insert(buckets,b);totalBytes=totalBytes+b.bytes
   for _,n in ipairs(names) do used[n]=used[n]+b.used[n] end
   if b.day==day then current=b end
  end
 end
 if #buckets>32 or #state.held>128 then return nil,-2 end
 if not current then current={day=day,used={public=0,authenticated=0,recovery=0,background=0},bytes=0};table.insert(buckets,current) end
 state.buckets=buckets;state.last=now
 local held=nil;local ids={}
 for _,h in ipairs(state.held) do
  if type(h)~='table' or type(h.operationId)~='string' or type(h.principalHash)~='string' or ids[h.operationId] or type(h.recoveryCommands)~='number' or h.recoveryCommands<0 or h.recoveryCommands%1~=0 or type(h.backgroundCommands)~='number' or h.backgroundCommands<0 or h.backgroundCommands%1~=0 or type(h.transferBytes)~='number' or h.transferBytes<0 or h.transferBytes%1~=0 then return nil,-2 end
  ids[h.operationId]=true;used.recovery=used.recovery+h.recoveryCommands;used.background=used.background+h.backgroundCommands;totalBytes=totalBytes+h.transferBytes
  if request.operationId and h.operationId==request.operationId then held=h end
 end
 if request.action=='reserve' then
  if held then if held.principalHash~=request.principalHash then return nil,-3 end;return state,1 end
  if #state.held>=128 or used.recovery+request.recoveryCommands>config.limits.recovery or used.background+request.backgroundCommands>config.limits.background or totalBytes+request.transferBytes>config.transferBytes then return nil,0 end
  table.insert(state.held,{operationId=request.operationId,principalHash=request.principalHash,recoveryCommands=request.recoveryCommands,backgroundCommands=request.backgroundCommands,transferBytes=request.transferBytes});return state,1
 end
 if request.action=='release' then
  if not held then return state,1 end
  if held.principalHash~=request.principalHash then return nil,-3 end
  local remaining={};for _,h in ipairs(state.held) do if h.operationId~=request.operationId then table.insert(remaining,h) end end;state.held=remaining;return state,1
 end
 local profile=request.profile;local cost=request.commands;local bytes=request.transferBytes
 local denialCommands=request.denialCommands or 4;local denialBytes=request.denialTransferBytes or 4096
 if type(denialCommands)~='number' or denialCommands<4 or denialCommands>9 or denialCommands%1~=0 or type(denialBytes)~='number' or denialBytes<4096 or denialBytes>3149824 or denialBytes%1~=0 then return nil,-2 end
 if not config.limits[profile] or type(cost)~='number' or cost<4 or cost%1~=0 or type(bytes)~='number' or bytes<0 or bytes%1~=0 then return nil,-2 end
 if held then
  if held.principalHash~=request.principalHash or (profile~='recovery' and profile~='background') then return nil,-3 end
  local field=profile=='recovery' and 'recoveryCommands' or 'backgroundCommands'
  if held[field]>=cost and held.transferBytes>=bytes then held[field]=held[field]-cost;held.transferBytes=held.transferBytes-bytes;current.used[profile]=current.used[profile]+cost;current.bytes=current.bytes+bytes;return state,1,profile,used[profile] end
 end
 if used[profile]+cost>config.limits[profile] and profile=='public' and request.recoveryTransport then profile='recovery' end
 if used[profile]+cost>config.limits[profile] or totalBytes+bytes>config.transferBytes then
  -- The denial itself still costs EVAL/GET/TIME/SET. Track that overhead;
  -- it cannot make a provider's physical quota an absolute attack-proof cap.
  current.used.public=current.used.public+denialCommands;current.bytes=current.bytes+denialBytes;return state,0,profile,used[profile],60
 end
 current.used[profile]=current.used[profile]+cost;current.bytes=current.bytes+bytes
 return state,1,profile,used[profile]+cost
end
`;
export const CONTINUOUS_FREE_BUDGET_LUA=`-- continuous-free-command-reservations-v1
${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local ok,config=pcall(cjson.decode,ARGV[1]);local valid,request=pcall(cjson.decode,ARGV[2]);if not ok or not valid then return {-2,0,'public',60} end
local state,status,profile,used,retry=budget_prepare(redis.call('GET',KEYS[1]),config,request)
if not state then return {status,0,'public',60} end
local raw=cjson.encode(state);if string.len(raw)>262144 then return {-2,0,'public',60} end
redis.call('SET',KEYS[1],raw)
return {status,used or 0,profile or request.profile or 'background',retry or 60}`;
function operationShape(operationId:string,principalHash:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId)||!/^[a-f0-9]{64}$/.test(principalHash))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}
function interpret(result:unknown,configuration:ContinuousFreeConfiguration){
 if(!Array.isArray(result)||result.length!==4||!Number.isSafeInteger(result[1])||Number(result[1])<0||!['public','authenticated','recovery','background'].includes(String(result[2])))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 if(result[0]===0)throw new WorkspaceError('FREE_DEMO_REQUEST_LIMIT',429,60);
 if(result[0]!==1)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 const profile=result[2] as ContinuousFreeProfile;return {profile,reservedCommands:0,used:Number(result[1]),limit:configuration.limits[profile],evidence:'conservative-reservation' as const};
}
export function createContinuousFreeBudgetStore(redis:ContinuousFreeRedis,prefix:string,configuration:ContinuousFreeConfiguration){
 const key=continuousFreeBudgetKey(prefix);
 async function debit(request:Record<string,unknown>){try{return interpret(await redis.eval(CONTINUOUS_FREE_BUDGET_LUA,[key],[JSON.stringify(configuration),JSON.stringify(request)]),configuration);}catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}}
 return {
  async reserve(kind:ExampleScopedRequest&{operationId?:string;principalHash?:string}){const reservation=continuousFreeReservation(kind);if(kind.operationId!==undefined){operationShape(kind.operationId,kind.principalHash??'');}
   const proof=kind.credentialRead||kind.profile!=='public'&&!kind.bootstrapCreation;
   const result=await debit({action:'debit',profile:kind.profile,commands:reservation.commands,transferBytes:reservation.transferBytes,denialCommands:4+(proof?4:0)+(kind.operationLookup?1:0),denialTransferBytes:4096+(proof?2097152:0)+(kind.operationLookup?1048576:0),recoveryTransport:kind.recoveryTransport===true&&kind.credentialRead===true&&kind.profile==='public'&&kind.workload==='metadata',...(kind.operationId?{operationId:kind.operationId,principalHash:kind.principalHash}:{})});return {...result,requestedProfile:kind.profile,reservedCommands:reservation.commands,reservedTransferBytes:reservation.transferBytes};},
  async background(input:{operationId?:string;principalHash?:string;commands:number;transferBytes:number;reason:'readiness'|'wake'|'guardian';exampleBudgetProof?:ContinuousExampleBudgetProof}){if(!Number.isSafeInteger(input.commands)||input.commands<1||input.commands>12000||!Number.isSafeInteger(input.transferBytes)||input.transferBytes<0||input.transferBytes>2_000_000_000||!['readiness','wake','guardian'].includes(input.reason))throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');if(input.operationId!==undefined)operationShape(input.operationId,input.principalHash??'');if(input.exampleBudgetProof){const proof=validateContinuousExampleBudgetProof(input.exampleBudgetProof),cost=continuousExampleBudgetBackgroundReservation(proof,input.reason);if(proof.operationId!==input.operationId||proof.principalHash!==input.principalHash||input.commands!==cost.commands||input.transferBytes!==cost.transferBytes)throw new WorkspaceError('EXAMPLE_TEXT_BUDGET_PROOF_REQUIRED',503);}const result=await debit({action:'debit',profile:'background',commands:input.commands+4,transferBytes:input.transferBytes+4096,...(input.operationId?{operationId:input.operationId,principalHash:input.principalHash}:{})});return {...result,reservedCommands:input.commands+4};},
 };
}
export async function reserveContinuousFreeBackground(input:Parameters<ReturnType<typeof createContinuousFreeBudgetStore>['background']>[0]){
 const configuration=continuousFreeBudgetConfiguration();if(!configuration)return undefined;
 const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,prefix=process.env.BAZAAR_WORKSPACE_PREFIX;
 if(!url||!token||!prefix)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');try{if(new URL(url).protocol!=='https:')throw Error();}catch{throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');}
 return createContinuousFreeBudgetStore(meteredExampleBudgetRedis(new Redis({url,token,automaticDeserialization:false,retry:false,enableAutoPipelining:false})),prefix,configuration).background(input);
}
export function continuousFreeOperationRequest(operation:ContinuousFreeOperation,immutableOrder?:MarketOrder,environment:Environment=process.env){
 operationShape(operation.operationId,operation.principalHash);if(!['reserve','release'].includes(operation.action))throw new WorkspaceError('INVALID_COMMIT_GUARD');
 if(operation.action==='release')return {...operation};
 const config=textRecoveryTransferConfiguration(environment),o=immutableOrder;
 if((o as MarkedExampleOrder|undefined)?.budgetProfile!==undefined){
  const proof=createContinuousExampleBudgetProof(o!,operation.principalHash,environment);
  if(!proof||proof.scope!=='operation'||proof.operationId!==operation.operationId)throw new WorkspaceError('EXAMPLE_TEXT_ORDER_PROFILE_UNAVAILABLE',503);
  return {...operation,...continuousExampleOperationReservation(proof.version)};
 }
 const scoped=Boolean(config&&o&&o.operationId===operation.operationId&&o.operationId!==recoveryIncident&&o.buyerOwnerId===config.buyerOwnerId&&createHash('sha256').update(o.buyerOwnerId).digest('hex')===operation.principalHash&&o.serviceId===recoveryService&&o.card.id===recoveryService&&o.cardHash===environment.BAZAAR_TEXT_SELLER_CARD_HASH&&createHash('sha256').update(o.sellerOwnerId).digest('hex')===environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT&&o.executionMode==='on-demand'&&o.amount==='0.01'&&o.payer==='GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU'&&o.destination==='GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C'&&o.paymentProtocol==='x402-stellar-exact-v2'&&o.card.network==='stellar:testnet'&&isCanonicalUsdcTestnet(o.settlement)&&deliveryStorage(o.card.delivery).mode==='text');
 return {...operation,...(scoped?CONTINUOUS_TEXT_RECOVERY_OPERATION_RESERVATION:CONTINUOUS_FREE_OPERATION_RESERVATION)};
}

/** Embed inside the native CAS after every native revision guard and before any
 * SET. No side effect is possible until both the budget and native writes fit. */
export function continuousFreeOperationCommitScript(budgetKeyIndex:number,configArgIndex:number,requestArgIndex:number){return `${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local config=cjson.decode(ARGV[${configArgIndex}]);local request=cjson.decode(ARGV[${requestArgIndex}])
local budget,status=budget_prepare(redis.call('GET',KEYS[${budgetKeyIndex}]),config,request)
if status==0 then return -11 end
if not budget then return status==-3 and -12 or -10 end
if status~=1 then return -11 end
local budgetNext=cjson.encode(budget);if string.len(budgetNext)>262144 then return -10 end
`;}

/** Maintenance may release several definitely unpaid expired orders together.
 * The native caller proves their phases, then compares all of its snapshots.
 * One cached ledger is transformed repeatedly and published only once. */
export function continuousFreeReleaseBatchCommitScript(budgetKeyIndex:number,configArgIndex:number,requestsArgIndex:number){return `${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local config=cjson.decode(ARGV[${configArgIndex}]);local requests=cjson.decode(ARGV[${requestsArgIndex}])
local budgetRaw=redis.call('GET',KEYS[${budgetKeyIndex}]);if not budgetRaw then return -10 end
if type(requests)~='table' or #requests>20 then return -10 end
local budgetNext=budgetRaw
for _,request in ipairs(requests) do
 if request.action~='release' then return -10 end
 local budget,status=budget_prepare(budgetNext,config,request)
 if not budget or status~=1 then return -10 end
 budgetNext=cjson.encode(budget);if string.len(budgetNext)>262144 then return -10 end
end
`;}
