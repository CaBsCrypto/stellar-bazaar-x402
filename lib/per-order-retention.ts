import {deliveryStorage} from './delivery-contract.ts';
import {MARKET_CONTENT_RETENTION_MS} from './market-file-delivery-schema.ts';
import {configuredMarketMaintenance} from './market-maintenance.ts';
import type {MarketOrderRepository} from './market-order-repository.ts';
import {configuredMarketOrderRepository} from './market-order-storage.ts';
import {marketRecoveryRecord} from './market-retention-schema.ts';
import type {MarketRedis} from './marketplace-store.ts';
import {WorkspaceError} from './workspace-types.ts';
import {FIND_PER_ORDER_RETENTION_CANDIDATE,READ_PER_ORDER_RETENTION_CHECKPOINT,RETENTION_PAGE_SIZE,WRITE_PER_ORDER_RETENTION_CHECKPOINT,retentionBuyerKey,retentionCheckpoint,retentionCheckpointKey,retentionMember,retentionOwner} from './per-order-retention-redis.ts';

export const PER_ORDER_RETENTION_SCAN_BUDGET=Object.freeze({commands:32,wireBytes:160*1024});
export const PER_ORDER_RETENTION_ARCHIVE_BUDGET=Object.freeze({commands:64,wireBytes:768*1024});
const OWNERS_PER_PASS=4;
const fail=()=>new WorkspaceError('PER_ORDER_RETENTION_UNCONFIRMED',503,60);
type RetentionScope={owners:()=>Promise<string[]>;archive:(work:()=>Promise<boolean>)=>Promise<boolean>;available:()=>boolean};

export function createPerOrderRetentionPass({redis,prefix,repository}:{redis:MarketRedis;prefix:string;repository:()=>Pick<MarketOrderRepository,'transact'>}){
 if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix))throw fail();
 const namespace=prefix+':orders:v2:',key=retentionCheckpointKey(namespace);
 return async ({owners,archive,available}:RetentionScope)=>{
  let scanned=0,archived=0;
  if(!available())return {scanned,archived,more:true};
  const result=await redis.eval(READ_PER_ORDER_RETENTION_CHECKPOINT,[key],[]);
  if(!Array.isArray(result)||result.length!==3||typeof result[0]!=='string'||typeof result[1]!=='string'||typeof result[2]!=='string'||!/^\d{1,12}$/.test(result[1])||!/^\d{1,6}$/.test(result[2]))throw fail();
  const [old,seconds,micros]=result as [string,string,string],saved=old?retentionCheckpoint(old):undefined;
  const now=Number(seconds)*1000+Math.floor(Number(micros)/1000);
  if(old&&!saved||!Number.isSafeInteger(now)||now<MARKET_CONTENT_RETENTION_MS)throw fail();
  // Index members sort by creation time. An exclusive bound at the next
  // millisecond includes orders that expire exactly at Redis's observed time.
  const cutoff=new Date(now-MARKET_CONTENT_RETENTION_MS+1).toISOString()+'|00000000-0000-4000-8000-000000000000';
  if(!retentionMember(cutoff))throw fail();
  if(!available())return {scanned,archived,more:true};
  const registry=await owners();
  if(!Array.isArray(registry)||registry.length>1024||!registry.every(retentionOwner)||new Set(registry).size!==registry.length)throw fail();
  const sorted=[...registry].sort();
  if(!sorted.length)return {scanned,archived,more:false};
  const start=Math.max(0,saved?sorted.findIndex(owner=>owner>=saved.owner):0),limit=Math.min(OWNERS_PER_PASS,sorted.length);
  let checkpoint=old,more=true;
  for(let offset=0;offset<limit;offset++){
   if(!available())return {scanned,archived,more:true};
   const owner=sorted[(start+offset)%sorted.length],nextOwner=sorted[(start+offset+1)%sorted.length];
   const after=offset===0&&saved?.owner===owner&&saved.after?saved.after:cutoff,upper=after<cutoff?after:cutoff;
   const page=await redis.eval(FIND_PER_ORDER_RETENTION_CANDIDATE,[retentionBuyerKey(namespace,owner)],[namespace,owner,'('+upper]);
   if(!Array.isArray(page)||page.length!==4)throw fail();
   const [count,last,candidate,continuation]=page;
   if(!Number.isInteger(count)||count<0||count>RETENTION_PAGE_SIZE||typeof last!=='string'||typeof candidate!=='string'||(continuation!==0&&continuation!==1)||(count===0?(last!==''||candidate!==''||continuation!==0):!retentionMember(last)||last>=upper)||candidate!==''&&candidate!==last)throw fail();
   scanned+=count;
   checkpoint=continuation?owner+'|'+last:nextOwner;
   if(candidate){
    if(!available())return {scanned,archived,more:true};
    const id=candidate.slice(25),createdAt=candidate.slice(0,24);
    const changed=await archive(()=>repository().transact(id,envelope=>{
     if(envelope.buyerOwnerId!==owner||envelope.operationId!==id||envelope.createdAt!==createdAt)throw fail();
     if(envelope.recovery)return false;
     const order=envelope.order;
     if(!order||order.operationId!==id||order.buyerOwnerId!==owner||order.createdAt!==createdAt||Date.parse(createdAt)+MARKET_CONTENT_RETENTION_MS>now)throw fail();
     // Continuous per-order admission is text-only. Unexpected object files
     // require operator cleanup rather than erasing their only references.
     if(order.fileReservation||order.fileDelivery||deliveryStorage(order.card.delivery).mode!=='text')throw fail();
     envelope.recovery=marketRecoveryRecord(order,envelope.settlement,now);
     delete envelope.order;delete envelope.settlement;
     return true;
    }));
    if(changed)archived++;
    more=continuation===1||offset+1<sorted.length;
    break;
   }
   if(continuation)break;
   if(offset+1===limit)more=limit<sorted.length;
  }
  if(!available())return {scanned,archived,more:true};
  if(checkpoint!==old&&await redis.eval(WRITE_PER_ORDER_RETENTION_CHECKPOINT,[key],[old,checkpoint])!==1)throw fail();
  return {scanned,archived,more};
 };
}

export function runPerOrderRetentionPass(scope:RetentionScope){
 const {redis,prefix}=configuredMarketMaintenance();
 return createPerOrderRetentionPass({redis,prefix,repository:configuredMarketOrderRepository})(scope);
}
