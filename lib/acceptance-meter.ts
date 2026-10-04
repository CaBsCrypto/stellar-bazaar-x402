import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';

type Counts = { redis: number; commandsUpperBound: number; outboundPayloadBytes: number; inboundPayloadBytes: number; workspaceStoredBytesUpperBound: number; marketStoredBytesUpperBound:number; reviewStoredBytesUpperBound:number; catalogStoredBytesUpperBound:number; external:Record<ExternalKind,number>; externalOutboundPayloadBytes:number; externalInboundPayloadBytes:number; uncertain: boolean };
type ExternalKind='horizon'|'proof-dns'|'proof-http'|'provider';
const scope = new AsyncLocalStorage<Counts>();
const enabled = () => process.env.BAZAAR_ACCEPTANCE_METER === 'true';
const limits = { redis: 32, commandsUpperBound: 224, outboundPayloadBytes: 4 * 1048576, inboundPayloadBytes: 8 * 1048576 };
export const SALE_STORAGE_CAPS={workspace:12288,market:16384,review:12288,catalog:8192} as const;
const fresh=():Counts=>({redis:0,commandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0,workspaceStoredBytesUpperBound:0,marketStoredBytesUpperBound:0,reviewStoredBytesUpperBound:0,catalogStoredBytesUpperBound:0,external:{horizon:0,'proof-dns':0,'proof-http':0,provider:0},externalOutboundPayloadBytes:0,externalInboundPayloadBytes:0,uncertain:false});
function record(counts:Counts,source:'api'|'ssr'){const requestId=randomUUID();console.info(JSON.stringify({acceptanceMeter:'v1',source,requestId,...counts}));return requestId;}

/** SSR dynamic reads have their own logged scope; no bearer or payload is logged. */
export async function measuredRead<T>(handler:()=>T|Promise<T>):Promise<T>{
 if(!enabled()||scope.getStore())return handler();
 const counts=fresh();return scope.run(counts,async()=>{try{return await handler();}finally{record(counts,'ssr');}});
}

export type ExternalPayloadEvidence=()=>{outboundBytes?:number;inboundBytes?:number};
/** One bounded transport invocation. A transport can supply exact raw body bytes, including a partial failed read. */
export async function meteredExternal<T>(kind:ExternalKind,handler:()=>Promise<T>,outbound?:unknown,evidence?:ExternalPayloadEvidence):Promise<T>{
 if(!enabled())return handler();const counts=scope.getStore();if(!counts)throw Error('ACCEPTANCE_SCOPE_REQUIRED');
 if(!(kind in counts.external)||counts.external[kind]>=8)throw Error('ACCEPTANCE_EXTERNAL_BUDGET');
 const checkedBytes=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw Error('ACCEPTANCE_EXTERNAL_BYTE_EVIDENCE_INVALID');return value;};
 const before=evidence?.();const bytes=before?.outboundBytes===undefined?(outbound===undefined?0:Buffer.byteLength(JSON.stringify(outbound))):checkedBytes(before.outboundBytes);
 if(counts.externalOutboundPayloadBytes+bytes>limits.outboundPayloadBytes)throw Error('ACCEPTANCE_EXTERNAL_BUDGET');
 counts.external[kind]++;counts.externalOutboundPayloadBytes+=bytes;
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
      response.headers.set('X-Bazaar-Acceptance-Meter', 'v1');
      response.headers.set('X-Bazaar-Redis-Requests', String(counts.redis));
      response.headers.set('X-Bazaar-Redis-Commands-Upper-Bound', String(counts.commandsUpperBound));
      response.headers.set('X-Bazaar-Redis-Outbound-Payload-Bytes', String(counts.outboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Inbound-Payload-Bytes', String(counts.inboundPayloadBytes));
      response.headers.set('X-Bazaar-Workspace-Stored-Bytes-Upper-Bound', String(counts.workspaceStoredBytesUpperBound));
      for(const name of ['market','review','catalog'] as const)response.headers.set('X-Bazaar-'+name+'-Stored-Bytes-Upper-Bound',String(counts[`${name}StoredBytesUpperBound`]));
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
        if(process.env.BAZAAR_ACCEPTANCE_SALE==='true'){
          const root=prefix+':{'+suffix+'}',registryKey=root+':registry',markerKey=root+':initialized';
          if(registry.workspaces.some(owner=>typeof owner.ownerId!=='string'||!/^ow_[a-f0-9]{32}$/.test(owner.ownerId))||new Set(registry.workspaces.map(owner=>owner.ownerId)).size!==registry.workspaces.length)throw Error('ACCEPTANCE_STORAGE_OWNER_REQUIRED');
          const ownerKeys=registry.workspaces.map(owner=>root+':owner:'+owner.ownerId);
          const document=body[3+Number(body[2])+4];
          if(keys[0]!==registryKey||keys[2]!==markerKey||(!ownerKeys.includes(keys[1] as string)&&keys[1]!==root+':owner:none')||typeof document!=='string'||(document!==''&&!ownerKeys.includes(keys[1] as string)))throw Error('ACCEPTANCE_WORKSPACE_KEY_DENIED');
          stored+=Buffer.byteLength(registryKey)+Buffer.byteLength(markerKey)+ownerKeys.reduce((sum,key)=>sum+Buffer.byteLength(key),0);
        }
        if (stored > (process.env.BAZAAR_ACCEPTANCE_SALE==='true'?SALE_STORAGE_CAPS.workspace:49164)) throw Error('ACCEPTANCE_STORAGE_BUDGET');
        counts.workspaceStoredBytesUpperBound = Math.max(counts.workspaceStoredBytesUpperBound, stored);
      }
      if(process.env.BAZAAR_ACCEPTANCE_SALE==='true'&&/redis\.call\(['"](?:SET|SADD)['"]/i.test(script)){
        const args=body.slice(3+Number(body[2]));
        const market='bazaar-market:'+suffix,review='bazaar-review:'+suffix;
        if(keys.length===1&&(keys[0]===market+':state'||keys[0]===review+':state')){
          const name=keys[0]===market+':state'?'market':'review';const value=args[2];
          if(typeof value!=='string')throw Error('ACCEPTANCE_STORED_VALUE_REQUIRED');const bytes=Buffer.byteLength(value)+Buffer.byteLength(keys[0] as string);
          if(bytes>SALE_STORAGE_CAPS[name])throw Error('ACCEPTANCE_STORAGE_BUDGET');
          counts[`${name}StoredBytesUpperBound`]=Math.max(counts[`${name}StoredBytesUpperBound`],bytes);
        }else if(keys.some(key=>typeof key==='string'&&key.startsWith(market+':catalog:'))){
          const cardId=process.env.BAZAAR_ACCEPTANCE_CATALOG_CARD_ID;
          if(!cardId||keys.some(key=>key!==market+':catalog:card:'+cardId&&key!==market+':catalog:index'))throw Error('ACCEPTANCE_CATALOG_KEY_DENIED');
          const catalogOverhead=Buffer.byteLength(market+':catalog:card:'+cardId)+Buffer.byteLength(market+':catalog:index')+Buffer.byteLength(cardId);
          if(typeof args[0]==='string'){
            const bytes=Buffer.byteLength(args[0])+catalogOverhead;
            if(Buffer.byteLength(args[0])>7936||args[1]!==cardId||Buffer.byteLength(cardId)>256||bytes>SALE_STORAGE_CAPS.catalog)throw Error('ACCEPTANCE_STORAGE_BUDGET');
            counts.catalogStoredBytesUpperBound=Math.max(counts.catalogStoredBytesUpperBound,bytes);
          }else if(script.includes('string.len(next)>7936')){const bound=7936+catalogOverhead;if(bound>SALE_STORAGE_CAPS.catalog)throw Error('ACCEPTANCE_STORAGE_BUDGET');counts.catalogStoredBytesUpperBound=Math.max(counts.catalogStoredBytesUpperBound,bound);}
          else throw Error('ACCEPTANCE_CATALOG_WRITE_UNBOUNDED');
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
