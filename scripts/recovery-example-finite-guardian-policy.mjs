// LOCAL proposal only. Integration must place this technical state in the
// existing cheap index and preserve it in EVERY native index CAS/recompute.
// No endpoint, credential, clock adapter, ledger reset or financial mutation.
import {createHash} from 'node:crypto';
const fail=code=>{throw Error(code);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const FINITE_GUARDIAN_POLICY=Object.freeze({version:1,windowMs:32*86400000,budgetWindowMs:31*86400000,maximumCostlyAttempts:2,retryBackoffMs:86400000,maximumPolicyBytes:512,maximumWireBytes:64000000,maximumNativeCommands:1100,creditCommands:1104,creditTransferBytes:64004096});
export function initialFiniteGuardianState(now){if(!integer(now))fail('GUARDIAN_CLOCK_REQUIRED');return {v:1,last:now,attempts:[]};}
export function validateFiniteGuardianState(state){
 if(!exact(state,['v','last','attempts'])||state.v!==1||!integer(state.last)||!Array.isArray(state.attempts)||state.attempts.length>2||new Set(state.attempts.map(a=>a.id)).size!==state.attempts.length)fail('GUARDIAN_EXACT_DURABLE_POLICY_REQUIRED');
 let at=-1;for(const a of state.attempts){if(!exact(a,['id','at','phase'])||!uuid.test(a.id??'')||!integer(a.at)||a.at<at||a.at>state.last||!['claimed','debited','completed','failed','uncertain'].includes(a.phase))fail('GUARDIAN_EXACT_DURABLE_ATTEMPT_REQUIRED');at=a.at;}
 if(Buffer.byteLength(JSON.stringify(state))>FINITE_GUARDIAN_POLICY.maximumPolicyBytes)fail('GUARDIAN_POLICY_PROJECTION_BOUND');return state;
}
export function finiteGuardianDecision(state,now,{due}={}){
 validateFiniteGuardianState(state);if(!integer(now)||now<state.last||typeof due!=='boolean')fail('GUARDIAN_CLOCK_OR_DUE_REQUIRED');
 // Expired technical attempts may leave this conservative32day policy window. The native budget
 // retains and expires its own spent buckets; this never changes that ledger.
 const active=state.attempts.filter(a=>a.at+FINITE_GUARDIAN_POLICY.windowMs>now);
 if(!due)return {action:'idle',needsOperator:false,historyRecoveryUnchanged:true,policyRawBytes:Buffer.byteLength(JSON.stringify(state))};
 if(active.some(a=>['claimed','debited','uncertain'].includes(a.phase)))return {action:'operator',code:'GUARDIAN_PRIOR_ATTEMPT_UNCERTAIN',needsOperator:true,historyRecoveryUnchanged:true};
 if(active.length>=2)return {action:'capacity',httpStatus:503,code:'GUARDIAN_MAINTENANCE_CAPACITY',retryAfterSeconds:Math.max(1,Math.ceil((active[0].at+FINITE_GUARDIAN_POLICY.windowMs-now)/1000)),needsOperator:true,historyRecoveryUnchanged:true};
 const last=active.at(-1);if(last&&last.at+FINITE_GUARDIAN_POLICY.retryBackoffMs>now)return {action:'backoff',retryAfterSeconds:Math.ceil((last.at+FINITE_GUARDIAN_POLICY.retryBackoffMs-now)/1000),needsOperator:last.phase==='failed',historyRecoveryUnchanged:true};
 return {action:'claim',activeAttempts:active.length,needsOperator:false,historyRecoveryUnchanged:true};
}
export function planFiniteGuardianClaim(state,now,id){
 const decision=finiteGuardianDecision(state,now,{due:true});if(decision.action!=='claim')fail(decision.code??'GUARDIAN_RETRY_NOT_DUE');if(!uuid.test(id??''))fail('GUARDIAN_FIXED_INTENT_REQUIRED');
 const next={v:1,last:now,attempts:[...state.attempts.filter(a=>a.at+FINITE_GUARDIAN_POLICY.windowMs>now),{id,at:now,phase:'claimed'}]};validateFiniteGuardianState(next);return next;
}
function transition(state,id,from,to,now){validateFiniteGuardianState(state);if(!integer(now)||now<state.last)fail('GUARDIAN_CLOCK_REGRESSION');const next=structuredClone(state),a=next.attempts.find(a=>a.id===id);if(!a||!from.includes(a.phase))fail('GUARDIAN_DURABLE_ATTEMPT_MISMATCH');a.phase=to;next.last=now;validateFiniteGuardianState(next);return next;}
export function planFiniteGuardianDebit(state,id,receipt,now){if(!exact(receipt,['commands','transferBytes','confirmed'])||receipt.confirmed!==true||receipt.commands!==1104||receipt.transferBytes!==64004096)fail('GUARDIAN_EXACT_NATIVE_CREDIT_REQUIRED');return transition(state,id,['claimed'],'debited',now);}
export function planFiniteGuardianOutcome(state,id,outcome,now){if(!['completed','failed','uncertain'].includes(outcome))fail('GUARDIAN_FIXED_OUTCOME_REQUIRED');return transition(state,id,['debited'],outcome,now);}
/** A CAS acknowledgement or debit acknowledgement loss exits BEFORE work.
 * Caller reads the existing index once; no new GET is added to idle ticks.
 * Persist/transports are injected for local tests, not publicly selectable.
 * Idle/read costs and claim-CAS must fit the existing tiny idle credit; every
 * following exchange must be inside the confirmed full-pass wire guard.
 */
export async function runFiniteGuardianAttempt({state,now,id,compareAndSet,precharge,work}){
 if(![compareAndSet,precharge,work].every(fn=>typeof fn==='function'))fail('GUARDIAN_REVIEWED_INTERNAL_ADAPTERS_REQUIRED');
 const next=planFiniteGuardianClaim(state,now,id);if(await compareAndSet(state,next)!==true)fail('GUARDIAN_CLAIM_ACK_UNCONFIRMED_NO_RETRY');
 const confirmation=await precharge({commands:1104,transferBytes:64004096,reason:'guardian'}),debited=planFiniteGuardianDebit(next,id,confirmation,now);
 if(await compareAndSet(next,debited)!==true)fail('GUARDIAN_DEBIT_MARKER_ACK_UNCONFIRMED_NO_RETRY');
 let outcome='completed',result;try{result=await work();if(result?.needsOperator===true)outcome='failed';}catch{outcome='failed';}
 const finished=planFiniteGuardianOutcome(debited,id,outcome,now);if(await compareAndSet(debited,finished)!==true)fail('GUARDIAN_COMPLETION_ACK_UNCONFIRMED_NO_RETRY');
 return {status:'LOCAL_FINITE_GUARDIAN_ATTEMPT_RECORDED',outcome,historyRecoveryUnchanged:true,cleanupGuaranteed:false,financialResubmission:false};
}
/** Prototype of an enforced native transport envelope. Production integration
 * must supply the audited exact SHA/arity command catalog and full response
 * allocator, and route every native client through this guard. Unknown commands
 * stop before Redis. The 64MB price is never replaced by typical measurements.
 */
export function createFiniteGuardianWireGuard({commandWeight,responseAllocation,send}){
 if(![commandWeight,responseAllocation,send].every(fn=>typeof fn==='function'))fail('GUARDIAN_AUDITED_TRANSPORT_REQUIRED');let commands=0,bytes=0,requests=0,closed=false;
 const digest=value=>createHash('sha256').update(value).digest('hex');
 return {snapshot:()=>({commandsUpper:commands,combinedUpperBytes:bytes,requests,closed}),async command(body){
  if(closed||!Array.isArray(body))fail('GUARDIAN_TYPED_WIRE_CLOSED');const raw=JSON.stringify(body),out=Buffer.byteLength(raw)+4096;let weight,allocation;
  try{weight=commandWeight(body);allocation=responseAllocation(body);}catch{closed=true;fail('GUARDIAN_UNAUDITED_COMMAND');}
  if(!integer(weight)||weight<1||!integer(allocation)||allocation<4096||commands+weight>1100||bytes+out+allocation>64000000){closed=true;fail('GUARDIAN_TYPED_WIRE_CAPACITY');}
  commands+=weight;bytes+=out;requests++;
  try{const response=await send(body),plain=JSON.stringify(response),encode=v=>typeof v==='string'?Buffer.from(v,'utf8').toString('base64'):Array.isArray(v)?v.map(encode):v;
   if(typeof plain!=='string')fail('GUARDIAN_TYPED_WIRE_RESPONSE');const encoded=response&&typeof response==='object'&&!Array.isArray(response)&&'result' in response?JSON.stringify({...response,result:encode(response.result)}):plain;
   const incoming=Math.max(Buffer.byteLength(plain),Buffer.byteLength(encoded))+4096;bytes+=incoming;if(incoming>allocation||bytes>64000000)fail('GUARDIAN_TYPED_WIRE_RESPONSE_BOUND');return response;
  }catch{closed=true;fail('GUARDIAN_TYPED_WIRE_ACK_UNCONFIRMED');}
 }};
}
export const FINITE_GUARDIAN_INTEGRATION_GATES=Object.freeze([
 'Explicit opt-in requires initialized durable policy; absence never means no due work.',
 'Preserve the technical policy across every native market/index CAS and cleanup writer; no older writer may silently remove it.',
 'Claim/debit/finish CAS transports and the whole full-pass I/O must use real reviewed durable source adapters; no automatic retries after uncertain acknowledgements.',
 'No extra Redis GET on every idle tick: read policy from the existing tiny projection, respecting its enlarged validated byte allowance and idle command credit.',
 'Every native full-pass client must route through the audited wire guard; unsupported maintenance or initializer Lua stops before effects.',
 'Financial operations, reservations and their independent recovery holds remain untouched; this state tracks maintenance attempts only.',
 'After two attempts in32 conservative days the cron remains active but costly maintenance is capacity-blocked503. Visible content still expires at7days; physical deletion can remain pending. Do not claim guaranteed cleanup or uninterrupted maintenance.',
 'A separate cheap bounded pending-operation index may dispatch/reconcile existing paid orders under their holds; it requires its own implementation and acceptance, not this prototype.',
]);
