import {deliveryStorage} from './delivery-contract.ts';
import {configuredPrivateS3,type PrivateObjectStorage} from './deliverable-s3.ts';
import {DeliverableError} from './deliverable-store.ts';
import {configuredMarketStore,type MarketOrder,type MarketState} from './marketplace-store.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {authenticateWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders} from './workspace-http.ts';
import {assertMarketDto} from './market-pagination.ts';
import {demoConfiguration} from './demo-configuration.ts';
import {sha} from './marketplace-identity.ts';
import {MARKET_FILE_LIMIT,MARKET_ACCOUNT_FILE_LIMIT,MARKET_GLOBAL_FILE_LIMIT,MARKET_FILE_METADATA_BYTES,marketContentExpiresAt,marketFilesManifestHash,prepareMarketFilesSchema,confirmMarketFileSchema,type MarketFileDelivery} from './market-file-delivery-schema.ts';
export {prepareMarketFilesSchema,confirmMarketFileSchema} from './market-file-delivery-schema.ts';

export function marketFilePrefix(){
 const prefix=process.env.BAZAAR_MARKET_FILE_PREFIX;
 if(!/^market-deliveries\/v1\/(preview|production|local)\/[a-f0-9]{32}$/.test(prefix??''))throw new WorkspaceError('FILE_NAMESPACE_REQUIRED',503);
 const stage=process.env.VERCEL_ENV==='production'?'production':process.env.VERCEL_ENV==='preview'?'preview':'local';
 if(!prefix!.startsWith(`market-deliveries/v1/${stage}/`))throw new WorkspaceError('FILE_NAMESPACE_REQUIRED',503);
 return prefix!;
}
export function configuredMarketFileStorage(prefix=marketFilePrefix()){
 const stage=process.env.VERCEL_ENV==='production'?'production':process.env.VERCEL_ENV==='preview'?'preview':'local';
 if(!new RegExp('^market-deliveries/v1/'+stage+'/[a-f0-9]{32}$').test(prefix))throw new WorkspaceError('FILE_NAMESPACE_REQUIRED',503);
 return configuredPrivateS3({keyPrefix:prefix});
}
export function marketFileCapabilities(){
 let configured=false;
 try{marketFilePrefix();configured=demoConfiguration().r2Configured;}catch{}
 const lifecycle=!process.env.VERCEL||process.env.BAZAAR_MARKET_FILE_LIFECYCLE_ACK==='true';
 const runtime=demoConfiguration(),enabled=process.env.BAZAAR_MARKET_FILES_ENABLED==='true'&&configured&&lifecycle&&(!process.env.VERCEL||runtime.features.privateFiles.enabled);
 return {enabled,recoveryConfigured:runtime.r2Configured,externalReferences:true,reason:enabled?null:process.env.VERCEL?runtime.features.privateFiles.reason:process.env.BAZAAR_MARKET_FILES_ENABLED!=='true'?'FILE_STORAGE_DISABLED':!lifecycle?'FILE_LIFECYCLE_BACKSTOP_REQUIRED':'FILE_STORAGE_NOT_CONFIGURED',limits:{fileBytes:MARKET_FILE_LIMIT,accountBytes:MARKET_ACCOUNT_FILE_LIMIT,globalBytes:MARKET_GLOBAL_FILE_LIMIT,maxFiles:10},retentionDays:7};
}
function assertStorage(admission=false){const caps=marketFileCapabilities();if(admission?!caps.enabled:!caps.recoveryConfigured)throw new WorkspaceError(admission?caps.reason!:'FILE_STORAGE_NOT_CONFIGURED',503);}
/** Called inside the same pure MarketStore transaction that admits an order. */
export function reserveMarketFilesInState(order:MarketOrder,state:MarketState){
 const storage=deliveryStorage(order.card.delivery);if(storage.mode!=='bazaar')return;
 assertStorage(true);
 if(order.fileReservation)throw new WorkspaceError('FILE_RESERVATION_CONFLICT',409);
 // Expired objects continue consuming capacity until deletion has been confirmed.
 const reserved=state.orders.filter(o=>o.operationId!==order.operationId&&o.fileReservation&&!o.fileReservation.released);
 const account=reserved.filter(o=>o.buyerOwnerId===order.buyerOwnerId).reduce((n,o)=>n+o.fileReservation!.maxBytes,0);
 const global=reserved.reduce((n,o)=>n+o.fileReservation!.maxBytes,0);
 const queued=state.fileCleanup??[];
 if(account+queued.filter(c=>c.buyerOwnerId===order.buyerOwnerId).reduce((n,c)=>n+c.maxBytes,0)+storage.maxTotalBytes>MARKET_ACCOUNT_FILE_LIMIT)throw new WorkspaceError('ACCOUNT_FILE_CAPACITY',503);
 if(global+queued.reduce((n,c)=>n+c.maxBytes,0)+storage.maxTotalBytes>MARKET_GLOBAL_FILE_LIMIT)throw new WorkspaceError('GLOBAL_FILE_CAPACITY',503);
 order.fileReservation={maxBytes:storage.maxTotalBytes,expiresAt:marketContentExpiresAt(order),objectPrefix:marketFilePrefix()};
}
export function marketFileStorageVersion(order:MarketOrder){if(!order.fileDelivery)throw new WorkspaceError('FILE_DELIVERY_NOT_FOUND',404);return order.operationId+':'+order.fileDelivery.versionId;}
export function marketFileCleanupKeys(order:MarketOrder,storage?:PrivateObjectStorage){
 if(order.fileDelivery?.mode!=='bazaar')return [];
 if(storage?.cleanupKey)return order.fileDelivery.files.map(file=>storage.cleanupKey!(order.buyerOwnerId,marketFileStorageVersion(order),file.id));
 const prefix=order.fileReservation?.objectPrefix??marketFilePrefix();
 return order.fileDelivery.files.map(file=>prefix+'/'+[order.buyerOwnerId,marketFileStorageVersion(order),file.id].map(sha).join('/'));
}
function unexpired(order:MarketOrder){if(Date.parse(marketContentExpiresAt(order))<=Date.now())throw new WorkspaceError('DELIVERY_EXPIRED',410);}
function seller(order:MarketOrder,principal:WorkspacePrincipal,attemptId:string){
 if(principal.role!=='agent'||order.sellerOwnerId!==principal.ownerId)throw new WorkspaceError('NOT_FOUND',404);
 if(!order.paymentVerifiedAt||!order.transactionHash)throw new WorkspaceError('PAYMENT_REQUIRED',409);
 if(order.attemptId!==attemptId||order.agentId!==principal.agentId)throw new WorkspaceError('CLAIM_CONFLICT',409);
 if(!['executing','execution-uncertain','delivered'].includes(order.phase))throw new WorkspaceError('INVALID_TRANSITION',409);
 unexpired(order);
}
function buyer(order:MarketOrder,principal:WorkspacePrincipal){if(!['human','agent'].includes(principal.role)||order.buyerOwnerId!==principal.ownerId)throw new WorkspaceError('NOT_FOUND',404);unexpired(order);}
function ownedContentOrder(state:MarketState,operationId:string,principal:WorkspacePrincipal){
 const order=state.orders.find(o=>o.operationId===operationId);
 if(!order){
  if(['human','agent'].includes(principal.role)&&state.archived?.some(o=>o.operationId===operationId&&o.buyerOwnerId===principal.ownerId))throw new WorkspaceError('DELIVERY_EXPIRED',410);
  throw new WorkspaceError('NOT_FOUND',404);
 }
 buyer(order,principal);return order;
}
export function assertMarketFileDeliveryComplete(order:MarketOrder){
 const storage=deliveryStorage(order.card.delivery);if(storage.mode==='text')return;
 unexpired(order);
 if(!order.fileDelivery||order.fileDelivery.files.some(f=>f.status!=='available'))throw new WorkspaceError('FILES_PENDING',409);
}
export function assertMarketFileDeliveryReady(order:MarketOrder,manifestHash?:string){assertMarketFileDeliveryComplete(order);if(manifestHash!==undefined&&order.fileDelivery?.manifestHash!==manifestHash)throw new WorkspaceError('FILE_MANIFEST_CONFLICT',409);}
/** Only expired synthetic/environment-scoped objects belonging to this order. */
export async function removeExpiredMarketFiles(order:MarketOrder,storage?:PrivateObjectStorage){
 if(Date.parse(marketContentExpiresAt(order))>Date.now())throw new WorkspaceError('DELIVERY_NOT_EXPIRED',409);
 if(order.fileDelivery?.mode==='bazaar'){const objects=storage??configuredMarketFileStorage(order.fileReservation?.objectPrefix);for(const file of order.fileDelivery.files)await objects.remove(order.buyerOwnerId,marketFileStorageVersion(order),file);}
}
function failure(error:unknown){return workspaceFailure(error instanceof DeliverableError?new WorkspaceError(error.code,error.status):error);}
const output=(body:unknown,status=200)=>Response.json(assertMarketDto(body),{status,headers:workspaceHeaders});
type Dependencies={store?:typeof configuredMarketStore;objects?:typeof configuredMarketFileStorage;auth?:typeof authenticateWorkspaceRequest;guard?:(p:WorkspacePrincipal)=>Promise<{keys:string[];values:(string|null)[]}|undefined>};
/** Test dependencies are supplied only by local callers; no route accepts them. */
export function createMarketFileHandlers(deps:Dependencies={}){
 const store=deps.store??configuredMarketStore,objects=deps.objects??configuredMarketFileStorage,auth=deps.auth??authenticateWorkspaceRequest;
 const objectsFor=(order:MarketOrder)=>objects(order.fileReservation?.objectPrefix);
 const guard=deps.guard??(async(p:WorkspacePrincipal)=>(await configuredWorkspaceStore().walletIdentity(p)).guard);
 async function enabled(request:Request,role?:'agent'){
  if(process.env.BAZAAR_ENABLE_MARKETPLACE!=='true')throw new WorkspaceError('MARKET_DISABLED',503);
  const principal=await auth(request,role);if(new URL(request.url).search)throw new WorkspaceError('INVALID_REQUEST',400);return principal;
 }
 return {
  async prepare(request:Request,operationId:string){try{
   const p=await enabled(request,'agent'),input=await parseWorkspaceBody(request,prepareMarketFilesSchema,MARKET_FILE_METADATA_BYTES),snapshot=await guard(p);
   const order=await store().transact(state=>{
    const o=state.orders.find(o=>o.operationId===operationId);if(!o)throw new WorkspaceError('NOT_FOUND',404);seller(o,p,input.attemptId);
    const storage=deliveryStorage(o.card.delivery);if(storage.mode==='text')throw new WorkspaceError('SERVICE_FILES_DISABLED',409);
    if(input.files.length>storage.maxFiles||new Set(input.files.map(f=>f.id)).size!==input.files.length)throw new WorkspaceError('INVALID_FILE_MANIFEST',400);
    if(storage.mode==='bazaar'){
     assertStorage();
     if(!o.fileReservation||o.fileReservation.released||input.files.some(f=>f.url||f.size>storage.maxFileBytes)||input.files.reduce((n,f)=>n+f.size,0)>o.fileReservation.maxBytes)throw new WorkspaceError('INVALID_FILE_MANIFEST',400);
    }else if(input.files.some(f=>!f.url||new URL(f.url).origin!==new URL(o.card.url).origin))throw new WorkspaceError('INVALID_EXTERNAL_FILE',400);
    const manifestHash=marketFilesManifestHash({mode:storage.mode,...input});
    if(o.fileDelivery){if(o.fileDelivery.manifestHash!==manifestHash)throw new WorkspaceError('FILE_MANIFEST_CONFLICT',409);return o;}
    const delivery:MarketFileDelivery={mode:storage.mode,versionId:input.versionId,attemptId:input.attemptId,manifestHash,createdAt:new Date().toISOString(),expiresAt:marketContentExpiresAt(o),files:input.files.map(f=>({...f,status:storage.mode==='bazaar'?'pending':'available'}))};
    // Keep room for every two-byte pending -> available transition.
    if(Buffer.byteLength(JSON.stringify(delivery),'utf8')+input.files.length*2>MARKET_FILE_METADATA_BYTES)throw new WorkspaceError('FILE_METADATA_TOO_LARGE',413);
    o.fileDelivery=delivery;return o;
   },snapshot);
   const uploads=[];
   if(order.fileDelivery!.mode==='bazaar'){
    const storage=objectsFor(order);
    for(const file of order.fileDelivery!.files.filter(f=>f.status==='pending'))uploads.push({fileId:file.id,...await storage.upload(order.buyerOwnerId,marketFileStorageVersion(order),file,Date.parse(order.fileDelivery!.expiresAt))});
   }
   await store().transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o)throw new WorkspaceError('NOT_FOUND',404);seller(o,p,input.attemptId);if(o.fileDelivery?.manifestHash!==order.fileDelivery!.manifestHash)throw new WorkspaceError('FILE_MANIFEST_CONFLICT',409);},snapshot);
   return output({delivery:order.fileDelivery,uploads,integrity:order.fileDelivery!.mode==='external'?'provider-declared':'pending-verification'});
  }catch(e){return failure(e);}},
  async confirm(request:Request,operationId:string){try{
   const p=await enabled(request,'agent'),input=await parseWorkspaceBody(request,confirmMarketFileSchema,1024),snapshot=await guard(p);
   const order=await store().transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o)throw new WorkspaceError('NOT_FOUND',404);seller(o,p,input.attemptId);if(o.fileDelivery?.versionId!==input.versionId)throw new WorkspaceError('FILE_DELIVERY_NOT_FOUND',404);return o;},snapshot);
   const file=order.fileDelivery!.files.find(f=>f.id===input.fileId);if(!file)throw new WorkspaceError('FILE_NOT_FOUND',404);
   if(order.fileDelivery!.mode==='bazaar'){assertStorage();await objectsFor(order).verify(order.buyerOwnerId,marketFileStorageVersion(order),file);}
   const delivery=await store().transact(s=>{const o=s.orders.find(o=>o.operationId===operationId);if(!o)throw new WorkspaceError('NOT_FOUND',404);seller(o,p,input.attemptId);if(o.fileDelivery?.manifestHash!==order.fileDelivery!.manifestHash)throw new WorkspaceError('FILE_MANIFEST_CONFLICT',409);const saved=o.fileDelivery.files.find(f=>f.id===input.fileId)!;saved.status='available';return o.fileDelivery;},snapshot);
   return output({delivery,integrity:delivery.mode==='bazaar'?'stored-bytes-verified':'provider-declared'});
  }catch(e){return failure(e);}},
  async read(request:Request,operationId:string){try{
   const p=await enabled(request),snapshot=await guard(p);
   const order=await store().transact(s=>{const o=ownedContentOrder(s,operationId,p);if(!o.fileDelivery)throw new WorkspaceError('FILE_DELIVERY_NOT_FOUND',404);return o;},snapshot);
   const delivery=order.fileDelivery!,files=[];
   if(delivery.mode==='bazaar')assertStorage();
   for(const file of delivery.files){const access=file.status==='available'?(delivery.mode==='external'?{url:file.url,expiresAt:delivery.expiresAt}:await objectsFor(order).access(order.buyerOwnerId,marketFileStorageVersion(order),file,false,Date.parse(delivery.expiresAt))):{};files.push({...file,...access,integrity:delivery.mode==='external'?'provider-declared':file.status==='available'?'stored-bytes-verified':'pending-verification'});}
   await store().transact(s=>{const o=ownedContentOrder(s,operationId,p);if(o.fileDelivery?.manifestHash!==delivery.manifestHash)throw new WorkspaceError('FILE_MANIFEST_CONFLICT',409);},snapshot);
   return output({delivery:{...delivery,files},payment:'verified-separately'});
  }catch(e){return failure(e);}},
 };
}
export const marketFileHandlers=createMarketFileHandlers();
