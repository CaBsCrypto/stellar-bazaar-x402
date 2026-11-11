import {PILOT_REVIEW_READ_LUA,PILOT_REVIEW_MAX_BYTES} from './pilot-review-transport.ts';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {Redis} from '@upstash/redis';
import type {OperationalRequestClass} from './operational-pressure.ts';
import {WorkspaceError} from './workspace-types.ts';
import {workspaceRegistryTransportMaximum,COMPACT_WORKSPACE_REGISTRY_MAX_BYTES,COMPACT_WORKSPACE_REGISTRY_V2_MAX_BYTES,isCompactWorkspaceTransport} from './quota-registry-patch.ts';
import {compactTransportV2,freePlanTransportProfile,READ_BOUNDED_MARKET_VALUE_LUA} from './free-plan-transport-profile.ts';

const MiB=1048576,KiB=1024;
export const CATALOG_BUDGET=Object.freeze({anonymous:Object.freeze({commands:64,wireBytes:16*MiB}),authenticated:Object.freeze({commands:112,wireBytes:36*MiB}),compactAnonymous:Object.freeze({commands:64,wireBytes:6*MiB}),compactAuthenticated:Object.freeze({commands:112,wireBytes:10*MiB}),compactV2Anonymous:Object.freeze({commands:64,wireBytes:4*MiB}),compactV2Authenticated:Object.freeze({commands:112,wireBytes:5*MiB}),responseBytes:128*KiB,mcpResponseBytes:512*KiB,httpAllowanceBytes:640*KiB});
export function catalogBudgetLimits(authenticated:boolean){return compactTransportV2()?authenticated?CATALOG_BUDGET.compactV2Authenticated:CATALOG_BUDGET.compactV2Anonymous:isCompactWorkspaceTransport()?authenticated?CATALOG_BUDGET.compactAuthenticated:CATALOG_BUDGET.compactAnonymous:authenticated?CATALOG_BUDGET.authenticated:CATALOG_BUDGET.anonymous;}
type Observation={commands:number,outboundBytes:number,inboundBytes:number,requests:number};
type Context={authenticated:boolean;compactRegistry:boolean;limit:{readonly commands:number;readonly wireBytes:number};observation:Observation;failed:boolean};
const scope=new AsyncLocalStorage<Context>();
const failure=()=>new WorkspaceError('CATALOG_TRANSPORT_BUDGET',503,60);
const eligible=(kind:OperationalRequestClass)=>kind.profile==='public'&&!kind.newOperation&&kind.workload==='catalog';

/** The scope is created from the server classifier and the actual HTTP header.
 * Caller arguments cannot choose a cheaper class or an operation's hold. */
export async function withCatalogBudget<T>(kind:OperationalRequestClass,authenticated:boolean,handler:()=>Promise<T>,options:{mcp?:boolean}={}):Promise<T|Response>{
 if(scope.getStore()||!eligible(kind))return handler();
 const compactRegistry=isCompactWorkspaceTransport();
 const context:Context={authenticated,compactRegistry,limit:catalogBudgetLimits(authenticated),observation:{commands:0,outboundBytes:0,inboundBytes:0,requests:0},failed:false};
 return scope.run(context,async()=>{
  const result=await handler();
  if(result instanceof Response){const copy=result.clone(),reader=copy.body?.getReader();let bytes=0;
   const maximum=options.mcp?CATALOG_BUDGET.mcpResponseBytes:CATALOG_BUDGET.responseBytes;
   if(reader)try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maximum){void reader.cancel();return Response.json({error:{code:'CATALOG_TRANSPORT_BUDGET'}},{status:503,headers:{'Cache-Control':'private, no-store','Retry-After':'60'}});}}}finally{reader.releaseLock();}
  }
  return result;
 });
}
export function catalogBudgetReservation(kind:OperationalRequestClass&{operationId?:string;principalHash?:string;operationLookup?:boolean;bootstrapCreation?:boolean}){
 const context=scope.getStore();
 if(!context||context.failed||!eligible(kind)||kind.operationId!==undefined||kind.principalHash!==undefined||kind.operationLookup||kind.bootstrapCreation)return undefined;
 return {commands:context.limit.commands,transferBytes:context.limit.wireBytes+CATALOG_BUDGET.httpAllowanceBytes};
}
export function catalogBudgetObservation(){const current=scope.getStore();return current?{...current.observation,authenticated:current.authenticated,compactRegistry:current.compactRegistry,commandLimit:current.limit.commands,wireLimit:current.limit.wireBytes}:undefined;}
export type NativeRedisDescriptor={commands:number;responseBytes:number;keys:string[];registryMaximumBytes?:number};
type Script={script:string;keyCount:number;argCount:number;commands:number;responseBytes:number;keyKinds:string[];registryMaximumBytes?:number};
const nativeScripts=new Map<string,Promise<ReadonlyArray<Script>>>();
async function scripts(){
 const cacheKey=String(process.env.BAZAAR_WORKSPACE_PREFIX)+'|'+String(freePlanTransportProfile());
 const existing=nativeScripts.get(cacheKey);if(existing)return existing;
 const result=Promise.all([import('./workspace-store.ts'),import('./continuous-free-budget.ts'),import('./continuous-free-storage.ts'),import('./marketplace-capacity.ts')]).then(async([workspace,budget,storage,capacity])=>{
  const prefix=process.env.BAZAAR_WORKSPACE_PREFIX;
  if(!/^bazaar-workspace:pilot-[a-f0-9]{32}$/.test(prefix??''))throw failure();
  const patch=await storage.prepareContinuousStorageCommit({eval:async()=>{throw failure();}},prefix!,[]);
  if(!patch)throw failure();
  const workspaceKeys=['registry','owner','initialized'],commitKeys=[...workspaceKeys,'maintenance'];
  const rows:Script[]=[
   {script:budget.CONTINUOUS_FREE_BUDGET_LUA,keyCount:1,argCount:2,commands:4,responseBytes:8192,keyKinds:['continuous-free-budget:v1']},
   {script:workspace.READ_WORKSPACE_LUA,keyCount:3,argCount:0,commands:4,responseBytes:2*(MiB+128*KiB+512)+8192,keyKinds:workspaceKeys},
   {script:workspace.READ_MARKET_PERMISSION_LUA,keyCount:4,argCount:0,commands:5,responseBytes:2*(MiB+128*KiB+4*KiB+512)+8192,keyKinds:[...workspaceKeys,'permission']},
   {script:workspace.READ_CONTINUOUS_WORKSPACE_STORAGE_LUA,keyCount:1,argCount:0,commands:2,responseBytes:4_000_000+8192,keyKinds:['continuous-free-storage:v1']},
   {script:workspace.READ_WORKSPACE_MAINTENANCE_LUA,keyCount:1,argCount:0,commands:3,responseBytes:2*(512+64)+8192,keyKinds:['maintenance']},
   {script:workspace.READ_COMPACT_WORKSPACE_LUA,keyCount:3,argCount:0,commands:4,responseBytes:2*(128*KiB+128*KiB+512)+8192,keyKinds:workspaceKeys},
   {script:workspace.READ_COMPACT_MARKET_PERMISSION_LUA,keyCount:4,argCount:0,commands:5,responseBytes:2*(128*KiB+128*KiB+4*KiB+512)+8192,keyKinds:[...workspaceKeys,'permission']},
   {script:workspace.READ_COMPACT_V2_WORKSPACE_LUA,keyCount:3,argCount:0,commands:4,responseBytes:2*(32*KiB+128*KiB+512)+8192,keyKinds:workspaceKeys},
   {script:workspace.READ_COMPACT_V2_REGISTRY_LUA,keyCount:3,argCount:0,commands:4,responseBytes:2*(32*KiB+512)+8192,keyKinds:workspaceKeys},
   {script:workspace.READ_COMPACT_V2_MARKET_PERMISSION_LUA,keyCount:4,argCount:0,commands:5,responseBytes:2*(32*KiB+128*KiB+4*KiB+512)+8192,keyKinds:[...workspaceKeys,'permission']},
   {script:workspace.COMMIT_CONTINUOUS_WORKSPACE_LUA,keyCount:4,argCount:6,commands:8,responseBytes:8192,keyKinds:commitKeys},
   {script:workspace.COMMIT_CONTINUOUS_WORKSPACE_LUA.replace("redis.call('SET', KEYS[1], ARGV[4])",patch.appendScript(5,7)+patch.writeScript(5)+"redis.call('SET', KEYS[1], ARGV[4])"),keyCount:5,argCount:8,commands:10,responseBytes:8192,keyKinds:[...commitKeys,'continuous-free-storage:v1']},
   {script:workspace.COMMIT_CONTINUOUS_WORKSPACE_QUOTA_LUA,keyCount:4,argCount:6,commands:8,responseBytes:8192,keyKinds:commitKeys},
   {script:workspace.COMMIT_CONTINUOUS_WORKSPACE_QUOTA_LUA.replace("redis.call('SET', KEYS[1], quotaRegistryNext)",patch.appendScript(5,7)+patch.writeScript(5)+"redis.call('SET', KEYS[1], quotaRegistryNext)"),keyCount:5,argCount:8,commands:10,responseBytes:8192,keyKinds:[...commitKeys,'continuous-free-storage:v1']},
   {script:workspace.COMMIT_COMPACT_CONTINUOUS_WORKSPACE_LUA,keyCount:4,argCount:6,commands:8,responseBytes:8192,keyKinds:commitKeys},
   {script:workspace.COMMIT_COMPACT_CONTINUOUS_WORKSPACE_LUA.replace("redis.call('SET', KEYS[1], ARGV[4])",patch.appendScript(5,7)+patch.writeScript(5)+"redis.call('SET', KEYS[1], ARGV[4])"),keyCount:5,argCount:8,commands:10,responseBytes:8192,keyKinds:[...commitKeys,'continuous-free-storage:v1']},
   {script:workspace.COMMIT_COMPACT_CONTINUOUS_WORKSPACE_QUOTA_LUA,keyCount:4,argCount:6,commands:8,responseBytes:8192,keyKinds:commitKeys},
   {script:workspace.COMMIT_COMPACT_CONTINUOUS_WORKSPACE_QUOTA_LUA.replace("redis.call('SET', KEYS[1], quotaRegistryNext)",patch.appendScript(5,7)+patch.writeScript(5)+"redis.call('SET', KEYS[1], quotaRegistryNext)"),keyCount:5,argCount:8,commands:10,responseBytes:8192,keyKinds:[...commitKeys,'continuous-free-storage:v1']},
   {script:workspace.COMMIT_COMPACT_V2_CONTINUOUS_WORKSPACE_LUA,keyCount:4,argCount:6,commands:8,responseBytes:8192,keyKinds:commitKeys},
   {script:workspace.COMMIT_COMPACT_V2_CONTINUOUS_WORKSPACE_LUA.replace("redis.call('SET', KEYS[1], ARGV[4])",patch.appendScript(5,7)+patch.writeScript(5)+"redis.call('SET', KEYS[1], ARGV[4])"),keyCount:5,argCount:8,commands:10,responseBytes:8192,keyKinds:[...commitKeys,'continuous-free-storage:v1']},
   {script:workspace.COMMIT_COMPACT_V2_CONTINUOUS_WORKSPACE_QUOTA_LUA,keyCount:4,argCount:6,commands:8,responseBytes:8192,keyKinds:commitKeys},
   {script:workspace.COMMIT_COMPACT_V2_CONTINUOUS_WORKSPACE_QUOTA_LUA.replace("redis.call('SET', KEYS[1], quotaRegistryNext)",patch.appendScript(5,7)+patch.writeScript(5)+"redis.call('SET', KEYS[1], quotaRegistryNext)"),keyCount:5,argCount:8,commands:10,responseBytes:8192,keyKinds:[...commitKeys,'continuous-free-storage:v1']},
  ];
  const {appendPublicRegistrationGuard}=await import('./public-registration-budget.ts');
  // Exact native bootstrap variants only: one read-only budget guard is
  // appended inside the already measured registry/storage transaction.
  for(const row of [...rows])if(row.keyCount===5&&row.argCount===8&&row.keyKinds[0]==='registry'&&row.keyKinds[4]==='continuous-free-storage:v1'&&row.script.includes("redis.call('SET', KEYS[1], ARGV[4])")){
   const script=appendPublicRegistrationGuard(row.script,6,9,10);
   rows.push({...row,script,keyCount:6,argCount:10,commands:row.commands+2,keyKinds:[...row.keyKinds,'continuous-free-budget:v1']});
  }
  const root=prefix!+':{'+prefix!.slice('bazaar-workspace:'.length)+'}:',guardKeys=[root+'registry',root+'owner:ow_'+'2'.repeat(32)];
  for(let guards=0;guards<=2;guards++){
   let marketScript:Script|undefined;
   const keyKinds=['market:state','market:x402-settlements:state','market:capacity-reservations:v1',...['registry','permission'].slice(0,guards),'market:maintenance-index:v1','continuous-free-storage:v1'];
   await capacity.commitCapacityStore({get:async()=>null,eval:async(script,keys,args)=>{if(script===READ_BOUNDED_MARKET_VALUE_LUA)return null;marketScript={script,keyCount:keys.length,argCount:args.length,commands:1+(script.match(/redis\.call\s*\(/g)?.length??0),responseBytes:8192,keyKinds};return 1;}},prefix!.replace('workspace','market'),'market',null,JSON.stringify({version:1,revision:'22222222-2222-4222-8222-222222222222',state:{version:1,services:[],orders:[]}}),guards?{keys:guardKeys.slice(0,guards),values:Array(guards).fill(null)}:undefined);
   if(!marketScript)throw failure();const row=marketScript as Script;rows.push(row);
   // The delivery CAS uses the same native writer with one operation release.
   // Insert the exported native budget append exactly at its native positions.
   const keyIndex=row.keyCount+1,configArg=row.argCount+1;
   const releaseScript=row.script.replace("\nif ARGV[7]~='' then",budget.continuousFreeOperationCommitScript(keyIndex,configArg,configArg+1)+"\nif ARGV[7]~='' then").replace('return 1',`redis.call('SET',KEYS[${keyIndex}],budgetNext)\nreturn 1`);
   rows.push({script:releaseScript,keyCount:keyIndex,argCount:row.argCount+2,commands:1+(releaseScript.match(/redis\.call\s*\(/g)?.length??0),responseBytes:8192,keyKinds:[...keyKinds,'continuous-free-budget:v1']});
  }
  // Retention's native compound CAS has no authority slots. Its index,
  // storage and optional batch release use these fixed native positions.
  for(const releaseBudget of [false,true]){
   let beforeWrites="local indexOld=redis.call('GET',KEYS[4])\nif ARGV[15]=='missing' then if indexOld then return 0 end else if not indexOld or indexOld~=ARGV[16] then return 0 end end\n";
   let afterWrites="redis.call('SET',KEYS[4],ARGV[17])\n";
   beforeWrites+=patch.appendScript(5,18);afterWrites+=patch.writeScript(5);
   if(releaseBudget){beforeWrites+=budget.continuousFreeReleaseBatchCommitScript(6,20,21);afterWrites+="redis.call('SET',KEYS[6],budgetNext)\n";}
   const script=capacity.marketCapacityCommitScript().replace("if ARGV[7]~='' then",beforeWrites+"\nif ARGV[7]~='' then").replace('return 1',afterWrites+'return 1');
   rows.push({script,keyCount:releaseBudget?6:5,argCount:releaseBudget?21:19,commands:1+(script.match(/redis\.call\s*\(/g)?.length??0),responseBytes:8192,keyKinds:['market:state','market:x402-settlements:state','market:capacity-reservations:v1','market:maintenance-index:v1','continuous-free-storage:v1',...(releaseBudget?['continuous-free-budget:v1']:[])]});
  }
  // These native scripts iterate JSON, with no Redis calls inside a loop.
  // Explicit weights must still agree with every possible native Redis call.
  if(rows.some(row=>1+(row.script.match(/redis\.call\s*\(/g)?.length??0)!==row.commands))throw failure();
  const boundedWorkspace=[workspace.READ_COMPACT_WORKSPACE_LUA,workspace.READ_COMPACT_MARKET_PERMISSION_LUA,workspace.COMMIT_COMPACT_CONTINUOUS_WORKSPACE_LUA,workspace.COMMIT_COMPACT_CONTINUOUS_WORKSPACE_QUOTA_LUA];
  return Object.freeze(rows.map(row=>{
   // Capacity guards compare snapshots internally and return a scalar. Read
   // and workspace-writer variants explicitly identify their native cap.
   if(!row.script.startsWith('-- bazaar-market-capacity-cas-v1')&&row.keyKinds.includes('registry'))row.registryMaximumBytes=row.script.includes('#registry>32768')?32*KiB:boundedWorkspace.some(base=>row.script===base||row.script.includes('if #registry>131072'))?128*KiB:MiB;
   return Object.freeze(row);
  }));
 });nativeScripts.set(cacheKey,result);return result;
}
function keyResponseBytes(key:string,prefix:string){
 const tag=prefix.slice('bazaar-workspace:'.length),workspace=prefix+':{'+tag+'}:',market='bazaar-market:'+tag+':',review='bazaar-review:'+tag+':';
 if(key.startsWith(workspace)){
  const suffix=key.slice(workspace.length);
  if(suffix==='registry')return 2*MiB+8192;
  if(/^owner:(?:none|ow_[a-f0-9]{32})$/.test(suffix))return 256*KiB+8192;
  if(/^market-permissions:ow_[a-f0-9]{32}$/.test(suffix))return 8*KiB+8192;
  if(suffix==='continuous-free-storage:v1')return 4_000_000+8192;
  if(suffix==='continuous-free-budget:v1')return 512*KiB+8192;
  if(['initialized','maintenance'].includes(suffix))return 9216;
 }
 if(key===market+'state')return MiB+8192;
 if(key===market+'capacity-reservations:v1')return 128*KiB+8192;
 if(key===market+'x402-settlements:state')return 256*KiB+8192;
 if(key===market+'maintenance-index:v1')return 9216;
 if(key===review+'state')return 2*MiB+8192;
 throw failure();
}
export async function nativeRedisDescriptor(body:unknown):Promise<NativeRedisDescriptor>{
 const prefix=process.env.BAZAAR_WORKSPACE_PREFIX;
 if(!/^bazaar-workspace:(?:pilot-[a-f0-9]{32}|isolated-[a-f0-9]{32}|local-test|preview|production)$/.test(prefix??''))throw failure();
 if(!Array.isArray(body)||typeof body[0]!=='string')throw failure();
 const perOrder=await (await import('./per-order-transport-budget.ts')).perOrderNativeRedisDescriptor(body);if(perOrder)return perOrder;
 const command=body[0].toLowerCase();
 if(command==='eval'&&body[1]===PILOT_REVIEW_READ_LUA){
  const key='bazaar-review:'+prefix!.slice('bazaar-workspace:'.length)+':state';
  if(body.length!==4||Number(body[2])!==1||body[3]!==key)throw failure();
  return {commands:2,responseBytes:2*PILOT_REVIEW_MAX_BYTES+8192,keys:[key]};
 }
 if(command==='get'&&body.length===2&&typeof body[1]==='string')return {commands:1,responseBytes:keyResponseBytes(body[1],prefix!),keys:[body[1]]};
 if(compactTransportV2()&&command==='eval'&&body[1]===READ_BOUNDED_MARKET_VALUE_LUA){
  if(body.length!==5||Number(body[2])!==1||typeof body[3]!=='string'||typeof body[4]!=='string')throw failure();
  const market='bazaar-market:'+prefix!.slice('bazaar-workspace:'.length)+':',suffix=body[3].startsWith(market)?body[3].slice(market.length):'',maximum=suffix==='state'||suffix==='x402-settlements:state'?128*KiB:suffix==='capacity-reservations:v1'?64*KiB:suffix==='maintenance-index:v1'?512:undefined;
  if(maximum===undefined||body[4]!==String(maximum))throw failure();
  return {commands:2,responseBytes:2*maximum+8192,keys:[body[3]]};
 }
 if(command!=='eval'||typeof body[1]!=='string'||!['number','string'].includes(typeof body[2]))throw failure();
 const keys=Number(body[2]),row=(await scripts()).find(row=>row.script===body[1]&&row.keyCount===keys&&row.argCount===body.length-3-keys);
 if(!row||body.slice(3+keys).some(value=>typeof value!=='string'))throw failure();
 const actual=body.slice(3,3+keys);if(actual.some(key=>typeof key!=='string'||Buffer.byteLength(key)>512))throw failure();
 const tag=prefix!.slice('bazaar-workspace:'.length),root=prefix+':{'+tag+'}:',market='bazaar-market:'+tag+':';
 for(let i=0;i<actual.length;i++){
  const key=actual[i] as string,kind=row.keyKinds[i];
  const valid=kind==='owner'?key.startsWith(root)&&/^owner:(?:none|ow_[a-f0-9]{32})$/.test(key.slice(root.length)):kind==='permission'?key.startsWith(root)&&/^market-permissions:ow_[a-f0-9]{32}$/.test(key.slice(root.length)):kind.startsWith('market:')?key===market+kind.slice(7):key===root+kind;
  if(!valid)throw failure();
 }
 for(const key of actual)keyResponseBytes(key,prefix!);
 return {commands:row.commands,responseBytes:row.responseBytes,keys:actual,...(row.registryMaximumBytes===undefined?{}:{registryMaximumBytes:row.registryMaximumBytes})};
}
type Middleware=Parameters<Redis['use']>[0];
/** Reserve the following response before dispatch, including parallel reads.
 * Unknown scripts/keys fail before dispatch. No credential or payload is logged. */
export async function catalogRedisRequest(request:Parameters<Middleware>[0],next:Parameters<Middleware>[1]){
 const context=scope.getStore();if(!context)return next(request);
 if(context.failed)throw failure();
 try{const d=await nativeRedisDescriptor(request.body),outbound=Buffer.byteLength(JSON.stringify(request.body));
 const observation=context.observation;
 if(context.compactRegistry&&d.registryMaximumBytes!==undefined&&d.registryMaximumBytes!==workspaceRegistryTransportMaximum())throw failure();
 if(context.failed||observation.commands+d.commands>context.limit.commands||observation.outboundBytes+observation.inboundBytes+outbound+d.responseBytes>context.limit.wireBytes)throw failure();
 observation.commands+=d.commands;observation.outboundBytes+=outbound;observation.inboundBytes+=d.responseBytes;observation.requests++;
 const response=await next(request),bytes=Buffer.byteLength(JSON.stringify(response)??'');
 if(bytes>d.responseBytes||response&&typeof response==='object'&&'error' in response&&response.error)throw failure();
 // The SDK can decode base64 before this middleware receives the result.
 // Keep the full reserved wire allocation; decoded JSON is no refund proof.
 return response;
 }catch{context.failed=true;throw failure();}
}
const wrapped=new WeakSet<object>();
export function catalogBudgetRedis(redis:Redis):Redis{if(!wrapped.has(redis)){wrapped.add(redis);redis.use(catalogRedisRequest);}return redis;}
