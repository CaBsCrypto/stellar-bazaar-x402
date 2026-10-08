import {randomUUID} from 'node:crypto';
import {Redis} from '@upstash/redis';
import {meteredRedis} from './acceptance-meter.ts';
import {marketPrefix,validateMarketState,type MarketRedis,type MarketState} from './marketplace-store.ts';
import {validateMarketX402State,type MarketX402State} from './marketplace-x402-store.ts';
import {MARKET_CAPACITY_CAS,capacityReservationKey,projectCapacity,MARKET_CAPACITY_BYTES,SETTLEMENT_CAPACITY_BYTES,RESERVATION_CAPACITY_BYTES} from './marketplace-capacity.ts';
import {marketRecoveryRecord} from './market-retention-schema.ts';
import {marketContentExpiresAt,MARKET_FILE_CLEANUP_GRACE_MS} from './market-file-delivery-schema.ts';
import {marketFileCleanupKeys,configuredMarketFileStorage} from './market-file-delivery.ts';
import type {PrivateObjectStorage} from './deliverable-s3.ts';
import {WorkspaceError} from './workspace-types.ts';

function parse<T>(raw:unknown,empty:T):T{
 if(raw===null)return empty;
 if(typeof raw!=='string')throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
 const envelope=JSON.parse(raw);
 if(envelope?.version!==1||typeof envelope.revision!=='string'||Object.keys(envelope).sort().join(',')!=='revision,state,version')throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
 return envelope.state as T;
}
/** Content is erased at its deadline even when object deletion fails. Hashed
 * cleanup keys retain the byte reservation until two acknowledged deletions,
 * separated by a bounded grace. A lifecycle policy remains the late-upload
 * backstop; grace is not proof that an arbitrary in-flight request has ended. */
export async function pruneExpiredMarketContent({redis,prefix,objects,now=Date.now(),limit=10}:{redis:MarketRedis;prefix:string;objects?:PrivateObjectStorage;now?:number;limit?:number}){
 if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix)||!Number.isSafeInteger(now)||now>Date.now()||!Number.isInteger(limit)||limit<1||limit>10)throw new WorkspaceError('INVALID_MAINTENANCE_SCOPE',400);
 const keys=[prefix+':state',prefix+':x402-settlements:state',capacityReservationKey(prefix)];
 let raw=await Promise.all(keys.map(key=>redis.get(key)));
 if(raw.some((value,i)=>value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>[MARKET_CAPACITY_BYTES,SETTLEMENT_CAPACITY_BYTES,RESERVATION_CAPACITY_BYTES][i])))throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
 const market=parse<MarketState>(raw[0],{version:1,services:[],orders:[]}),settlements=parse<MarketX402State>(raw[1],{version:1,records:[]});
 validateMarketState(market);validateMarketX402State(settlements);
 async function commit(){
  validateMarketState(market);validateMarketX402State(settlements);
  const nextMarket=JSON.stringify({version:1,revision:randomUUID(),state:market}),nextSettlement=JSON.stringify({version:1,revision:randomUUID(),state:settlements});
  const projected=projectCapacity(nextMarket,nextSettlement,raw[2] as string|null),expected=(value:unknown)=>[value===null?'missing':'present',value??''];
  const nextLedger=projected.ledgerRaw??raw[2];
  const args=[...expected(raw[0]),...expected(raw[1]),...expected(raw[2]),nextMarket,nextSettlement,nextLedger!==raw[2]?nextLedger??'':'','unchecked','','unchecked',''] as string[];
  if(await redis.eval(MARKET_CAPACITY_CAS,keys,args)!==1)throw new WorkspaceError('MAINTENANCE_WRITE_UNCONFIRMED',409);
  raw=[nextMarket,nextSettlement,nextLedger];
 }
 const expired=market.orders.filter(o=>Date.parse(marketContentExpiresAt(o))<=now).slice(0,limit),removed:string[]=[],incidents:{operationId:string;code:string}[]=[];
 for(const order of expired){
  const objectKeys=marketFileCleanupKeys(order,objects);
  if(objectKeys.length){
   if(!order.fileReservation)throw new WorkspaceError('INVALID_FILE_RESERVATION',503);
   market.fileCleanup??=[];
   market.fileCleanup.push({operationId:order.operationId,buyerOwnerId:order.buyerOwnerId,maxBytes:order.fileReservation.maxBytes,objectKeys,notBefore:new Date(Date.parse(marketContentExpiresAt(order))+MARKET_FILE_CLEANUP_GRACE_MS).toISOString()});
  }
  market.archived??=[];
  market.archived.push(marketRecoveryRecord(order,settlements.records.find(r=>r.operationId===order.operationId),now));
  market.orders=market.orders.filter(o=>o.operationId!==order.operationId);
  settlements.records=settlements.records.filter(r=>r.operationId!==order.operationId);removed.push(order.operationId);
 }
 if(removed.length)await commit();
 const eligible=(market.fileCleanup??[]).filter(entry=>!entry.firstDeletedAt||(now>=Date.parse(entry.notBefore)&&now-Date.parse(entry.firstDeletedAt)>=MARKET_FILE_CLEANUP_GRACE_MS)).sort((a,b)=>a.operationId.localeCompare(b.operationId));
 const cursor=market.maintenance?.cleanupCursor??'';
 const due=[...eligible.filter(e=>e.operationId>cursor),...eligible.filter(e=>e.operationId<=cursor)].slice(0,limit);
 if(due.length){market.maintenance={...market.maintenance,cleanupCursor:due[due.length-1].operationId};await commit();}
 const deletions=await Promise.allSettled(due.map(async entry=>{
  const prefix=entry.objectKeys[0].split('/').slice(0,4).join('/'),storage=objects??configuredMarketFileStorage(prefix);
  if(!storage.removeKey)throw new WorkspaceError('CLEANUP_KEYS_UNAVAILABLE',503);
  const results=await Promise.allSettled(entry.objectKeys.map(key=>storage.removeKey!(key)));
  if(results.some(r=>r.status==='rejected'))throw new WorkspaceError('OBJECT_DELETION_UNCONFIRMED',503);
 }));
 let cleanupReleased=0,acknowledged=0;
 for(let i=0;i<due.length;i++){
  const entry=due[i];
  if(deletions[i].status==='rejected'){incidents.push({operationId:entry.operationId,code:'OBJECT_DELETION_UNCONFIRMED'});continue;}
  acknowledged++;
  if(entry.firstDeletedAt){market.fileCleanup=market.fileCleanup!.filter(e=>e.operationId!==entry.operationId);cleanupReleased++;}
  else entry.firstDeletedAt=new Date(now).toISOString();
 }
 if(acknowledged)await commit();
 return {removed,incidents,cleanupReleased,cleanupPending:market.fileCleanup?.length??0,moreExpired:expired.length===limit,retentionDays:7,cleanupGraceMinutes:15,lifecycleBackstopRequired:true};
}
export function configuredMarketMaintenance(){
 const url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN;
 if(!url||!token)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
 return {redis:meteredRedis(new Redis({url,token,automaticDeserialization:false,retry:false,enableAutoPipelining:false})),prefix:marketPrefix()};
}
