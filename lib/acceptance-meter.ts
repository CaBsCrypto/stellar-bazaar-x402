import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Redis } from '@upstash/redis';

type Counts = { redis: number; commandsUpperBound: number; outboundPayloadBytes: number; inboundPayloadBytes: number; workspaceStoredBytesUpperBound: number; marketStoredBytesUpperBound:number; reviewStoredBytesUpperBound:number; catalogStoredBytesUpperBound:number; settlementStoredBytesUpperBound:number; external:Partial<Record<ExternalKind,number>>; externalOutboundPayloadBytes:number; externalInboundPayloadBytes:number; uncertain: boolean };
export type ExternalKind='horizon'|'proof-dns'|'proof-http'|'provider'|'facilitator'|'rpc';
const scope = new AsyncLocalStorage<Counts>();
const enabled = () => process.env.BAZAAR_ACCEPTANCE_METER === 'true';
const limits = { redis: 32, commandsUpperBound: 224, outboundPayloadBytes: 4 * 1048576, inboundPayloadBytes: 8 * 1048576 };
export const SALE_STORAGE_CAPS={workspace:12288,market:16384,review:12288,catalog:8192} as const;
export const ACCEPTANCE_TOTAL_STORAGE_CAP=49164;
const x402Enabled=()=>process.env.BAZAAR_ACCEPTANCE_X402==='true';
export function acceptanceStorageCaps():Record<'workspace'|'market'|'review'|'catalog'|'settlement',number>{
 if(!x402Enabled())return {...SALE_STORAGE_CAPS,settlement:0};
 let value:Record<string,unknown>;try{value=JSON.parse(process.env.BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON??'');}catch{throw Error('ACCEPTANCE_STORAGE_ALLOCATION_REQUIRED');}
 const names=['workspace','market','review','catalog','settlement'] as const;
 if(!value||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(name=>!Number.isSafeInteger(value[name])||Number(value[name])<0)||names.reduce((n,name)=>n+Number(value[name]),0)>ACCEPTANCE_TOTAL_STORAGE_CAP)throw Error('ACCEPTANCE_STORAGE_ALLOCATION_INVALID');
 return Object.fromEntries(names.map(name=>[name,Number(value[name])])) as Record<typeof names[number],number>;
}
/** Two frozen value allocations share one index; every permitted catalog write fits their aggregate cap. */
export function acceptanceCatalogAllocation(market:string,catalogCap:number){
 let values:Record<string,unknown>;try{values=JSON.parse(process.env.BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON??'');}catch{throw Error('ACCEPTANCE_CATALOG_ALLOCATION_REQUIRED');}
 if(!values||Array.isArray(values)||Object.keys(values).length!==2)throw Error('ACCEPTANCE_CATALOG_ALLOCATION_INVALID');
 const indexKey=market+':catalog:index';
 const cards=Object.entries(values).map(([id,maxValueBytes])=>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(id)||Buffer.byteLength(id)>256||!Number.isSafeInteger(maxValueBytes)||Number(maxValueBytes)<1||Number(maxValueBytes)>7936)throw Error('ACCEPTANCE_CATALOG_ALLOCATION_INVALID');
  return {id,key:market+':catalog:card:'+id,maxValueBytes:Number(maxValueBytes)};
 });
 const aggregateBytes=Buffer.byteLength(indexKey)+cards.reduce((total,card)=>total+card.maxValueBytes+Buffer.byteLength(card.key)+Buffer.byteLength(card.id),0);
 if(aggregateBytes>catalogCap)throw Error('ACCEPTANCE_STORAGE_BUDGET');
 return {cards,indexKey,aggregateBytes};
}
const fresh=():Counts=>({redis:0,commandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0,workspaceStoredBytesUpperBound:0,marketStoredBytesUpperBound:0,reviewStoredBytesUpperBound:0,catalogStoredBytesUpperBound:0,settlementStoredBytesUpperBound:0,external:{horizon:0,'proof-dns':0,'proof-http':0,provider:0,...(x402Enabled()?{facilitator:0,rpc:0}:{})},externalOutboundPayloadBytes:0,externalInboundPayloadBytes:0,uncertain:false});
function record(counts:Counts,source:'api'|'ssr'){const requestId=randomUUID();console.info(JSON.stringify({acceptanceMeter:x402Enabled()?'v2':'v1',source,requestId,...counts}));return requestId;}

/** SSR dynamic reads have their own logged scope; no bearer or payload is logged. */
export async function measuredRead<T>(handler:()=>T|Promise<T>):Promise<T>{
 if(!enabled()||scope.getStore())return handler();
 const counts=fresh();return scope.run(counts,async()=>{try{return await handler();}finally{record(counts,'ssr');}});
}

export type ExternalPayloadEvidence=()=>{outboundBytes?:number;inboundBytes?:number};
/** One bounded transport invocation. A transport can supply exact raw body bytes, including a partial failed read. */
export async function meteredExternal<T>(kind:ExternalKind,handler:()=>Promise<T>,outbound?:unknown,evidence?:ExternalPayloadEvidence):Promise<T>{
 if(!enabled())return handler();const counts=scope.getStore();if(!counts)throw Error('ACCEPTANCE_SCOPE_REQUIRED');
 if(!(kind in counts.external)||(counts.external[kind]??0)>=8)throw Error('ACCEPTANCE_EXTERNAL_BUDGET');
 const checkedBytes=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw Error('ACCEPTANCE_EXTERNAL_BYTE_EVIDENCE_INVALID');return value;};
 const before=evidence?.();const bytes=before?.outboundBytes===undefined?(outbound===undefined?0:Buffer.byteLength(JSON.stringify(outbound))):checkedBytes(before.outboundBytes);
 if(counts.externalOutboundPayloadBytes+bytes>limits.outboundPayloadBytes)throw Error('ACCEPTANCE_EXTERNAL_BUDGET');
 counts.external[kind]=(counts.external[kind]??0)+1;counts.externalOutboundPayloadBytes+=bytes;
 let inboundRecorded=false;
 try{const result=await handler(),after=evidence?.();const inbound=after?.inboundBytes===undefined?Buffer.byteLength(JSON.stringify(result)??''):checkedBytes(after.inboundBytes);
 counts.externalInboundPayloadBytes+=inbound;inboundRecorded=true;if(counts.externalInboundPayloadBytes>limits.inboundPayloadBytes)throw Error('ACCEPTANCE_EXTERNAL_RESPONSE_BUDGET');return result;}
 catch(error){counts.uncertain=true;
  if(!inboundRecorded&&evidence){const partial=evidence().inboundBytes;if(partial!==undefined)counts.externalInboundPayloadBytes+=checkedBytes(partial);}
  throw error;}
}

/** Only payload counts, never credentials, keys or record contents, reach responses. */
export function measuredHandler<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    if (!enabled() || scope.getStore()) return handler(...args);
    const counts=fresh();
    return scope.run(counts, async () => {
      let response:Response;
      try { response = await handler(...args); }
      catch(error) { record(counts,'api'); throw error; }
      const requestId = record(counts,'api');
      response.headers.set('X-Bazaar-Acceptance-Request-Id', requestId);
      response.headers.set('X-Bazaar-Acceptance-Meter', x402Enabled()?'v2':'v1');
      response.headers.set('X-Bazaar-Redis-Requests', String(counts.redis));
      response.headers.set('X-Bazaar-Redis-Commands-Upper-Bound', String(counts.commandsUpperBound));
      response.headers.set('X-Bazaar-Redis-Outbound-Payload-Bytes', String(counts.outboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Inbound-Payload-Bytes', String(counts.inboundPayloadBytes));
      response.headers.set('X-Bazaar-Workspace-Stored-Bytes-Upper-Bound', String(counts.workspaceStoredBytesUpperBound));
      for(const name of ['market','review','catalog'] as const)response.headers.set('X-Bazaar-'+name+'-Stored-Bytes-Upper-Bound',String(counts[`${name}StoredBytesUpperBound`]));
      if(x402Enabled())response.headers.set('X-Bazaar-Settlement-Stored-Bytes-Upper-Bound',String(counts.settlementStoredBytesUpperBound));
      for(const kind of Object.keys(counts.external) as ExternalKind[])response.headers.set('X-Bazaar-External-'+kind,String(counts.external[kind]));
      response.headers.set('X-Bazaar-External-Outbound-Payload-Bytes',String(counts.externalOutboundPayloadBytes));
      response.headers.set('X-Bazaar-External-Inbound-Payload-Bytes',String(counts.externalInboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Uncertain', String(counts.uncertain));
      return response;
    });
  };
}

export function meteredRedis(redis: Redis): Redis {
  redis.use(async (request, next) => {
    if (!enabled()) return next(request);
    const counts = scope.getStore();
    if (!counts) throw Error('ACCEPTANCE_SCOPE_REQUIRED');
    const storageCaps=acceptanceStorageCaps();
    const prefix = process.env.BAZAAR_WORKSPACE_PREFIX;
    if (!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(prefix ?? '')) throw Error('ACCEPTANCE_NAMESPACE_REQUIRED');
    const suffix = prefix!.slice('bazaar-workspace:'.length);
    const allowed = [prefix!, 'bazaar-market:' + suffix, 'bazaar-review:' + suffix];
    const body = request.body;
    if (!Array.isArray(body) || typeof body[0] !== 'string') throw Error('ACCEPTANCE_COMMAND_REQUIRED');
    const command = body[0].toLowerCase();
    let keys: unknown[];
    let commandBound: number;
    if (command === 'eval') {
      const script = body[1];
      if (typeof script !== 'string' || !Number.isInteger(Number(body[2]))) throw Error('ACCEPTANCE_SCRIPT_REQUIRED');
      keys = body.slice(3, 3 + Number(body[2]));
      // These reviewed scripts contain no loops; count EVAL plus every possible redis.call.
      if (/\b(for|while|repeat)\b/.test(script) || !/redis\.call/.test(script)) throw Error('ACCEPTANCE_SCRIPT_UNBOUNDED');
      commandBound = 1 + (script.match(/redis\.call\s*\(/g)?.length ?? 0);
      if (keys.length === 3 && script.includes("'workspace-v1'") && keys.every(key => typeof key === 'string' && key.startsWith(prefix! + ':'))) {
        const registryRaw = body[3 + Number(body[2]) + 3];
        if (typeof registryRaw !== 'string') throw Error('ACCEPTANCE_REGISTRY_REQUIRED');
        const registry = JSON.parse(registryRaw) as { workspaces: { ownerId?:string; documentBytes: number }[] };
        if (!Array.isArray(registry.workspaces) || registry.workspaces.some(owner => !Number.isSafeInteger(owner.documentBytes) || owner.documentBytes < 0)) throw Error('ACCEPTANCE_STORAGE_BOUND_REQUIRED');
        let stored = Buffer.byteLength(registryRaw) + registry.workspaces.reduce((sum, owner) => sum + owner.documentBytes, 0) + Buffer.byteLength('workspace-v1');
        if(process.env.BAZAAR_ACCEPTANCE_SALE==='true'||x402Enabled()){
          const root=prefix+':{'+suffix+'}',registryKey=root+':registry',markerKey=root+':initialized';
          if(registry.workspaces.some(owner=>typeof owner.ownerId!=='string'||!/^ow_[a-f0-9]{32}$/.test(owner.ownerId))||new Set(registry.workspaces.map(owner=>owner.ownerId)).size!==registry.workspaces.length)throw Error('ACCEPTANCE_STORAGE_OWNER_REQUIRED');
          const ownerKeys=registry.workspaces.map(owner=>root+':owner:'+owner.ownerId);
          const document=body[3+Number(body[2])+4];
          if(keys[0]!==registryKey||keys[2]!==markerKey||(!ownerKeys.includes(keys[1] as string)&&keys[1]!==root+':owner:none')||typeof document!=='string'||(document!==''&&!ownerKeys.includes(keys[1] as string)))throw Error('ACCEPTANCE_WORKSPACE_KEY_DENIED');
          stored+=Buffer.byteLength(registryKey)+Buffer.byteLength(markerKey)+ownerKeys.reduce((sum,key)=>sum+Buffer.byteLength(key),0);
        }
        if (stored > (process.env.BAZAAR_ACCEPTANCE_SALE==='true'||x402Enabled()?storageCaps.workspace:49164)) throw Error('ACCEPTANCE_STORAGE_BUDGET');
        counts.workspaceStoredBytesUpperBound = Math.max(counts.workspaceStoredBytesUpperBound, stored);
      }
      if((process.env.BAZAAR_ACCEPTANCE_SALE==='true'||x402Enabled())&&/redis\.call\(['"](?:SET|SADD)['"]/i.test(script)){
        const args=body.slice(3+Number(body[2]));
        const market='bazaar-market:'+suffix,review='bazaar-review:'+suffix;
        if(x402Enabled()&&keys.length===1&&keys[0]===market+':x402-settlements:state'){
          if(process.env.BAZAAR_ACCEPTANCE_SETTLEMENT_KEY!==keys[0])throw Error('ACCEPTANCE_SETTLEMENT_KEY_DENIED');
          const value=args[2];if(typeof value!=='string')throw Error('ACCEPTANCE_STORED_VALUE_REQUIRED');
          let record;try{record=JSON.parse(value);}catch{throw Error('ACCEPTANCE_SETTLEMENT_RECORD_REQUIRED');}
          if(record?.version!==1||typeof record.revision!=='string'||record.state?.version!==1||!Array.isArray(record.state.records)||record.state.records.length>100)throw Error('ACCEPTANCE_SETTLEMENT_RECORD_REQUIRED');
          const bytes=Buffer.byteLength(value)+Buffer.byteLength(keys[0] as string);
          if(bytes>storageCaps.settlement)throw Error('ACCEPTANCE_STORAGE_BUDGET');counts.settlementStoredBytesUpperBound=Math.max(counts.settlementStoredBytesUpperBound,bytes);
        }else if(keys.length===1&&(keys[0]===market+':state'||keys[0]===review+':state')){
          const name=keys[0]===market+':state'?'market':'review';const value=args[2];
          if(typeof value!=='string')throw Error('ACCEPTANCE_STORED_VALUE_REQUIRED');const bytes=Buffer.byteLength(value)+Buffer.byteLength(keys[0] as string);
          if(bytes>storageCaps[name])throw Error('ACCEPTANCE_STORAGE_BUDGET');
          counts[`${name}StoredBytesUpperBound`]=Math.max(counts[`${name}StoredBytesUpperBound`],bytes);
        }else if(keys.some(key=>typeof key==='string'&&key.startsWith(market+':catalog:'))){
          if(x402Enabled()){
            const allocation=acceptanceCatalogAllocation(market,storageCaps.catalog),entry=allocation.cards.find(card=>card.key===keys[0]);
            if(!entry||keys.some(key=>key!==entry.key&&key!==allocation.indexKey))throw Error('ACCEPTANCE_CATALOG_KEY_DENIED');
            let value:string;
            if(script.includes('-- x402-catalog-withdraw-cas-v1')){
              if(keys.length!==1||typeof args[0]!=='string'||typeof args[1]!=='string')throw Error('ACCEPTANCE_CATALOG_WITHDRAW_PAYLOAD_REQUIRED');
              let old,next;try{old=JSON.parse(args[0]);next=JSON.parse(args[1]);}catch{throw Error('ACCEPTANCE_CATALOG_WITHDRAW_PAYLOAD_REQUIRED');}
              if(!old||typeof old!=='object'||Array.isArray(old)||!next||typeof next!=='object'||Array.isArray(next)||next.withdrawn!==true||!isDeepStrictEqual(next,{...old,withdrawn:true}))throw Error('ACCEPTANCE_CATALOG_WITHDRAW_CHANGED_FIELDS');
              value=args[1];
            }else{
              if(keys.length!==2||keys[1]!==allocation.indexKey||typeof args[0]!=='string'||args[1]!==entry.id)throw Error('ACCEPTANCE_CATALOG_WRITE_UNBOUNDED');
              value=args[0];
            }
            if(Buffer.byteLength(value)>entry.maxValueBytes)throw Error('ACCEPTANCE_STORAGE_BUDGET');
            counts.catalogStoredBytesUpperBound=Math.max(counts.catalogStoredBytesUpperBound,allocation.aggregateBytes);
          }else{
          const cardId=process.env.BAZAAR_ACCEPTANCE_CATALOG_CARD_ID;
          if(!cardId||keys.some(key=>key!==market+':catalog:card:'+cardId&&key!==market+':catalog:index'))throw Error('ACCEPTANCE_CATALOG_KEY_DENIED');
          const catalogOverhead=Buffer.byteLength(market+':catalog:card:'+cardId)+Buffer.byteLength(market+':catalog:index')+Buffer.byteLength(cardId);
          if(typeof args[0]==='string'){
            const bytes=Buffer.byteLength(args[0])+catalogOverhead;
            if(Buffer.byteLength(args[0])>7936||args[1]!==cardId||Buffer.byteLength(cardId)>256||bytes>storageCaps.catalog)throw Error('ACCEPTANCE_STORAGE_BUDGET');
            counts.catalogStoredBytesUpperBound=Math.max(counts.catalogStoredBytesUpperBound,bytes);
          }else if(script.includes('string.len(next)>7936')){const bound=7936+catalogOverhead;if(bound>storageCaps.catalog)throw Error('ACCEPTANCE_STORAGE_BUDGET');counts.catalogStoredBytesUpperBound=Math.max(counts.catalogStoredBytesUpperBound,bound);}
          else throw Error('ACCEPTANCE_CATALOG_WRITE_UNBOUNDED');
          }
        }else if(!keys.every(key=>typeof key==='string'&&key.startsWith(prefix!+':')))throw Error('ACCEPTANCE_WRITE_KEY_DENIED');
      }
    } else if (['get', 'mget', 'smembers'].includes(command)) {
      keys = body.slice(1); commandBound = 1;
    } else throw Error('ACCEPTANCE_COMMAND_DENIED');
    if (!keys.length || keys.some(key => typeof key !== 'string' || !allowed.some(p => key.startsWith(p + ':')))) throw Error('ACCEPTANCE_KEY_DENIED');
    const outbound = Buffer.byteLength(JSON.stringify(body));
    if (counts.redis + 1 > limits.redis || counts.commandsUpperBound + commandBound > limits.commandsUpperBound || counts.outboundPayloadBytes + outbound > limits.outboundPayloadBytes || counts.inboundPayloadBytes >= limits.inboundPayloadBytes) throw Error('ACCEPTANCE_REQUEST_BUDGET');
    counts.redis++; counts.commandsUpperBound += commandBound; counts.outboundPayloadBytes += outbound;
    try {
      const response = await next(request);
      counts.inboundPayloadBytes += Buffer.byteLength(JSON.stringify(response));
      if (response.error || counts.inboundPayloadBytes > limits.inboundPayloadBytes) { counts.uncertain = true; throw Error('ACCEPTANCE_REDIS_RESULT_UNCONFIRMED'); }
      return response;
    } catch (error) { counts.uncertain = true; throw error; }
  });
  return redis;
}
