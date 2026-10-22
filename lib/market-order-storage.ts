import {Redis} from '@upstash/redis';
import {WorkspaceError,type WorkspacePrincipal} from './workspace-types.ts';
import {createMarketOrderRepository,type MarketOrderRepository} from './market-order-repository.ts';
import {configuredMarketStore,marketPrefix,type MarketOrder,type MarketState} from './marketplace-store.ts';
import {marketPage,marketPageSchema,type MarketPageInput} from './market-pagination.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {sha} from './marketplace-identity.ts';
import type {MarketCommitGuard} from './marketplace-capacity.ts';
import {assertPerOrderStorageProfile,continuousPerOrderStorage} from './per-order-storage-profile.ts';
import {meteredRedis} from './acceptance-meter.ts';
import {isPerOrderPaymentEnabled} from './per-order-payment-profile.ts';
import {configuredMultisellerPolicy} from './multiseller-pilot.ts';
import type {MarketOrderAdmission} from './market-order-repository.ts';

/** The unresolved incident is permanently addressed through its existing
 * storage path. This prototype never copies, rekeys or mutates that operation. */
export const LEGACY_ORIGINAL_MARKET_OPERATION='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
export const perOrderOperationId=(operationId:string)=>operationId!==LEGACY_ORIGINAL_MARKET_OPERATION&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId);
type Environment=Readonly<Record<string,string|undefined>>;
export function marketPerOrderStorageEnabled(operationId?:string,environment:Environment=process.env){
 if(operationId===LEGACY_ORIGINAL_MARKET_OPERATION)return false;
 const profile=environment.BAZAAR_MARKET_ORDER_STORAGE;
 if(profile===undefined||profile==='legacy')return false;
 if(profile!=='per-order-v1')throw new WorkspaceError('MARKET_ORDER_STORAGE_CONFIGURATION_INCOMPLETE',503);
 assertPerOrderStorageProfile(environment);
 return true;
}
let injected:MarketOrderRepository|undefined;
export function setMarketOrderRepositoryForTests(repository:MarketOrderRepository|undefined){injected=repository;}
export function configuredMarketOrderRepository():MarketOrderRepository{
 if(!marketPerOrderStorageEnabled())throw new WorkspaceError('PER_ORDER_STORAGE_DISABLED',503);
 if(injected)return injected;
 const profile=assertPerOrderStorageProfile();
 if(profile==='continuous'){
  const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
  try{if(!url||!token||new URL(url).protocol!=='https:')throw Error();}catch{throw new WorkspaceError('MARKET_UNAVAILABLE');}
  return createMarketOrderRepository(meteredRedis(new Redis({url:url!,token:token!,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false})),marketPrefix(),{continuous:true,legacyPrefix:marketPrefix()});
 }
 const prefix=process.env.BAZAAR_MARKET_ORDER_PREFIX;
 if(!/^bazaar-market:isolated-[a-f0-9]{32}$/.test(prefix??''))throw new WorkspaceError('PER_ORDER_ISOLATED_PREFIX_REQUIRED',503);
 const url=process.env.BAZAAR_MARKET_ORDER_REDIS_REST_URL,token=process.env.BAZAAR_MARKET_ORDER_REDIS_REST_TOKEN;
 if(!url||!token||new URL(url).protocol!=='https:')throw new WorkspaceError('MARKET_UNAVAILABLE');
 return createMarketOrderRepository(new Redis({url,token,automaticDeserialization:false,retry:{retries:0},enableAutoPipelining:false}),prefix!,{developmentUnmetered:true,legacyPrefix:marketPrefix()});
}
/** A local storage measurement is never permission to verify, settle, submit
 * or reconcile a payment. Legacy routes retain their exact implementation. */
export function assertMarketOrderFinancialStorage(operationId:string){
 if(marketPerOrderStorageEnabled(operationId)&&!isPerOrderPaymentEnabled(operationId))throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);
}
export function combineMarketOrderGuards(...guards:(MarketCommitGuard|undefined)[]):MarketCommitGuard{
 const entries=new Map<string,string|null>();let expiresAt:number|undefined,continuousOperation:MarketCommitGuard['continuousOperation'];
 for(const guard of guards){if(!guard)continue;
  if(guard.keys.length!==guard.values.length)throw new WorkspaceError('INVALID_COMMIT_GUARD',503);
  if(guard.continuousOperation){if(continuousOperation&&JSON.stringify(continuousOperation)!==JSON.stringify(guard.continuousOperation))throw new WorkspaceError('INVALID_COMMIT_GUARD',503);continuousOperation=guard.continuousOperation;}
  guard.keys.forEach((key,index)=>{const value=guard.values[index];if(entries.has(key)&&entries.get(key)!==value)throw new WorkspaceError('AUTHORIZATION_SNAPSHOT_CHANGED',409);entries.set(key,value);});
  if(guard.admissionExpiresAt!==undefined)expiresAt=Math.min(expiresAt??Infinity,guard.admissionExpiresAt);
 }
 if(entries.size>8)throw new WorkspaceError('INVALID_COMMIT_GUARD',503);
 return {keys:[...entries.keys()],values:[...entries.values()],...(expiresAt===undefined?{}:{admissionExpiresAt:expiresAt}),...(continuousOperation?{continuousOperation}:{})};
}
/** Buyer summaries are owner-scoped, not seller-scoped. Their revision is part
 * of order creation's CAS, so concurrent cross-service purchases share one
 * quota. Historical/removed seller bindings still consume that buyer's quota. */
export function mergePerOrderAdmissionSummaries(catalogue:MarketState,pending:MarketOrderAdmission[],buyer:MarketOrderAdmission[],sellerOwnerId:string,buyerOwnerId:string,environment:Environment=process.env){
 const p=configuredMultisellerPolicy(environment),state:MarketState=structuredClone(catalogue),ids=new Set([...state.orders,...(state.archived??[])].map(o=>o.operationId));
 const expected=(record:MarketOrderAdmission)=>p?p.sellers.some(s=>s.sellerOwnerId===record.sellerOwnerId&&s.cardHash===record.cardHash&&(!record.phase||s.serviceId===record.serviceId))||record.sellerOwnerId===sellerOwnerId&&record.cardHash===environment.BAZAAR_TEXT_SELLER_CARD_HASH&&(!record.phase||record.serviceId===environment.BAZAAR_TEXT_SELLER_SERVICE_ID):record.cardHash===environment.BAZAAR_TEXT_SELLER_CARD_HASH&&(!record.phase||record.serviceId===environment.BAZAAR_TEXT_SELLER_SERVICE_ID);
 for(const record of pending)if(record.sellerOwnerId!==sellerOwnerId||!expected(record))throw new WorkspaceError('PER_ORDER_ADMISSION_UNAVAILABLE',503);
 for(const record of buyer)if(p?record.buyerOwnerId!==buyerOwnerId:record.sellerOwnerId!==sellerOwnerId||!expected(record))throw new WorkspaceError('PER_ORDER_ADMISSION_UNAVAILABLE',503);
 for(const record of [...pending,...buyer])if(!ids.has(record.operationId)){ids.add(record.operationId);if(record.phase)state.orders.push(record as unknown as MarketOrder);else{state.archived??=[];state.archived.push(record as unknown as NonNullable<MarketState['archived']>[number]);}}
 return state;
}
/** A bounded pending index, rather than retained seller history, is combined
 * with the legacy seats. Its revision is compared in the atomic order create. */
export async function perOrderAdmissionSnapshot(buyerOwnerId:string,sellerOwnerId:string){
 const store=configuredMarketStore();if(!store.orderAdmissionSnapshot)throw new WorkspaceError('PER_ORDER_ADMISSION_SNAPSHOT_UNAVAILABLE',503);
 const repository=configuredMarketOrderRepository();
 if(continuousPerOrderStorage()){
  const [catalogue,pending,buyer]=await Promise.all([
   store.orderAdmissionSnapshot(),repository.admissionSnapshot(sellerOwnerId,'seller-pending',{limit:50}),
   process.env.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON===undefined?Promise.resolve(undefined):repository.admissionSnapshot(buyerOwnerId,'buyer',{limit:50}),
  ]);
  if(pending.nextCursor||buyer?.nextCursor)throw new WorkspaceError('PER_ORDER_ADMISSION_WINDOW_CAPACITY',503);
  const state=mergePerOrderAdmissionSummaries(catalogue.state,pending.records,buyer?.records??[],sellerOwnerId,buyerOwnerId);
  return {state,guard:combineMarketOrderGuards(catalogue.guard,pending.guard,buyer?.guard)};
 }
 const [catalogue,pending,buyer]=await Promise.all([
  store.orderAdmissionSnapshot(),repository.pendingSnapshot(sellerOwnerId,{limit:50}),
  process.env.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON===undefined?Promise.resolve(undefined):repository.indexSnapshot(buyerOwnerId,'buyer',{limit:50}),
 ]);
 if(pending.nextCursor||buyer?.nextCursor)throw new WorkspaceError('PER_ORDER_ADMISSION_WINDOW_CAPACITY',503);
 const state:MarketState=structuredClone(catalogue.state),ids=new Set(state.orders.map(order=>order.operationId));
 for(const order of [...pending.orders,...(buyer?.orders??[])])if(!ids.has(order.operationId)){ids.add(order.operationId);state.orders.push(order);}
 state.archived=[...(state.archived??[]),...pending.archived,...(buyer?.archived??[])].filter((entry,index,all)=>all.findIndex(other=>other.operationId===entry.operationId)===index);
 return {state,guard:combineMarketOrderGuards(catalogue.guard,pending.guard,buyer?.guard)};
}
type HistoryCursor={v:1;o:string;s:'n'|'l';c?:string};
function historyCursor(ownerId:string,phase:'n'|'l',cursor?:string){
 const encoded=Buffer.from(JSON.stringify({v:1,o:sha(ownerId).slice(0,32),s:phase,...(cursor?{c:cursor}:{})} satisfies HistoryCursor)).toString('base64url');
 if(encoded.length>512)throw new WorkspaceError('PER_ORDER_CURSOR_CAPACITY',503);return encoded;
}
function decodeHistoryCursor(ownerId:string,cursor?:string):HistoryCursor{
 if(cursor===undefined)return {v:1,o:sha(ownerId).slice(0,32),s:'n'};
 try{if(!/^[A-Za-z0-9_-]{1,512}$/.test(cursor))throw Error();const decoded=Buffer.from(cursor,'base64url');if(decoded.toString('base64url')!==cursor)throw Error();const value=JSON.parse(decoded.toString('utf8'));
  if(value.v!==1||value.o!==sha(ownerId).slice(0,32)||!['n','l'].includes(value.s)||Object.keys(value).sort().join(',')!==(value.c===undefined?'o,s,v':'c,o,s,v')||value.c!==undefined&&(typeof value.c!=='string'||value.c.length>400))throw Error();return value;
 }catch{throw new WorkspaceError('INVALID_CURSOR',400);}
}
function historyOrder(order:MarketOrder,p:WorkspacePrincipal){return {...order,expiresAt:marketContentExpiresAt(order),perspective:order.buyerOwnerId===p.ownerId?'purchase':'sale'};}
/** New-storage pages precede the retained legacy section. Each section uses a
 * native owner-scoped cursor; no page loads every retained per-order record.
 * The explicit section cursor keeps old records reachable without migration. */
export async function listPerOrderMarketOrdersPage(p:WorkspacePrincipal,options:MarketPageInput){
 marketPageSchema.parse(options);const cursor=decodeHistoryCursor(p.ownerId,options.cursor);
 if(cursor.s==='n'){
  const page=await configuredMarketOrderRepository().list(p.ownerId,{limit:options.limit??10,...(cursor.c?{cursor:cursor.c}:{})});
  const orders=page.orders.filter(order=>Date.parse(marketContentExpiresAt(order))>Date.now()).map(order=>historyOrder(order,p));
  const nextCursor=page.nextCursor?historyCursor(p.ownerId,'n',page.nextCursor):historyCursor(p.ownerId,'l');
  return {orders,nextCursor,partialResults:true};
 }
 const legacy=await configuredMarketStore().transact(state=>state.orders.filter(order=>(order.buyerOwnerId===p.ownerId||order.sellerOwnerId===p.ownerId)&&Date.parse(marketContentExpiresAt(order))>Date.now()));
 const page=marketPage(legacy,{limit:options.limit,...(cursor.c?{cursor:cursor.c}:{})},`orders:${p.ownerId}`,order=>({createdAt:order.createdAt,id:order.operationId}),order=>historyOrder(order,p));
 return {orders:page.items,nextCursor:page.nextCursor?historyCursor(p.ownerId,'l',page.nextCursor):null,partialResults:page.partialResults};
}
