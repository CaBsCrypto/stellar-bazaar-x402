import {finitePilotProfile,FINITE_PILOT_ID} from './finite-pilot-budget.ts';
import {randomUUID} from 'node:crypto';
import {configuredMarketStore,type MarketOrder,type MarketService,type MarketState,type MarketStore} from './marketplace-store.ts';
import {sha} from './marketplace-identity.ts';
import {sellerCapacityDto} from './market-seller-capacity.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {WorkspaceError} from './workspace-types.ts';
import {reserveContinuousFreeBackground} from './continuous-free-budget.ts';
import {CONTINUOUS_CONTROL_BUDGET,continuousTextNativeBudgetLimits,withContinuousTextNativeBudget,withContinuousTextReadinessBudget} from './continuous-control-budget.ts';
import {isCompactWorkspaceTransport} from './quota-registry-patch.ts';

type Environment=Readonly<Record<string,string|undefined>>;
type Binding={serviceId:string;cardHash:string;ownerFingerprint:string;url:string;token:string;protection?:string};
const services=new Set(['guionista-bazaar-production-text-v1','guionista-bazaar-pilot-text-funded-v1']);
/** Only this reviewed first-party service gets an automatic wake. Endpoints and
 * credentials are server configuration, never card metadata or MCP arguments. */
export function textSellerConfiguration(environment:Environment=process.env):Binding|undefined{
 if(environment.BAZAAR_TEXT_SELLER_MODE===undefined)return undefined;
 try{
  if(environment.BAZAAR_TEXT_SELLER_MODE!=='on-demand'||environment.BAZAAR_FREE_DEMO_MODE!=='continuous')throw Error();
  const serviceId=environment.BAZAAR_TEXT_SELLER_SERVICE_ID!,cardHash=environment.BAZAAR_TEXT_SELLER_CARD_HASH!,ownerFingerprint=environment.BAZAAR_TEXT_SELLER_OWNER_FINGERPRINT!,url=environment.BAZAAR_TEXT_SELLER_WAKE_URL!,token=environment.BAZAAR_TEXT_SELLER_WAKE_TOKEN!,protection=environment.BAZAAR_TEXT_SELLER_WAKE_PROTECTION;
  const endpoint=new URL(url),preview=environment.VERCEL_ENV==='preview';
  if(!services.has(serviceId)||!/^[a-f0-9]{64}$/.test(cardHash)||!/^[a-f0-9]{64}$/.test(ownerFingerprint)||!/^[a-zA-Z0-9_-]{43}$/.test(token)||endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.port||endpoint.search||endpoint.hash||endpoint.pathname!=='/api/bazaar/seller/tick'||!/^ai-video-scriptwriter(?:-[a-z0-9]+)?(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/.test(endpoint.hostname)||!preview&&endpoint.hostname!=='ai-video-scriptwriter.vercel.app'||protection&&(!preview||protection.length>1024||/[\r\n]/.test(protection)))throw Error();
  return {serviceId,cardHash,ownerFingerprint,url:endpoint.href,token,...(protection?{protection}:{})};
 }catch{throw new WorkspaceError('TEXT_SELLER_CONFIGURATION_INCOMPLETE',503);}
}
export function isOnDemandTextService(service:Pick<MarketService,'ownerId'|'cardHash'|'card'>){
 const binding=textSellerConfiguration();if(!binding)return false;
 if(service.card.id!==binding.serviceId)return false;
 if(service.cardHash!==binding.cardHash||sha(service.ownerId)!==binding.ownerFingerprint||service.card.delivery?.result.contentType!=='text/plain')throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);
 return true;
}
export function queueMarketTextWake(state:MarketState,order:MarketOrder,now=Date.now()){
 if(order.executionMode!=='on-demand')return;
 if(!order.paymentVerifiedAt||!order.transactionHash||order.phase!=='paid')throw new WorkspaceError('PAYMENT_REQUIRED',409);
 if(order.textWake)return;
 const at=new Date(now).toISOString();order.textWake={version:1,wakeId:randomUUID(),status:'pending',createdAt:at,updatedAt:at,attempts:0};
}
type RuntimeDependencies={store:()=>MarketStore;fetch:typeof fetch;now:()=>number;reserve:typeof reserveContinuousFreeBackground;binding:()=>Binding|undefined};
export const COMPACT_TEXT_REDIS_WIRE_PROFILE='bazaar-text-redis-wire/v1';
export const COMPACT_TEXT_PROVIDER_WIRE_MAX_BYTES=16*1048576;
export const COMPACT_TEXT_PROVIDER_READINESS_WIRE_MAX_BYTES=8*1048576;
export const V2_TEXT_REDIS_WIRE_PROFILE='bazaar-text-redis-wire/v2';
export const V2_TEXT_PROVIDER_WIRE_MAX_BYTES=3*1048576;
export const V2_TEXT_PROVIDER_READINESS_WIRE_MAX_BYTES=1048576;
export const COMPACT_TEXT_BACKGROUND_RESERVATION=Object.freeze({commands:1256,transferBytes:COMPACT_TEXT_PROVIDER_WIRE_MAX_BYTES+CONTINUOUS_CONTROL_BUDGET.compactNativeText.wireBytes});
export const COMPACT_TEXT_READINESS_BACKGROUND_RESERVATION=Object.freeze({commands:1256,transferBytes:COMPACT_TEXT_PROVIDER_READINESS_WIRE_MAX_BYTES+CONTINUOUS_CONTROL_BUDGET.compactNativeReadiness.wireBytes});
function compactTextTransport(){return process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&isCompactWorkspaceTransport();}
export function compactTextProviderProfile(legacy=false){return process.env.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE==='compact-registry-v2'&&!legacy?{profile:V2_TEXT_REDIS_WIRE_PROFILE,delivery:V2_TEXT_PROVIDER_WIRE_MAX_BYTES,readiness:V2_TEXT_PROVIDER_READINESS_WIRE_MAX_BYTES}:{profile:COMPACT_TEXT_REDIS_WIRE_PROFILE,delivery:COMPACT_TEXT_PROVIDER_WIRE_MAX_BYTES,readiness:COMPACT_TEXT_PROVIDER_READINESS_WIRE_MAX_BYTES};}
export function compactTextBackgroundReservation(readiness=false,legacy=false,operationId?:string){const provider=compactTextProviderProfile(legacy),native=continuousTextNativeBudgetLimits(legacy,operationId);return {commands:1000+(readiness?native.readiness.commands:native.delivery.commands),transferBytes:(readiness?provider.readiness:provider.delivery)+(readiness?native.readiness.wireBytes:native.delivery.wireBytes)};}
async function nativeTextScope<T>(compact:boolean,handler:()=>Promise<T>,readiness=false,legacy=false):Promise<T>{
 if(!compact)return handler();
 const result=await (readiness?withContinuousTextReadinessBudget(handler,{legacy}):withContinuousTextNativeBudget(handler,{legacy}));if(result instanceof Response)throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);return result;
}
/** A bounded client with no redirects: bearer credentials cannot migrate to an
 * endpoint selected by a provider response. Nothing sensitive is logged. */
async function invoke(deps:RuntimeDependencies,binding:Binding,body:{mode:'readiness'}|{mode:'deliver';operationId:string;wakeId:string},compact=false,legacy=false){
 const profile=compactTextProviderProfile(legacy);
 const encoded=JSON.stringify({...body,...(compact?{budgetProfile:profile.profile}:{})});if(Buffer.byteLength(encoded)>256)throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);
 const response=await deps.fetch(binding.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'Authorization':`Bearer ${binding.token}`,'Content-Type':'application/json',...(binding.protection?{'x-vercel-protection-bypass':binding.protection}:{})},body:encoded});
 const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(response.status!==200||!result||typeof result!=='object'||result.paymentSubmissions!==0)throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);
 const providerLimit=body.mode==='readiness'?profile.readiness:profile.delivery;
 if(compact&&(result.redisWireProfile!==profile.profile||result.redisWireLimitBytes!==providerLimit||!Number.isSafeInteger(result.redisCommandsUpperBound)||result.redisCommandsUpperBound<0||result.redisCommandsUpperBound>1000||!Number.isSafeInteger(result.redisWireAllocatedBytes)||result.redisWireAllocatedBytes<0||result.redisWireAllocatedBytes>providerLimit))throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);
 return result as Record<string,unknown>;
}
function boundOrder(order:MarketOrder,binding:Binding){if(order.executionMode!=='on-demand'||order.serviceId!==binding.serviceId||order.cardHash!==binding.cardHash||sha(order.sellerOwnerId)!==binding.ownerFingerprint)throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);}
/** V2 funds an already initialized native index. Missing metadata must be
 * repaired by bounded maintenance before a new callback can start. Original
 * recovery retains the legacy bootstrap path and its original allowances. */
async function requireInitializedTextIndex(store:MarketStore,legacy:boolean){
 if(legacy||process.env.BAZAAR_FREE_PLAN_TRANSPORT_PROFILE!=='compact-registry-v2')return;
 if(!store.maintenanceIndex)throw new WorkspaceError('TEXT_SELLER_MAINTENANCE_REQUIRED',503,60);
 const index=await store.maintenanceIndex();if(!index.initialized||!index.index)throw new WorkspaceError('TEXT_SELLER_MAINTENANCE_REQUIRED',503,60);
}
export function createMarketTextSellerRuntime(overrides:Partial<RuntimeDependencies>={}){
 const deps:RuntimeDependencies={store:configuredMarketStore,fetch:globalThis.fetch,now:Date.now,reserve:reserveContinuousFreeBackground,binding:textSellerConfiguration,...overrides};
 return {
  async readiness(service:Pick<MarketService,'ownerId'|'cardHash'|'card'>,order?:MarketOrder,force=false){
   const storage=order&&order.operationId!=='31c97193-be74-4b9d-b0a3-f3890b0a41e8'?await import('./market-order-storage.ts'):undefined;
   const guarded=Boolean(order&&storage?.marketPerOrderStorageEnabled(order.operationId)&&storage.perOrderOperationId(order.operationId));
   const assertCapability=()=>{if(guarded)storage!.assertMarketOrderFinancialStorage(order!.operationId);};assertCapability();
   const compact=compactTextTransport(),legacy=order?.operationId==='31c97193-be74-4b9d-b0a3-f3890b0a41e8';return nativeTextScope(compact,async()=>{
   const binding=deps.binding();if(!binding||service.card.id!==binding.serviceId)return false;
   if(service.cardHash!==binding.cardHash||sha(service.ownerId)!==binding.ownerFingerprint)throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);
   const store=deps.store();
   await requireInitializedTextIndex(store,legacy);
   if(!force){const available=await store.transact(s=>sellerCapacityDto(s,binding.serviceId,binding.cardHash,deps.now()));if(available.ready)return true;if(available.reason==='SELLER_CAPACITY_EXHAUSTED')throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503,60);}
   if(order)boundOrder(order,binding);
   if(order?.operationId===FINITE_PILOT_ID&&finitePilotProfile())throw new WorkspaceError('FINITE_PILOT_READINESS_REVALIDATION_REQUIRED',503);
   assertCapability();await deps.reserve({...compact?compactTextBackgroundReservation(true,legacy):{commands:1000,transferBytes:100_000_000},reason:'readiness',...(order?{operationId:order.operationId,principalHash:sha(order.buyerOwnerId)}:{})});assertCapability();
   try{const result=await invoke(deps,binding,{mode:'readiness'},compact,legacy);if(result.reason!=='ready'||result.reportedCapacityReady!==true||result.providerRequests!==0||result.executed!==0)throw Error();}catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);}
   // The response cannot stand in for the owning agent's authenticated lease.
   const available=await store.transact(s=>sellerCapacityDto(s,binding.serviceId,binding.cardHash,deps.now()));
   // Existing reservations occupy their own seat; payment's native guard checks
   // quota excluding that operation immediately after this health proof.
   if(!order&&!available.ready)throw new WorkspaceError(available.reason??'SELLER_UNAVAILABLE',503,60);
   return true;
   },true,legacy);
  },
  async dispatch(operationId:string){
   const compact=compactTextTransport(),legacy=operationId==='31c97193-be74-4b9d-b0a3-f3890b0a41e8';return nativeTextScope(compact,async()=>{
   const binding=deps.binding();if(!binding)throw new WorkspaceError('TEXT_SELLER_CONFIGURATION_INCOMPLETE',503);
   const store=deps.store();await requireInitializedTextIndex(store,legacy);const snapshot=await store.transact(s=>s.orders.find(o=>o.operationId===operationId));
   if(!snapshot)throw new WorkspaceError('NOT_FOUND',404);boundOrder(snapshot,binding);
   if(!snapshot.textWake||['delivered','delivery-failed','execution-uncertain'].includes(snapshot.phase)||Date.parse(marketContentExpiresAt(snapshot))<=deps.now())return {dispatched:false,reason:'terminal-or-expired'};
   if(!['paid','executing'].includes(snapshot.phase)||!snapshot.paymentVerifiedAt)throw new WorkspaceError('PAYMENT_REQUIRED',409);
   const wake=snapshot.textWake,now=deps.now();
   if(wake.status==='completed'||wake.status==='needs-operator'||wake.retryAt&&Date.parse(wake.retryAt)>now||wake.status==='dispatching'&&Date.parse(wake.leaseExpiresAt??'')>now)return {dispatched:false,reason:'leased-or-delayed'};
   if(wake.attempts>=1000)throw new WorkspaceError('TEXT_SELLER_WAKE_LIMIT',503);
   await deps.reserve({...compact?compactTextBackgroundReservation(false,legacy):{commands:1000,transferBytes:100_000_000},reason:'wake',operationId,principalHash:sha(snapshot.buyerOwnerId)});
   const dispatchAttemptId=randomUUID();
   // A lost CAS acknowledgement exits before HTTP, and the durable lease is
   // later recoverable. No callback performs external work.
   const claimed=await store.transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o||o.textWake?.wakeId!==wake.wakeId||o.textWake.updatedAt!==wake.updatedAt||o.textWake.status!==wake.status||o.textWake.dispatchAttemptId!==wake.dispatchAttemptId||!['paid','executing'].includes(o.phase))throw new WorkspaceError('WAKE_CONFLICT',409);boundOrder(o,binding);const at=new Date(now).toISOString();Object.assign(o.textWake,{status:'dispatching',dispatchAttemptId,leaseExpiresAt:new Date(now+60000).toISOString(),updatedAt:at,attempts:o.textWake.attempts+1});delete o.textWake.retryAt;return o;});
   let acknowledged=false;try{await invoke(deps,binding,{mode:'deliver',operationId,wakeId:claimed.textWake!.wakeId},compact,legacy);acknowledged=true;}catch{}
   const current=await store.transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o)return undefined;if(o.textWake?.dispatchAttemptId!==dispatchAttemptId)return o;if(['delivered','delivery-failed'].includes(o.phase))o.textWake.status='completed';else if(o.phase==='execution-uncertain')o.textWake.status='needs-operator';else{o.textWake.status='unconfirmed';o.textWake.retryAt=new Date(deps.now()+60000).toISOString();}o.textWake.updatedAt=new Date(deps.now()).toISOString();delete o.textWake.leaseExpiresAt;return o;});
   return {dispatched:true,acknowledged,delivered:current?.phase==='delivered',needsOperator:current?.phase==='execution-uncertain'};
   },false,legacy);
  },
 };
}
let injected:ReturnType<typeof createMarketTextSellerRuntime>|undefined;
/** Internal dependency injection only, with no HTTP/MCP selector. */
export function setMarketTextSellerRuntimeForTests(runtime:ReturnType<typeof createMarketTextSellerRuntime>|undefined){injected=runtime;}
export async function ensureMarketTextReadiness(service:Pick<MarketService,'ownerId'|'cardHash'|'card'>,order?:MarketOrder,force=false){return (injected??createMarketTextSellerRuntime()).readiness(service,order,force);}
export async function dispatchMarketTextWake(operationId:string){
 const storage=await import('./market-order-storage.ts');
 if(storage.marketPerOrderStorageEnabled(operationId)&&storage.perOrderOperationId(operationId))return (await import('./per-order-text-runtime.ts')).dispatchPerOrderMarketTextWake(operationId);
 return (injected??createMarketTextSellerRuntime()).dispatch(operationId);
}
