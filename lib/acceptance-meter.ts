import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Redis } from '@upstash/redis';
import { classifyOperationalRequest, type OperationalRequestClass, type OperationalProfile,type OperationalWorkload } from './operational-pressure.ts';
import { operationalMetricTotals } from './operational-metrics.ts';
import { operationalTransportEnvelope } from './operational-envelopes.ts';
import {withCatalogBudget,catalogBudgetRedis,catalogBudgetObservation} from './catalog-budget.ts';
import {assertContinuousExternalAllowed,withContinuousControlBudget,continuousControlBudgetRedis,continuousControlBudgetObservation} from './continuous-control-budget.ts';
import {guardianBudgetRedis,guardianBudgetObservation} from './guardian-budget.ts';
import {isPerOrderPaymentEnabled,perOrderPaymentCapabilityKind} from './per-order-payment-profile.ts';

export type Counts = { redis: number; commandsUpperBound: number; outboundPayloadBytes: number; inboundPayloadBytes: number; workspaceStoredBytesUpperBound: number; marketStoredBytesUpperBound:number; reviewStoredBytesUpperBound:number; catalogStoredBytesUpperBound:number; settlementStoredBytesUpperBound:number; ledgerStoredBytesUpperBound?:number; storageObservation?:'prospective-upper-bound'; operationalProfile?:OperationalProfile; operationalWorkload?:OperationalWorkload; operationalPendingClass?:OperationalRequestClass; operationalCredited?:boolean; operationalReserved?:boolean; perOrderBackground?:boolean; external:Partial<Record<ExternalKind,number>>; externalOutboundPayloadBytes:number; externalInboundPayloadBytes:number; uncertain: boolean };
export type ExternalKind='horizon'|'proof-dns'|'proof-http'|'provider'|'facilitator'|'rpc';
export const OPERATIONAL_STORAGE_CAPS={workspace:12*1048576,market:512*1024,review:1048576,settlement:128*1024,ledger:64*1024} as const;
const scope = new AsyncLocalStorage<Counts>();
export const operationalMeterEnabled = () => process.env.BAZAAR_OPERATIONAL_METER === 'true' && process.env.BAZAAR_ACCEPTANCE_METER !== 'true';
const enabled = () => process.env.BAZAAR_ACCEPTANCE_METER === 'true' || operationalMeterEnabled();
const limits = { redis: 32, commandsUpperBound: 224, outboundPayloadBytes: 4 * 1048576, inboundPayloadBytes: 8 * 1048576 };
const currentLimits = () => operationalMeterEnabled() ? operationalTransportEnvelope(scope.getStore()?.operationalProfile??'authenticated',scope.getStore()?.operationalWorkload) : limits;
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
const fresh=():Counts=>({redis:0,commandsUpperBound:0,outboundPayloadBytes:0,inboundPayloadBytes:0,workspaceStoredBytesUpperBound:0,marketStoredBytesUpperBound:0,reviewStoredBytesUpperBound:0,catalogStoredBytesUpperBound:0,settlementStoredBytesUpperBound:0,external:{horizon:0,'proof-dns':0,'proof-http':0,provider:0,...(x402Enabled()||operationalMeterEnabled()?{facilitator:0,rpc:0}:{})},externalOutboundPayloadBytes:0,externalInboundPayloadBytes:0,uncertain:false});
/** A native background dispatch has its own already-reserved work and must not
 * inherit the completed payment HTTP request's external counter through after().
 * This selects accounting only; the operation capability and native background
 * reservation remain mandatory. No request argument creates this boundary. */
export async function withPerOrderProductionBackgroundMeter<T>(operationId:string,handler:()=>Promise<T>):Promise<T>{
 if(!isPerOrderPaymentEnabled(operationId)||perOrderPaymentCapabilityKind(operationId)!=='production')throw Error('PER_ORDER_PAYMENTS_NOT_ENABLED');
 if(!enabled())return handler();
 const counts=fresh();counts.operationalProfile='authenticated';counts.operationalWorkload='seller-control';counts.perOrderBackground=true;
 return scope.run(counts,async()=>{try{return await handler();}catch(error){counts.uncertain=true;throw error;}finally{
  // These are background measurements, not another HTTP ingress reservation.
  // Use this fresh scope's counters, never an inherited completed HTTP clamp.
  console.info(JSON.stringify({operationalMeter:'v1',source:'api',background:'per-order-text-v1',requestId:randomUUID(),...operationalMetricTotals(counts,0),...counts}));
 }});
}
function record(counts:Counts,source:'api'|'ssr'|'proxy',requests=1){const catalog=catalogBudgetObservation(),control=continuousControlBudgetObservation(),wire=catalog??control;if(wire){counts.redis=wire.requests;counts.commandsUpperBound=wire.commands;counts.outboundPayloadBytes=wire.outboundBytes;counts.inboundPayloadBytes=wire.inboundBytes;}const requestId=randomUUID();console.info(JSON.stringify({...(operationalMeterEnabled()?{operationalMeter:'v1',...operationalMetricTotals(counts,requests),...(counts.storageObservation?{storagePressure:storagePressure(counts)}:{})}:{acceptanceMeter:x402Enabled()?'v2':'v1'}),source,requestId,...counts,...(catalog?{catalogInboundEvidence:'reserved-wire-upper-bound'}:{}),...(control?{controlInboundEvidence:'reserved-wire-upper-bound'}:{})}));return requestId;}
function storagePressure(counts:Counts) { return Object.fromEntries(Object.entries(OPERATIONAL_STORAGE_CAPS).map(([name,cap])=>{const bytes=counts[`${name as keyof typeof OPERATIONAL_STORAGE_CAPS}StoredBytesUpperBound`]??0;return [name,{bytes,cap,percent:Math.ceil(bytes*100/cap),alert:bytes*100>=cap*70}];})); }
async function gate(kind: OperationalRequestClass) { if (operationalMeterEnabled()) { const counts=scope.getStore(); if(counts){counts.operationalProfile=kind.profile;counts.operationalWorkload=kind.workload;}const { operationalRequestGate } = await import('./operational-budget.ts'); await operationalRequestGate(kind);if(counts)counts.operationalReserved=true; } }
/** An inner fresh-payment gate upgrades a recovered HTTP request to its payment transport bounds. */
export function setOperationalTransportProfile(profile: OperationalProfile, workload?:OperationalWorkload) {
  if(!operationalMeterEnabled())return;const counts=scope.getStore();if(counts){counts.operationalProfile=profile;counts.operationalWorkload=workload;}
}
/** Call only after authoritative credential and requested-role verification. No credential is recorded. */
export async function creditOperationalPrincipal() {
  if(!operationalMeterEnabled())return;const counts=scope.getStore();if(!counts)return;
  counts.operationalCredited=true;
  if(counts.operationalPendingClass&&!counts.operationalReserved)await gate(counts.operationalPendingClass);
}
type OperationalStore = 'workspace'|'market'|'review'|'catalog'|'settlement'|'ledger';
/** Projection evidence includes completion reservations; it is never a confirmed database size. */
export function recordOperationalStorageBounds(bounds: Partial<Record<OperationalStore, number|{committedBytes:number;reservedBytes:number}>>) {
  if (!operationalMeterEnabled()) return;
  const counts = scope.getStore(); if (!counts) throw Error('OPERATIONAL_SCOPE_REQUIRED');
  for (const [name, evidence] of Object.entries(bounds) as [OperationalStore,number|{committedBytes:number;reservedBytes:number}][]) {
    const values = typeof evidence === 'number' ? [evidence] : [evidence.committedBytes,evidence.reservedBytes];
    if (values.some(value=>!Number.isSafeInteger(value)||value<0)) throw Error('OPERATIONAL_STORAGE_EVIDENCE_INVALID');
    const bytes = values.reduce((total,value)=>total+value,0); if(!Number.isSafeInteger(bytes)) throw Error('OPERATIONAL_STORAGE_EVIDENCE_INVALID');
    counts[`${name}StoredBytesUpperBound`] = Math.max(counts[`${name}StoredBytesUpperBound`]??0,bytes);
  }
  counts.storageObservation='prospective-upper-bound';
}

/** SSR dynamic reads have their own logged scope; no bearer or payload is logged. */
export async function measuredRead<T>(handler:()=>T|Promise<T>):Promise<T>{
 if(!enabled()||scope.getStore())return handler();
 const counts=fresh();return scope.run(counts,async()=>{try{await gate({profile:'public',newOperation:false});return await handler();}finally{record(counts,'ssr');}});
}

export type ExternalPayloadEvidence=()=>{outboundBytes?:number;inboundBytes?:number};
/** One bounded transport invocation. A transport can supply exact raw body bytes, including a partial failed read. */
export async function meteredExternal<T>(kind:ExternalKind,handler:()=>Promise<T>,outbound?:unknown,evidence?:ExternalPayloadEvidence):Promise<T>{
 assertContinuousExternalAllowed();const limits=currentLimits();
 if(!enabled())return handler();const counts=scope.getStore();if(!counts)throw Error('ACCEPTANCE_SCOPE_REQUIRED');
 const operational=operationalMeterEnabled()?operationalTransportEnvelope(counts.operationalProfile??'authenticated',counts.operationalWorkload):undefined;
 if(!(kind in counts.external)||(counts.external[kind]??0)>=8||operational&&(Object.values(counts.external).reduce((n,value)=>n+(value??0),0)>=operational.externalRequests||counts.operationalProfile==='recovery'&&kind==='facilitator'))throw Error(operational?'OPERATIONAL_EXTERNAL_BUDGET':'ACCEPTANCE_EXTERNAL_BUDGET');
 const checkedBytes=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw Error('ACCEPTANCE_EXTERNAL_BYTE_EVIDENCE_INVALID');return value;};
 const before=evidence?.();const bytes=before?.outboundBytes===undefined?(outbound===undefined?0:Buffer.byteLength(JSON.stringify(outbound))):checkedBytes(before.outboundBytes);
 if(counts.externalOutboundPayloadBytes+bytes>(operational?.externalOutboundBytes??limits.outboundPayloadBytes))throw Error(operational?'OPERATIONAL_EXTERNAL_BUDGET':'ACCEPTANCE_EXTERNAL_BUDGET');
 counts.external[kind]=(counts.external[kind]??0)+1;counts.externalOutboundPayloadBytes+=bytes;
 let inboundRecorded=false;
 try{const result=await handler(),after=evidence?.();const inbound=after?.inboundBytes===undefined?Buffer.byteLength(JSON.stringify(result)??''):checkedBytes(after.inboundBytes);
 counts.externalInboundPayloadBytes+=inbound;inboundRecorded=true;if(counts.externalInboundPayloadBytes>(operational?.externalInboundBytes??limits.inboundPayloadBytes))throw Error(operational?'OPERATIONAL_EXTERNAL_RESPONSE_BUDGET':'ACCEPTANCE_EXTERNAL_RESPONSE_BUDGET');return result;}
 catch(error){counts.uncertain=true;
  if(!inboundRecorded&&evidence){const partial=evidence().inboundBytes;if(partial!==undefined)counts.externalInboundPayloadBytes+=checkedBytes(partial);}
  throw error;}
}

/** Only payload counts, never credentials, keys or record contents, reach responses. */
export function measuredHandler<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>, options: { source?: 'api'|'proxy'; budget?: boolean; classify?: (...args:A)=>OperationalRequestClass|Promise<OperationalRequestClass> } = {}) {
  const run = async (...args: A): Promise<Response> => {
    if (!enabled() || scope.getStore()) return handler(...args);
    const counts=fresh();
    return scope.run(counts, async () => {
      let response:Response;
      try {
        if (options.budget !== false) {
          const kind=options.classify ? await options.classify(...args) : await classifyOperationalRequest(args[0] instanceof Request ? args[0] : undefined);
          if(operationalMeterEnabled()&&kind.profile!=='public'&&!kind.bootstrapCreation&&args[0] instanceof Request){counts.operationalPendingClass=kind;counts.operationalProfile='public';}
          else await gate(kind);
        }
        response = await handler(...args);
        if(operationalMeterEnabled()&&counts.operationalPendingClass&&!counts.operationalReserved&&!counts.operationalCredited) {
          try{await gate({profile:'public',newOperation:false});}catch{counts.uncertain=true;}
        }
      } catch(error) {
        if(operationalMeterEnabled()&&counts.operationalPendingClass&&!counts.operationalReserved&&!counts.operationalCredited) {
          try{await gate({profile:'public',newOperation:false});}catch{counts.uncertain=true;}
        }
        if (operationalMeterEnabled() && error && typeof error === 'object' && 'code' in error && String(error.code).match(/^(?:OPERATIONAL_|NEW_OPERATIONS_PAUSED)/)) {
          response = Response.json({error:{code:String(error.code)}},{status:'status' in error ? Number(error.status):503,headers:{'Cache-Control':'private, no-store','Retry-After':'60'}});
        } else { record(counts,options.source??'api'); throw error; }
      }
      const requestId = record(counts,options.source??'api',options.source==='proxy'&&response.headers.get('x-middleware-next')==='1'?0:1);
      response.headers.set(operationalMeterEnabled()?'X-Bazaar-Operational-Request-Id':'X-Bazaar-Acceptance-Request-Id', requestId);
      response.headers.set(operationalMeterEnabled()?'X-Bazaar-Operational-Meter':'X-Bazaar-Acceptance-Meter', operationalMeterEnabled()?'v1':x402Enabled()?'v2':'v1');
      response.headers.set('X-Bazaar-Redis-Requests', String(counts.redis));
      response.headers.set('X-Bazaar-Redis-Commands-Upper-Bound', String(counts.commandsUpperBound));
      response.headers.set('X-Bazaar-Redis-Outbound-Payload-Bytes', String(counts.outboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Inbound-Payload-Bytes', String(counts.inboundPayloadBytes));
      response.headers.set('X-Bazaar-Workspace-Stored-Bytes-Upper-Bound', String(counts.workspaceStoredBytesUpperBound));
      for(const name of ['market','review','catalog'] as const)response.headers.set('X-Bazaar-'+name+'-Stored-Bytes-Upper-Bound',String(counts[`${name}StoredBytesUpperBound`]));
      if(x402Enabled()||operationalMeterEnabled())response.headers.set('X-Bazaar-Settlement-Stored-Bytes-Upper-Bound',String(counts.settlementStoredBytesUpperBound));
      if(operationalMeterEnabled()) {
        response.headers.set('X-Bazaar-Ledger-Stored-Bytes-Upper-Bound',String(counts.ledgerStoredBytesUpperBound??0));response.headers.set('X-Bazaar-Storage-Observation',counts.storageObservation??'not-observed');
        if(counts.storageObservation)for(const[name,value]of Object.entries(storagePressure(counts))){response.headers.set('X-Bazaar-'+name+'-Storage-Pressure-Percent',String(value.percent));response.headers.set('X-Bazaar-'+name+'-Storage-Alert',String(value.alert));}
      }
      for(const kind of Object.keys(counts.external) as ExternalKind[])response.headers.set('X-Bazaar-External-'+kind,String(counts.external[kind]));
      response.headers.set('X-Bazaar-External-Outbound-Payload-Bytes',String(counts.externalOutboundPayloadBytes));
      response.headers.set('X-Bazaar-External-Inbound-Payload-Bytes',String(counts.externalInboundPayloadBytes));
      response.headers.set('X-Bazaar-Redis-Uncertain', String(counts.uncertain));
      return response;
    });
  };
  return async (...args:A):Promise<Response>=>{
    const request=args[0] instanceof Request?args[0]:undefined;
    const kind=request?await classifyOperationalRequest(request):{profile:'public' as const,newOperation:false};
    const authenticated=request?.headers.has('authorization')??false;
    return withCatalogBudget(kind,authenticated,()=>withContinuousControlBudget(kind,authenticated,()=>run(...args),{request}),{mcp:request!==undefined&&new URL(request.url).pathname==='/api/mcp'});
  };
}

type RedisMiddleware = Parameters<Redis['use']>[0];
/** Operational accounting uses the same transport hook and never inspects or logs secrets. */
async function operationalRedisRequest(counts: Counts, request: Parameters<RedisMiddleware>[0], next: Parameters<RedisMiddleware>[1]) {
  // Catalogue's exact native-script guard ran before this middleware. Its
  // conservative wire/command limits also apply with the optional meter off.
  // Other workloads retain the unchanged generic script/loop restrictions.
  if(catalogBudgetObservation()||continuousControlBudgetObservation()||guardianBudgetObservation()){
   if(!counts.perOrderBackground)return next(request);
   try{return await next(request);}finally{const wire=continuousControlBudgetObservation();if(wire){counts.redis=wire.requests;counts.commandsUpperBound=wire.commands;counts.outboundPayloadBytes=wire.outboundBytes;counts.inboundPayloadBytes=wire.inboundBytes;}}
  }
  const prefix = process.env.BAZAAR_WORKSPACE_PREFIX;
  if (!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(prefix ?? '')) throw Error('OPERATIONAL_NAMESPACE_REQUIRED');
  const suffix = prefix!.slice('bazaar-workspace:'.length), allowed = [prefix!, 'bazaar-market:' + suffix, 'bazaar-review:' + suffix];
  const body = request.body;
  if (!Array.isArray(body) || typeof body[0] !== 'string') throw Error('OPERATIONAL_COMMAND_REQUIRED');
  const command = body[0].toLowerCase(); let keys: unknown[], commandBound: number;
  if (command === 'eval') {
    const script = body[1], keyCount = Number(body[2]);
    if (typeof script !== 'string' || !Number.isInteger(keyCount) || keyCount < 1 || keyCount > 8 || /\b(for|while|repeat)\b/.test(script) || !/redis\.call/.test(script)) throw Error('OPERATIONAL_SCRIPT_UNBOUNDED');
    keys = body.slice(3, 3 + keyCount); commandBound = 1 + (script.match(/redis\.call\s*\(/g)?.length ?? 0);
    if (keys.some(key => key === prefix + ':operations-budget:state')) {
      const value = body[3 + keyCount + 2];
      if (keys.length !== 1 || typeof value !== 'string' || Buffer.byteLength(value) > 65536) throw Error('OPERATIONAL_LEDGER_BUDGET');
      recordOperationalStorageBounds({ledger:Buffer.byteLength(value)+Buffer.byteLength(String(keys[0]))});
    }
  } else if (['get', 'mget', 'smembers', 'exists', 'strlen', 'scard'].includes(command)) { keys = body.slice(1); commandBound = 1; }
  else throw Error('OPERATIONAL_COMMAND_DENIED');
  if (!keys.length || keys.some(key => typeof key !== 'string' || !allowed.some(namespace => key.startsWith(namespace + ':')))) throw Error('OPERATIONAL_KEY_DENIED');
  const limits = currentLimits(), outbound = Buffer.byteLength(JSON.stringify(body));
  if (counts.redis + 1 > limits.redis || counts.commandsUpperBound + commandBound > limits.commandsUpperBound || counts.outboundPayloadBytes + outbound > limits.outboundPayloadBytes || counts.inboundPayloadBytes >= limits.inboundPayloadBytes) throw Error('OPERATIONAL_REQUEST_BUDGET');
  counts.redis++; counts.commandsUpperBound += commandBound; counts.outboundPayloadBytes += outbound;
  try {
    const response = await next(request);
    counts.inboundPayloadBytes += Buffer.byteLength(JSON.stringify(response));
    if (response.error || counts.inboundPayloadBytes > limits.inboundPayloadBytes) { counts.uncertain = true; throw Error('OPERATIONAL_REDIS_RESULT_UNCONFIRMED'); }
    return response;
  } catch (error) { counts.uncertain = true; throw error; }
}

export function meteredRedis(redis: Redis): Redis {
  catalogBudgetRedis(redis);
  continuousControlBudgetRedis(redis);
  guardianBudgetRedis(redis);
  redis.use(async (request, next) => {
    if (!enabled()) return next(request);
    const counts = scope.getStore();
    if (!counts) throw Error(operationalMeterEnabled()?'OPERATIONAL_SCOPE_REQUIRED':'ACCEPTANCE_SCOPE_REQUIRED');
    if (operationalMeterEnabled()) return operationalRedisRequest(counts, request, next);
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
