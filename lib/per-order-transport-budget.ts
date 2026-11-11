import {WorkspaceError} from './workspace-types.ts';
import {continuousPerOrderStorage} from './per-order-storage-profile.ts';
import {MARKET_ORDER_REPOSITORY_READ,MARKET_ORDER_REPOSITORY_HISTORY_READ,MARKET_ORDER_REPOSITORY_PAGE,MARKET_ORDER_REPOSITORY_HISTORY_PAGE,MARKET_ORDER_REPOSITORY_BATCH_READ,MARKET_ORDER_REPOSITORY_ADMISSION_PAGE} from './market-order-repository-lua.ts';
import type {NativeRedisDescriptor} from './catalog-budget.ts';
import {createHash} from 'node:crypto';

const uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const original='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
const fail=()=>new WorkspaceError('PER_ORDER_TRANSPORT_BUDGET',503,60);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const scriptCache=new Map<string,Promise<ReadonlyArray<{script:string;keyCount:number;argCount:number;guardCount:number;hasOperation:boolean}>>>();
async function compoundScripts(prefix:string){let rows=scriptCache.get(prefix);if(!rows){rows=(async()=>{const {perOrderContinuousScriptDescriptor}=await import('./market-order-budget-commit.ts');const result=[];for(let guardCount=0;guardCount<=8;guardCount++)for(const hasOperation of [false,true])result.push(await perOrderContinuousScriptDescriptor(prefix,guardCount,hasOperation));return result;})();scriptCache.set(prefix,rows);}return rows;}
function ownOperation(value:string){return new RegExp('^'+uuid+'$').test(value)&&value!==original;}
function compoundKeys(keys:string[],args:string[],guardCount:number,namespace:string,prefix:string){
 let next:{operationId?:unknown;buyerOwnerId?:unknown;sellerOwnerId?:unknown;budgetProfile?:unknown;settlement?:{authorizationFingerprint?:unknown}};
 try{if(Buffer.byteLength(args[2])>196608||Buffer.byteLength(args[12])>196608)throw Error();next=JSON.parse(args[2]);}catch{throw fail();}
 if(next.budgetProfile==='batch-v1'){if(Buffer.byteLength(args[1])>101390||Buffer.byteLength(args[2])>101390||Buffer.byteLength(args[12])>51376)throw fail();if(args[1]){let old;try{old=JSON.parse(args[1]);}catch{throw fail();}if(old.budgetProfile!=='batch-v1')throw fail();}}
 const id=args[5],buyer=next.buyerOwnerId,seller=next.sellerOwnerId,fp=args[8];
 if(!ownOperation(id)||next.operationId!==id||typeof buyer!=='string'||typeof seller!=='string'||!/^ow_[a-f0-9]{32}$/.test(buyer)||!/^ow_[a-f0-9]{32}$/.test(seller)||fp!==''&&!/^[a-f0-9]{64}$/.test(fp))throw fail();
 const buyerIndex=namespace+'buyer:'+hash(buyer),sellerIndex=namespace+'seller:'+hash(seller),pending=namespace+'seller-pending:'+hash(seller),buyerParticipant=namespace+'participant:'+hash(buyer),sellerParticipant=namespace+'participant:'+hash(seller),work=namespace+'work';
 const root=prefix+':{'+prefix.slice('bazaar-workspace:'.length)+'}:',market=process.env.BAZAAR_MARKET_PREFIX!;
 const expected=[namespace+'operation:'+id,buyerIndex,sellerIndex,work,buyerIndex+':revision',sellerIndex+':revision',market+':state',market+':x402-settlements:state',namespace+'authorization:'+(fp||'none:'+id),pending,pending+':revision',buyerParticipant,sellerParticipant,buyerParticipant+':revision',sellerParticipant+':revision',work+':revision',namespace+'history:'+id,namespace+'allocation:'+id,root+'continuous-free-storage:v1',root+'continuous-free-budget:v1',namespace+'admission:'+id];
 if(expected.some((key,index)=>keys[index]!==key))throw fail();
 let guards:unknown;try{if(Buffer.byteLength(args[10])>1048576)throw Error();guards=JSON.parse(args[10]);}catch{throw fail();}
 if(!Array.isArray(guards)||guards.length!==guardCount)throw fail();
 for(let i=0;i<guardCount;i++){
  const key=keys[21+i],value=guards[i];let maximum:number|undefined;
  if(key===root+'registry')maximum=32768;
  else if(key.startsWith(root)&&/^owner:ow_[a-f0-9]{32}$/.test(key.slice(root.length)))maximum=131072;
  else if(key.startsWith(root)&&/^market-permissions:ow_[a-f0-9]{32}$/.test(key.slice(root.length)))maximum=4096;
  else if(key===market+':state'||key===market+':x402-settlements:state')maximum=131072;
  else if(key.startsWith(namespace)&&/^(?:buyer|seller|seller-pending|participant):[a-f0-9]{64}:revision$/.test(key.slice(namespace.length)))maximum=36;
  else if(key===work+':revision')maximum=36;
  if(maximum===undefined||value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>maximum))throw fail();
 }
 if(Buffer.byteLength(args[13])>512||Buffer.byteLength(args[14])>512||Buffer.byteLength(args[16])>16384||Buffer.byteLength(args[17])>2048||Buffer.byteLength(args[18])>2048||Buffer.byteLength(args[19])>4096||Buffer.byteLength(args[20])>4096)throw fail();
}
/** Exact source-script descriptors, not a prefix bypass. The wire reservation
 * assumes the maximum JSON escaping of every bounded Redis return value. */
export async function perOrderNativeRedisDescriptor(body:unknown):Promise<NativeRedisDescriptor|undefined>{
 if(!continuousPerOrderStorage())return undefined;
 if(!Array.isArray(body)||typeof body[0]!=='string'||body[0].toLowerCase()!=='eval'||typeof body[1]!=='string')return undefined;
 const namespace=process.env.BAZAAR_MARKET_PREFIX!+':orders:v2:';
 const {MARKET_ORDER_REPOSITORY_ADMISSION_READ}=await import('./market-order-repository-lua.ts');
 const known=[MARKET_ORDER_REPOSITORY_READ,MARKET_ORDER_REPOSITORY_HISTORY_READ,MARKET_ORDER_REPOSITORY_PAGE,MARKET_ORDER_REPOSITORY_HISTORY_PAGE,MARKET_ORDER_REPOSITORY_ADMISSION_READ,MARKET_ORDER_REPOSITORY_BATCH_READ,MARKET_ORDER_REPOSITORY_ADMISSION_PAGE];
 const compound=known.includes(body[1])?undefined:(await compoundScripts(process.env.BAZAAR_WORKSPACE_PREFIX!)).find(row=>row.script===body[1]);
 if(!known.includes(body[1])&&!compound)return undefined;
 if(!['number','string'].includes(typeof body[2]))throw fail();
 const count=Number(body[2]);if(!Number.isSafeInteger(count)||count<1||count>29)throw fail();
 const keys=body.slice(3,3+count),args=body.slice(3+count);if(keys.length!==count||keys.some(key=>typeof key!=='string'||Buffer.byteLength(key)>512)||args.some(arg=>typeof arg!=='string'))throw fail();
 if(compound){
  if(count!==compound.keyCount||args.length!==compound.argCount)throw fail();
  compoundKeys(keys as string[],args as string[],compound.guardCount,namespace,process.env.BAZAAR_WORKSPACE_PREFIX!);
  // TYPE executes once for every supplied key; guard GET executes once for
  // every authority snapshot. All other Redis calls are outside loops. The
  // static count intentionally includes both branches as an upper bound.
  return {commands:1+(compound.script.match(/redis\.call\s*\(/g)?.length??0)+count+compound.guardCount,responseBytes:8192,keys:keys as string[]};
 }
 if(body[1]===MARKET_ORDER_REPOSITORY_BATCH_READ||body[1]===MARKET_ORDER_REPOSITORY_READ||body[1]===MARKET_ORDER_REPOSITORY_HISTORY_READ||body[1]===MARKET_ORDER_REPOSITORY_ADMISSION_READ){
  if(count!==1||args.length!==0)throw fail();
  const suffix=body[1]===MARKET_ORDER_REPOSITORY_READ||body[1]===MARKET_ORDER_REPOSITORY_BATCH_READ?'operation:':body[1]===MARKET_ORDER_REPOSITORY_HISTORY_READ?'history:':'admission:',key=keys[0] as string;
  const id=key.startsWith(namespace+suffix)?key.slice((namespace+suffix).length):'';
  if(!new RegExp('^'+uuid+'$').test(id)||id===original)throw fail();
  return {commands:2,responseBytes:2*(body[1]===MARKET_ORDER_REPOSITORY_ADMISSION_READ?4096:body[1]===MARKET_ORDER_REPOSITORY_BATCH_READ?101390:body[1]===MARKET_ORDER_REPOSITORY_READ?133309:67759)+8192,keys:keys as string[]};
 }
 const admissionBatch=body[1]===MARKET_ORDER_REPOSITORY_ADMISSION_PAGE,batch=body[1]===MARKET_ORDER_REPOSITORY_HISTORY_PAGE||admissionBatch;
 if(count!==2||args.length!==(batch?5:2)||keys[1]!==keys[0]+':revision')throw fail();
 const index=(keys[0] as string).startsWith(namespace)?(keys[0] as string).slice(namespace.length):'';
 if(index!=='work'&&!/^(?:buyer|seller|seller-pending|participant):[a-f0-9]{64}$/.test(index))throw fail();
 if(args[0]!=='+'&&!new RegExp('^\\(\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z\\|'+uuid+'$').test(args[0]))throw fail();
 if(!/^(?:[2-9]|[1-4]\d|5[01])$/.test(args[1]))throw fail();
 if(batch){
  const who=args[3],role=args[4];
  const ownedIndex=role==='seller'?[namespace+'seller:'+hash(who),namespace+'seller-pending:'+hash(who)]:[namespace+role+':'+hash(who)];
  if(admissionBatch&&!['buyer','seller','seller-pending'].includes(role))throw fail();
  if(args[2]!==namespace||(role==='work'?(index!=='work'||who!==''):( !(admissionBatch?['buyer','seller','seller-pending']:['buyer','seller','participant']).includes(role)||!/^ow_[a-f0-9]{32}$/.test(who)||!ownedIndex.includes(keys[0] as string))))throw fail();
  return {commands:5+Number(args[1])-1,responseBytes:2*((admissionBatch?4096*(Number(args[1])-1):126976)+Number(args[1])*64+36)+8192,keys:keys as string[]};
 }
 return {commands:5,responseBytes:8192+2*(36+Number(args[1])*64),keys:keys as string[]};
}
