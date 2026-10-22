import {randomUUID} from 'node:crypto';
import {configuredMarketStore,type MarketOrder,type MarketService,type MarketState,type MarketStore} from './marketplace-store.ts';
import {sha} from './marketplace-identity.ts';
import {sellerCapacityDto} from './market-seller-capacity.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {WorkspaceError} from './workspace-types.ts';
import {reserveContinuousFreeBackground,createContinuousExampleBudgetProof,continuousExampleBudgetBackgroundReservation} from './continuous-free-budget.ts';
import {withExampleBudgetWireScope,activateExampleBudgetWireProof} from './example-budget-wire.ts';
import {assertExampleProviderReadinessProof,assertExactExampleProviderIoLimits} from './example-provider-readiness-proof.ts';

type Environment=Readonly<Record<string,string|undefined>>;
type Binding={serviceId:string;cardHash:string;ownerFingerprint:string;url:string;token:string;protection?:string};
const services=new Set(['guionista-bazaar-production-text-v1','guionista-bazaar-pilot-text-funded-v1']);
const exampleService='bazaar-recovery-example-text-v1';
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
/** A second reviewed binding is independent of Guion's private configuration.
 * Its card, owner and fixed endpoint are operator-selected, never MCP input. */
export function exampleTextSellerConfiguration(environment:Environment=process.env):Binding|undefined{
 const raw=environment.BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON;if(raw===undefined)return undefined;
 try{
  if(environment.BAZAAR_FREE_DEMO_MODE!=='continuous'||Buffer.byteLength(raw)>4096)throw Error();
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
  const fields=value as Record<string,unknown>,required=['serviceId','cardHash','ownerFingerprint','url','token'];
  if(!required.every(key=>Object.hasOwn(fields,key))||Object.keys(fields).some(key=>![...required,'protection'].includes(key))||Object.values(fields).some(value=>typeof value!=='string'))throw Error();
  const {serviceId,cardHash,ownerFingerprint,url,token,protection}=fields as Binding;
  const endpoint=new URL(url),preview=environment.VERCEL_ENV==='preview';
  if(serviceId!==exampleService||!/^[a-f0-9]{64}$/.test(cardHash)||!/^[a-f0-9]{64}$/.test(ownerFingerprint)||!/^[a-zA-Z0-9_-]{43}$/.test(token)||endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.port||endpoint.search||endpoint.hash||endpoint.pathname!=='/api/bazaar/example/tick'||!/^ai-video-scriptwriter(?:-[a-z0-9-]+)?(?:-cabscryptocontacto-6028s-projects)?\.vercel\.app$/.test(endpoint.hostname)||!preview&&!['ai-video-scriptwriter.vercel.app','ai-video-scriptwriter-example.vercel.app'].includes(endpoint.hostname)||protection!==undefined&&(!preview||!protection||protection.length>1024||/[\r\n]/.test(protection)))throw Error();
  return {serviceId,cardHash,ownerFingerprint,url:endpoint.href,token,...(protection?{protection}:{})};
 }catch{throw new WorkspaceError('TEXT_SELLER_CONFIGURATION_INCOMPLETE',503);}
}
export function textSellerConfigurationForService(serviceId:string,environment:Environment=process.env):Binding|undefined{
 const legacy=textSellerConfiguration(environment),example=exampleTextSellerConfiguration(environment);
 return legacy?.serviceId===serviceId?legacy:example?.serviceId===serviceId?example:undefined;
}
export function isOnDemandTextService(service:Pick<MarketService,'ownerId'|'cardHash'|'card'>){
 const binding=textSellerConfigurationForService(service.card.id);if(!binding)return false;
 if(service.cardHash!==binding.cardHash||sha(service.ownerId)!==binding.ownerFingerprint||service.card.delivery?.result.contentType!=='text/plain')throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);
 return true;
}
export function queueMarketTextWake(state:MarketState,order:MarketOrder,now=Date.now()){
 if(order.executionMode!=='on-demand')return;
 if(!order.paymentVerifiedAt||!order.transactionHash||order.phase!=='paid')throw new WorkspaceError('PAYMENT_REQUIRED',409);
 if(order.textWake)return;
 const at=new Date(now).toISOString();order.textWake={version:1,wakeId:randomUUID(),status:'pending',createdAt:at,updatedAt:at,attempts:0};
}
type RuntimeDependencies={store:()=>MarketStore;fetch:typeof fetch;now:()=>number;reserve:typeof reserveContinuousFreeBackground;binding:()=>Binding|undefined;bindingForService:(serviceId:string)=>Binding|undefined};
/** A bounded client with no redirects: bearer credentials cannot migrate to an
 * endpoint selected by a provider response. Nothing sensitive is logged. */
async function invoke(deps:RuntimeDependencies,binding:Binding,body:{mode:'readiness'}|{mode:'deliver';operationId:string;wakeId:string}){
 const encoded=JSON.stringify(body);if(Buffer.byteLength(encoded)>256)throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);
 const response=await deps.fetch(binding.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'Authorization':`Bearer ${binding.token}`,'Content-Type':'application/json',...(binding.protection?{'x-vercel-protection-bypass':binding.protection}:{})},body:encoded});
 const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(response.status!==200||!result||typeof result!=='object'||result.paymentSubmissions!==0)throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);
 return result as Record<string,unknown>;
}
function boundOrder(order:MarketOrder,binding:Binding){if(order.executionMode!=='on-demand'||order.serviceId!==binding.serviceId||order.card.id!==binding.serviceId||order.cardHash!==binding.cardHash||sha(order.sellerOwnerId)!==binding.ownerFingerprint||order.card.delivery?.result.contentType!=='text/plain')throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);}
export function createMarketTextSellerRuntime(overrides:Partial<RuntimeDependencies>={}){
 // Preserve the legacy internal test override while resolving real work from
 // the immutable service ID. No caller can supply a URL or token for a wake.
 const bindingForService=overrides.bindingForService??(overrides.binding?serviceId=>{const binding=overrides.binding!();return binding?.serviceId===serviceId?binding:undefined;}:textSellerConfigurationForService);
 const deps:RuntimeDependencies={store:configuredMarketStore,fetch:globalThis.fetch,now:Date.now,reserve:reserveContinuousFreeBackground,binding:textSellerConfiguration,...overrides,bindingForService};
 return {
  async readiness(service:Pick<MarketService,'ownerId'|'cardHash'|'card'>,order?:MarketOrder,force=false){
   return withExampleBudgetWireScope(async()=>{
   const binding=deps.bindingForService(service.card.id);if(!binding)return false;
   if(service.card.id!==binding.serviceId||service.cardHash!==binding.cardHash||sha(service.ownerId)!==binding.ownerFingerprint||service.card.delivery?.result.contentType!=='text/plain')throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);
   if(order)boundOrder(order,binding);
   const exampleProof=order?createContinuousExampleBudgetProof(order,sha(order.buyerOwnerId)):undefined;
   activateExampleBudgetWireProof(exampleProof,order?{profile:'background',reason:'readiness',operationId:order.operationId,principalHash:sha(order.buyerOwnerId)}:undefined);
   const store=deps.store();
   if(!force){const available=await store.transact(s=>sellerCapacityDto(s,binding.serviceId,binding.cardHash,deps.now()));if(available.ready)return true;if(available.reason==='SELLER_CAPACITY_EXHAUSTED')throw new WorkspaceError('SELLER_CAPACITY_EXHAUSTED',503,60);}
   if(exampleProof&&force)await store.transact(s=>{const current=s.orders.find(o=>o.operationId===order!.operationId);if(!current||current.budgetProfile?.bindingHash!==order!.budgetProfile?.bindingHash||current.paymentVerifiedAt||current.transactionHash||(current.exampleReadinessAttempts??0)>=2)throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);current.exampleReadinessAttempts=(current.exampleReadinessAttempts??0)+1;});
   const readinessCost=exampleProof?continuousExampleBudgetBackgroundReservation(exampleProof,'readiness'):{commands:1000,transferBytes:100_000_000};
   await deps.reserve({...readinessCost,reason:'readiness',...(order?{operationId:order.operationId,principalHash:sha(order.buyerOwnerId)}:{}),...(exampleProof?{exampleBudgetProof:exampleProof}:{})});
   try{const result=await invoke(deps,binding,{mode:'readiness'});if(result.reason!=='ready'||result.reportedCapacityReady!==true||result.providerRequests!==0||result.executed!==0)throw Error();if(exampleProof)assertExampleProviderReadinessProof(result);}catch(error){if(error instanceof WorkspaceError)throw error;throw new WorkspaceError('TEXT_SELLER_UNAVAILABLE',503,60);}
   // The response cannot stand in for the owning agent's authenticated lease.
   const available=await store.transact(s=>sellerCapacityDto(s,binding.serviceId,binding.cardHash,deps.now()));
   // Existing reservations occupy their own seat; payment's native guard checks
   // quota excluding that operation immediately after this health proof.
   if(!order&&!available.ready)throw new WorkspaceError(available.reason??'SELLER_UNAVAILABLE',503,60);
   return true;
   },{fresh:true});
  },
  async dispatch(operationId:string){
   return withExampleBudgetWireScope(async()=>{
   const store=deps.store(),snapshot=await store.transact(s=>s.orders.find(o=>o.operationId===operationId));
   if(!snapshot)throw new WorkspaceError('NOT_FOUND',404);
   const exampleProof=createContinuousExampleBudgetProof(snapshot,sha(snapshot.buyerOwnerId));
   activateExampleBudgetWireProof(exampleProof,{profile:'background',reason:'wake',operationId,principalHash:sha(snapshot.buyerOwnerId)});
   const binding=deps.bindingForService(snapshot.serviceId);if(!binding)throw new WorkspaceError('TEXT_SELLER_CONFIGURATION_INCOMPLETE',503);boundOrder(snapshot,binding);
   if(!snapshot.textWake||['delivered','delivery-failed','execution-uncertain'].includes(snapshot.phase)||Date.parse(marketContentExpiresAt(snapshot))<=deps.now())return {dispatched:false,reason:'terminal-or-expired'};
   if(!['paid','executing'].includes(snapshot.phase)||!snapshot.paymentVerifiedAt||!snapshot.transactionHash)throw new WorkspaceError('PAYMENT_REQUIRED',409);
   const wake=snapshot.textWake,now=deps.now();
   if(wake.status==='completed'||wake.status==='needs-operator'||wake.retryAt&&Date.parse(wake.retryAt)>now||wake.status==='dispatching'&&Date.parse(wake.leaseExpiresAt??'')>now)return {dispatched:false,reason:'leased-or-delayed'};
   if(wake.attempts>=(exampleProof?3:1000))throw new WorkspaceError('TEXT_SELLER_WAKE_LIMIT',503);
   const wakeCost=exampleProof?continuousExampleBudgetBackgroundReservation(exampleProof,'wake'):{commands:1000,transferBytes:100_000_000};
   const reserveWake=()=>deps.reserve({...wakeCost,reason:'wake',operationId,principalHash:sha(snapshot.buyerOwnerId),...(exampleProof?{exampleBudgetProof:exampleProof}:{})});
   if(!exampleProof)await reserveWake();
   const dispatchAttemptId=randomUUID();
   // A lost CAS acknowledgement exits before HTTP, and the durable lease is
   // later recoverable. No callback performs external work.
   const claimed=await store.transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o||o.textWake?.wakeId!==wake.wakeId||o.textWake.updatedAt!==wake.updatedAt||o.textWake.status!==wake.status||o.textWake.dispatchAttemptId!==wake.dispatchAttemptId||!['paid','executing'].includes(o.phase))throw new WorkspaceError('WAKE_CONFLICT',409);boundOrder(o,binding);const at=new Date(now).toISOString();Object.assign(o.textWake,{status:'dispatching',dispatchAttemptId,leaseExpiresAt:new Date(now+60000).toISOString(),updatedAt:at,attempts:o.textWake.attempts+1});delete o.textWake.retryAt;return o;});
   if(exampleProof)await reserveWake();
   let acknowledged=false;try{const result=await invoke(deps,binding,{mode:'deliver',operationId,wakeId:claimed.textWake!.wakeId});if(exampleProof)assertExactExampleProviderIoLimits((result.providerIo as {limits?:unknown}|undefined)?.limits);acknowledged=true;}catch{}
   const current=await store.transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o)return undefined;if(o.textWake?.dispatchAttemptId!==dispatchAttemptId)return o;if(['delivered','delivery-failed'].includes(o.phase))o.textWake.status='completed';else if(o.phase==='execution-uncertain')o.textWake.status='needs-operator';else{o.textWake.status='unconfirmed';o.textWake.retryAt=new Date(deps.now()+60000).toISOString();}o.textWake.updatedAt=new Date(deps.now()).toISOString();delete o.textWake.leaseExpiresAt;return o;});
   return {dispatched:true,acknowledged,delivered:current?.phase==='delivered',needsOperator:current?.phase==='execution-uncertain'};
   },{fresh:true});
  },
 };
}
let injected:ReturnType<typeof createMarketTextSellerRuntime>|undefined;
/** Internal dependency injection only, with no HTTP/MCP selector. */
export function setMarketTextSellerRuntimeForTests(runtime:ReturnType<typeof createMarketTextSellerRuntime>|undefined){injected=runtime;}
export async function ensureMarketTextReadiness(service:Pick<MarketService,'ownerId'|'cardHash'|'card'>,order?:MarketOrder,force=false){return (injected??createMarketTextSellerRuntime()).readiness(service,order,force);}
export async function dispatchMarketTextWake(operationId:string){return (injected??createMarketTextSellerRuntime()).dispatch(operationId);}
