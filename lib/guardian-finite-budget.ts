import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import type {Redis} from '@upstash/redis';
import {WorkspaceError} from './workspace-types.ts';
import {exampleBudgetCommandWeight} from './example-budget-command-weight.ts';
import {exampleBudgetRedisResponseAllocation} from './example-budget-response-allocation.ts';
import {CONTINUOUS_FREE_BUDGET_FUNCTIONS,CONTINUOUS_FREE_BUDGET_LUA} from './continuous-free-budget.ts';

export const GUARDIAN_POLICY_WINDOW_MS=32*86400000;
export const GUARDIAN_POLICY_BACKOFF_MS=86400000;
export const GUARDIAN_POLICY_MAX_BYTES=512;
export type GuardianPolicyPhase='claimed'|'debited'|'completed'|'failed'|'uncertain';
export type GuardianPolicy={v:1;last:number;attempts:{id:string;at:number;phase:GuardianPolicyPhase}[]};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
function fail(code:string,retry=60):never{throw new WorkspaceError(code,503,retry);}
export const finiteGuardianEnabled=()=>process.env.BAZAAR_FREE_DEMO_MODE==='continuous'&&process.env.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE==='example-text-wire/v3';
export function guardianPolicyKey(prefix:string){if(!/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix))fail('GUARDIAN_POLICY_NAMESPACE');return prefix+':guardian-policy:v1';}
/** One bounded technical key per native family;512 bytes fit the existing
 *10MB technical reserve. It never contains content, wallets or payment controls.
 */
export function parseGuardianPolicy(raw:unknown):GuardianPolicy|undefined{
 if(raw===null)return undefined;if(typeof raw!=='string'||Buffer.byteLength(raw)>512)fail('GUARDIAN_POLICY_UNAVAILABLE');
 let v:GuardianPolicy;try{v=JSON.parse(raw);}catch{fail('GUARDIAN_POLICY_UNAVAILABLE');}
 if(!v!||Array.isArray(v!)||typeof v!=='object'||Object.keys(v!).sort().join(',')!=='attempts,last,v'||v!.v!==1||!integer(v!.last)||!Array.isArray(v!.attempts)||v!.attempts.length>2)fail('GUARDIAN_POLICY_UNAVAILABLE');
 let last=-1;for(const a of v!.attempts){if(!a||Object.keys(a).sort().join(',')!=='at,id,phase'||!uuid.test(a.id)||!integer(a.at)||a.at<last||a.at>v!.last||!['claimed','debited','completed','failed','uncertain'].includes(a.phase))fail('GUARDIAN_POLICY_UNAVAILABLE');last=a.at;}
 if(new Set(v!.attempts.map(a=>a.id)).size!==v!.attempts.length)fail('GUARDIAN_POLICY_UNAVAILABLE');
 return v!;
}
export function initialGuardianPolicy(now:number):GuardianPolicy{if(!integer(now))fail('GUARDIAN_POLICY_CLOCK');return {v:1,last:now,attempts:[]};}
export function guardianPolicyDecision(policy:GuardianPolicy|undefined,now:number){
 if(!policy)fail('GUARDIAN_POLICY_UNINITIALIZED');parseGuardianPolicy(JSON.stringify(policy));if(!integer(now)||now<policy.last)fail('GUARDIAN_POLICY_CLOCK');
 // Time does not establish the outcome of a durable attempt. Uncertain claims
 // require operator resolution even after the conservative pricing window.
 if(policy.attempts.some(a=>['claimed','debited','uncertain'].includes(a.phase)))fail('GUARDIAN_PRIOR_ATTEMPT_UNCERTAIN');
 const active=policy.attempts.filter(a=>a.at+GUARDIAN_POLICY_WINDOW_MS>now);
 if(active.length>=2)fail('GUARDIAN_MAINTENANCE_CAPACITY',Math.max(1,Math.ceil((active[0].at+GUARDIAN_POLICY_WINDOW_MS-now)/1000)));
 const last=active.at(-1);if(last&&last.at+GUARDIAN_POLICY_BACKOFF_MS>now)fail('GUARDIAN_MAINTENANCE_BACKOFF',Math.ceil((last.at+GUARDIAN_POLICY_BACKOFF_MS-now)/1000));
 return active;
}
export function claimGuardianPolicy(policy:GuardianPolicy,now:number,id:string):GuardianPolicy{
 const active=guardianPolicyDecision(policy,now);if(!uuid.test(id))fail('GUARDIAN_POLICY_INTENT');const next:GuardianPolicy={v:1,last:now,attempts:[...active,{id,at:now,phase:'claimed'}]};parseGuardianPolicy(JSON.stringify(next));return next;
}
export function transitionGuardianPolicy(policy:GuardianPolicy,id:string,phase:'debited'|'completed'|'failed',now:number):GuardianPolicy{
 parseGuardianPolicy(JSON.stringify(policy));if(!integer(now)||now<policy.last)fail('GUARDIAN_POLICY_CLOCK');const next=structuredClone(policy),a=next.attempts.find(a=>a.id===id);if(!a||a.phase!==(phase==='debited'?'claimed':'debited'))fail('GUARDIAN_POLICY_ATTEMPT_MISMATCH');a.phase=phase;next.last=now;parseGuardianPolicy(JSON.stringify(next));return next;
}
export const READ_GUARDIAN_INDEX_POLICY_LUA=`return {redis.call('GET',KEYS[1]) or '',redis.call('GET',KEYS[2]) or ''}`;
export const CAS_GUARDIAN_POLICY_LUA=`local old=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then if old then return 0 end else if old~=ARGV[2] then return 0 end end
if string.len(ARGV[3])>512 then return -1 end
redis.call('SET',KEYS[1],ARGV[3]);return 1`;
/** The normal debit can initialize a ledger during public setup. Maintenance
 * must never use that path: an absent ledger is capacity unknown, not zero.
 * Keep the reviewed budget functions byte-for-byte and add no second GET.
 */
export function guardianExistingIdleBudgetLua(){
 const original="local state,status,profile,used,retry=budget_prepare(redis.call('GET',KEYS[1]),config,request)";
 if(!CONTINUOUS_FREE_BUDGET_LUA.includes(original))fail('GUARDIAN_IDLE_SOURCE_UNREVIEWED');
 return CONTINUOUS_FREE_BUDGET_LUA.replace(original,"local existing=redis.call('GET',KEYS[1]);if not existing then return {-2,0,'background',60} end\nlocal state,status,profile,used,retry=budget_prepare(existing,config,request)");
}
export async function reserveFiniteGuardianIdle(){
 if(!finiteGuardianEnabled())fail('GUARDIAN_POLICY_DISABLED');
 const {Redis}=await import('@upstash/redis'),{meteredExampleBudgetRedis}=await import('./example-budget-wire.ts'),{createContinuousFreeBudgetStore,continuousFreeBudgetConfiguration}=await import('./continuous-free-budget.ts');
 const configuration=continuousFreeBudgetConfiguration(),url=process.env.BAZAAR_WORKSPACE_REDIS_REST_URL,token=process.env.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,prefix=process.env.BAZAAR_WORKSPACE_PREFIX;
 if(!configuration||!url||!token||!prefix)fail('GUARDIAN_INITIAL_CREDIT_UNCONFIRMED');try{if(new URL(url!).protocol!=='https:')throw Error();}catch{fail('GUARDIAN_INITIAL_CREDIT_UNCONFIRMED');}
 const redis=meteredExampleBudgetRedis(new Redis({url:url!,token:token!,automaticDeserialization:false,retry:false,enableAutoPipelining:false}));
 const adapter={eval:async(script:string,keys:string[],args:string[])=>{if(script!==CONTINUOUS_FREE_BUDGET_LUA||keys.length!==1||args.length!==2)fail('GUARDIAN_IDLE_SOURCE_UNREVIEWED');return redis.eval(guardianExistingIdleBudgetLua(),keys,args);}};
 try{return await createContinuousFreeBudgetStore(adapter,prefix!,configuration!).background({commands:12,transferBytes:32768,reason:'guardian'});}
 catch{const error=new WorkspaceError('GUARDIAN_INITIAL_CREDIT_UNCONFIRMED',503,60);Object.assign(error,{guardian:{needsOperator:true,maintenanceCreditStatus:'initial-credit-unconfirmed',pendingWork:'unknown',paymentResubmission:false,physicalDeletionMayRemainPending:true}});throw error;}
}
/** Policy claim and the existing global debit share one durable write. A
 * missing/native-invalid ledger cannot silently become a new zero ledger.
 * After an uncertain acknowledgement the saved attempt remains counted.
 */
export function claimGuardianBudgetLua(){return `-- finite-guardian-claim-and-existing-budget-v1
${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local old=redis.call('GET',KEYS[1]);if not old or old~=ARGV[1] then return {-30,0,'background',60} end
local ok,nextPolicy=pcall(cjson.decode,ARGV[2]);if not ok or nextPolicy.v~=1 or type(nextPolicy.attempts)~='table' or #nextPolicy.attempts<1 or #nextPolicy.attempts>2 or nextPolicy.attempts[#nextPolicy.attempts].phase~='claimed' or string.len(ARGV[2])>512 then return {-30,0,'background',60} end
local valid,config=pcall(cjson.decode,ARGV[3]);if not valid then redis.call('SET',KEYS[1],ARGV[2]);return {-2,0,'background',60} end
local budgetRaw=redis.call('GET',KEYS[2]);if not budgetRaw then redis.call('SET',KEYS[1],ARGV[2]);return {-2,0,'background',60} end
local request={action='debit',profile='background',commands=1104,transferBytes=64004096,denialCommands=6,denialTransferBytes=8192}
local prepared,state,status,profile,used,retry=pcall(budget_prepare,budgetRaw,config,request)
if not prepared or not state then redis.call('SET',KEYS[1],ARGV[2]);return {prepared and status or -2,0,'background',60} end
local policyRaw=ARGV[2];if status==1 then local n;policyRaw,n=string.gsub(policyRaw,'"phase":"claimed"','"phase":"debited"',1);if n~=1 then return {-30,0,'background',60} end end
local nextBudget=cjson.encode(state)
if string.len(policyRaw)>512 or string.len(nextBudget)>262144 then redis.call('SET',KEYS[1],ARGV[2]);return {-2,0,'background',60} end
redis.call('SET',KEYS[2],nextBudget);redis.call('SET',KEYS[1],policyRaw)
return {status,used or 0,profile or 'background',retry or 60}`;}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
type Extra={scriptSha256:string;keyCount:number;argumentCount:number;maximumRedisCommands:number;maximumResponseBytes:number};
// Maintenance variants must be filled from the audited source capture, never
// runtime inputs. Unknown scripts stop before the next Redis effect.
const maintenanceCatalogue:readonly Extra[]=[{scriptSha256:'6cf15d17837a45c93958de5833c5ef458e313e7d41a05392778adc59404566fb',keyCount:6,argumentCount:21,maximumRedisCommands:17,maximumResponseBytes:8192}];
function evalShape(body:unknown):body is [string,string,number,...string[]]{return Array.isArray(body)&&typeof body[0]==='string'&&body[0].toLowerCase()==='eval'&&typeof body[1]==='string'&&Buffer.byteLength(body[1])<=65536&&Number.isSafeInteger(body[2])&&body[2]>=0&&body.length>=3+body[2]&&body.slice(3,3+body[2]).every(v=>typeof v==='string'&&Buffer.byteLength(v)>0&&Buffer.byteLength(v)<=512)&&body.slice(3+body[2]).every(v=>typeof v==='string');}
function extra(body:unknown){if(!evalShape(body))return undefined;const hash=sha(body[1]),keys=body[2],args=body.length-3-keys;
 if(hash===sha(READ_GUARDIAN_INDEX_POLICY_LUA)&&keys===2&&args===0)return {maximumRedisCommands:3,maximumResponseBytes:10240};
 if(hash===sha(CAS_GUARDIAN_POLICY_LUA)&&keys===1&&args===3)return {maximumRedisCommands:3,maximumResponseBytes:8192};
 if(hash===sha(claimGuardianBudgetLua())&&keys===2&&args===3)return {maximumRedisCommands:6,maximumResponseBytes:8192};
 return maintenanceCatalogue.find(row=>row.scriptSha256===hash&&row.keyCount===keys&&row.argumentCount===args);
}
type Counts={commands:number;bytes:number;reservedInboundBytes:number;requests:number;closed:boolean;mode:'idle'|'full'};
const scope=new AsyncLocalStorage<Counts|undefined>();
export function guardianWireObservation(){const c=scope.getStore();return c?{commandsUpper:c.commands,combinedUpperBytes:c.bytes,requests:c.requests,closed:c.closed}:undefined;}
export async function withGuardianWireScope<T>(action:()=>Promise<T>){return scope.run({commands:0,bytes:0,reservedInboundBytes:0,requests:0,closed:false,mode:'full'},action);}
export async function withGuardianIdleWireScope<T>(action:()=>Promise<T>){return finiteGuardianEnabled()?scope.run({commands:0,bytes:0,reservedInboundBytes:0,requests:0,closed:false,mode:'idle'},action):action();}
type Middleware=Parameters<Redis['use']>[0];
const hooked=new WeakSet<object>();
export function meteredFiniteGuardianRedis(redis:Redis):Redis{
 if(!hooked.has(redis)){redis.use(async(request:Parameters<Middleware>[0],next:Parameters<Middleware>[1])=>{
  const c=scope.getStore();if(!c)return next(request);if(c.closed)fail('GUARDIAN_WIRE_CLOSED');const body=JSON.stringify(request.body);let weight:number,allocation:number;
  try{
   if(c.mode==='idle'){
    if(!evalShape(request.body))throw Error();const b=request.body,hash=sha(b[1]),keyCount=b[2],args=b.length-3-keyCount;
    if(hash===sha(guardianExistingIdleBudgetLua())&&keyCount===1&&args===2){weight=4;allocation=4608;}
    else if(hash===sha(READ_GUARDIAN_INDEX_POLICY_LUA)&&keyCount===2&&args===0){weight=3;allocation=6656;}
    else if(hash==='fc0773672bf7f88038959d76bc8a7daf5b4e4b295c72d965aa239a732753ed95'&&keyCount===1&&args===0){weight=3;allocation=5632;}
    else throw Error();
   }else{const known=extra(request.body);weight=known?.maximumRedisCommands??exampleBudgetCommandWeight(request.body);allocation=known?.maximumResponseBytes??exampleBudgetRedisResponseAllocation(request.body);}
  }catch{c.closed=true;fail('GUARDIAN_UNAUDITED_COMMAND');}
  const out=Buffer.byteLength(body)+4096,maxCommands=c.mode==='idle'?16:1104,maxBytes=c.mode==='idle'?36864:64000000;
  if(c.commands+weight>maxCommands||c.bytes+c.reservedInboundBytes+out+allocation>maxBytes){c.closed=true;fail('GUARDIAN_WIRE_CAPACITY');}c.commands+=weight;c.bytes+=out;c.reservedInboundBytes+=allocation;c.requests++;
  let pending=true;try{const result=await next(request),encode=(v:unknown):unknown=>typeof v==='string'?Buffer.from(v,'utf8').toString('base64'):Array.isArray(v)?v.map(encode):v;
   const plain=JSON.stringify(result),encoded=result&&typeof result==='object'&&!Array.isArray(result)&&'result'in result?JSON.stringify({...result,result:encode(result.result)}):plain;
   const incoming=Math.max(Buffer.byteLength(plain),Buffer.byteLength(encoded))+4096;c.reservedInboundBytes-=allocation;pending=false;c.bytes+=incoming;if(incoming>allocation||c.bytes+c.reservedInboundBytes>maxBytes)fail('GUARDIAN_WIRE_RESPONSE_BOUND');return result;
  }catch{c.closed=true;fail('GUARDIAN_WIRE_ACK_UNCONFIRMED');}
  finally{if(pending)c.reservedInboundBytes-=allocation;}
 });hooked.add(redis);}return redis;
}
