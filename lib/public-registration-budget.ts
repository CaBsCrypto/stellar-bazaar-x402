import {createHash} from 'node:crypto';
import {publicBuyerConfiguration} from './public-buyer-admission.ts';
import {CONTINUOUS_FREE_BUDGET_FUNCTIONS,continuousFreeBudgetConfiguration,continuousFreeBudgetKey} from './continuous-free-budget.ts';
import {WorkspaceError} from './workspace-types.ts';
import {continuousPerOrderStorage} from './per-order-storage-profile.ts';
import {publicStarterProfile,starterEnrollmentForecast,starterRegistrationMarker,consumeStarterBootstrapDebit} from './public-registration-profile.ts';

type Environment=Readonly<Record<string,string|undefined>>;
type Registered={ownerId:string;createdAt:string};
type Window={key:string;count:number;until:number};
// Includes the already recorded diagnostic shadow conservatively, without
// changing an existing ledger or turning unspent reservations into a refund.
export const PUBLIC_REGISTRATION_DIAGNOSTIC_FLOOR_BYTES=24*1048576;
export const PUBLIC_REGISTRATION_SHARED_HISTORY_BYTES=2359296;
export const PER_ORDER_REGISTRATION_SHARED_HISTORY_BYTES=25690112;
export const PUBLIC_OWNER_CONTROL_REQUESTS=48;

/** Forward-compatible native registry quota rows: old releases can still read
 * every owner and historical record. Never mint a new campaign on rotation. */
export function recordPublicStarterRegistration(windows:Window[],ownerId:string,environment:Environment=process.env){
 if(!publicStarterProfile(environment))return;
 const c=publicBuyerConfiguration(environment),p=c.configured?c.policy:undefined;
 if(!p||p.version!==2)throw new WorkspaceError('PUBLIC_STARTER_CONFIGURATION_INCOMPLETE',503);
 const key='starter-epoch:'+Date.parse(p.startsAt),epochs=windows.filter(w=>w.key.startsWith('starter-epoch:'));
 if(epochs.length>1||epochs.length===1&&epochs[0].key!==key)throw new WorkspaceError('PUBLIC_STARTER_EPOCH_CONFLICT',503);
 if(!epochs.length)windows.push({key,count:1,until:Number.MAX_SAFE_INTEGER});
 windows.push({key:starterRegistrationMarker(ownerId),count:1,until:Number.MAX_SAFE_INTEGER});
}

export async function publicControlRequest(request:Request){
 const path=new URL(request.url).pathname;
 // A discount grants no authority: each native order route still authenticates
 // its actual owner and uses only that operation's existing reserved resources.
 if(/^\/api\/market\/orders\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}(?:\/x402|\/deliveries(?:\/confirm)?)?$/i.test(path))return false;
 if(request.method!=='POST'||path!=='/api/mcp')return true;
 const reader=request.clone().body?.getReader();if(!reader)return true;let bytes=0;const parts:Uint8Array[]=[];
 try{for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>65536){void reader.cancel();return true;}parts.push(p.value);}const rpc=JSON.parse(Buffer.concat(parts).toString('utf8'));return rpc?.method!=='tools/call'||!['get_market_order','get_market_delivery'].includes(rpc?.params?.name);}catch{return true;}finally{reader.releaseLock();}
}

export function publicRegistrationPool(workspaces:Registered[],creationId:string,ownerId:string,environment:Environment=process.env,now=Date.now(),creationWindows:Window[]=[]){
 if(environment.BAZAAR_PUBLIC_BUYER_ADMISSION_JSON===undefined)return undefined;
 const c=publicBuyerConfiguration(environment,now),p=c.policy,configuration=continuousFreeBudgetConfiguration(environment);
 if(!c.configured||!p||!configuration)throw new WorkspaceError('PUBLIC_ADMISSION_CONFIGURATION_INCOMPLETE',503);
 if(!c.admissionOpen)throw new WorkspaceError('ADMISSIONS_PAUSED',503);
 const starter=publicStarterProfile(environment);
 if(starter){
  // Lifetime count; revocation, rotation, a new startsAt or a rolling-window
  // boundary cannot replenish the three slots. The registry CAS linearizes it.
  consumeStarterBootstrapDebit();
  const epoch='starter-epoch:'+Date.parse(p.startsAt),epochs=creationWindows.filter(w=>w.key.startsWith('starter-epoch:'));
  if(epochs.length>1||epochs.length===1&&epochs[0].key!==epoch)throw new WorkspaceError('PUBLIC_STARTER_EPOCH_CONFLICT',503);
  const registered=new Set(creationWindows.filter(w=>w.key.startsWith('starter-registration:')).map(w=>w.key.slice('starter-registration:'.length)));
  for(const w of workspaces){const at=Date.parse(w.createdAt);if(!Number.isFinite(at)||at>now)throw new WorkspaceError('PUBLIC_ADMISSION_CONFIGURATION_INCOMPLETE',503);if(at>=Date.parse(p.startsAt))registered.add(w.ownerId);}
  const count=registered.size+1;
  const forecast=starterEnrollmentForecast(count);
  // All completed/current bootstrap requests were already debited by ingress.
  // Every future control keeps its unchanged class and atomic global predebit;
  // enrollment grants no spendable credit or promise of a subsequent action.
  const remaining=forecast.sharedDiagnosticBytes+forecast.sharedHistoryBytes;
  return {configuration,request:{action:'reserve',operationId:creationId,principalHash:createHash('sha256').update(ownerId).digest('hex'),recoveryCommands:forecast.maximumRecoveryCommands,backgroundCommands:0,transferBytes:0,globalAllowanceBytes:remaining},forecast:{...forecast,remainingGlobalAllowanceBytes:remaining}};
 }
 const since=Math.max(Date.parse(p.startsAt),now-p.windowMs);
 const count=workspaces.filter(w=>{const at=Date.parse(w.createdAt);if(!Number.isFinite(at)||at>now)throw new WorkspaceError('PUBLIC_ADMISSION_CONFIGURATION_INCOMPLETE',503);return at>=since;}).length+1;
 // One bounded new-storage page and one bounded retained legacy page. This
 // protects a shared diagnostic history pass without repricing any old hold.
 const history=continuousPerOrderStorage(environment)?PER_ORDER_REGISTRATION_SHARED_HISTORY_BYTES:PUBLIC_REGISTRATION_SHARED_HISTORY_BYTES;
 const floor=count*c.registrationTransferFloorBytes+history+PUBLIC_REGISTRATION_DIAGNOSTIC_FLOOR_BYTES;
 if(!Number.isSafeInteger(floor)||floor>2000000000)throw new WorkspaceError('REGISTRATION_RESOURCE_LIMIT',429,3600);
 return {configuration,request:{action:'reserve',operationId:creationId,principalHash:createHash('sha256').update(ownerId).digest('hex'),recoveryCommands:0,backgroundCommands:0,transferBytes:0,globalAllowanceBytes:floor}};
}

/** Read-only budget preparation in the SAME registry CAS, before every SET.
 * Its hypothetical zero-size entry stays in Lua memory. The real budget and
 * all held operations are neither serialized nor written by this guard. */
export function publicRegistrationCommitGuard(keyIndex:number,configArg:number,requestArg:number){return `${CONTINUOUS_FREE_BUDGET_FUNCTIONS}
local registrationRaw=redis.call('GET',KEYS[${keyIndex}])
if not registrationRaw or #registrationRaw>262144 then return -28 end
local registrationConfig=cjson.decode(ARGV[${configArg}]);local registrationRequest=cjson.decode(ARGV[${requestArg}])
local registrationParsed,registrationExisting=pcall(cjson.decode,registrationRaw)
if not registrationParsed or type(registrationExisting)~='table' or type(registrationExisting.held)~='table' or #registrationExisting.held>128 then return -28 end
for _,held in ipairs(registrationExisting.held) do if type(held)~='table' or held.operationId==registrationRequest.operationId then return -28 end end
local registrationBudget,registrationStatus=budget_prepare(registrationRaw,registrationConfig,registrationRequest)
if not registrationBudget or registrationStatus~=1 then return -28 end
`;
}
export function appendPublicRegistrationGuard(script:string,keyIndex:number,configArg:number,requestArg:number){
 const first=script.indexOf("redis.call('SET'");if(first<0)throw new WorkspaceError('PUBLIC_ADMISSION_CONFIGURATION_INCOMPLETE',503);
 return script.slice(0,first)+publicRegistrationCommitGuard(keyIndex,configArg,requestArg)+script.slice(first);
}
export function publicRegistrationBudgetKey(prefix:string){return continuousFreeBudgetKey(prefix);}

/** Reuses quota-only registry patches; account IDs/generations stay untouched.
 * The period is anchored at creation, so rotating access or clearing visible
 * history cannot replenish this owner's control budget. Individual accepted
 * order recovery is exempt at the trusted HTTP classifier, not by user input. */
export function consumePublicOwnerControl(windows:Window[],meta:Registered,environment:Environment=process.env,now=Date.now()){
 const c=publicBuyerConfiguration(environment,now),p=c.configured?c.policy:undefined;
 if(!p||Date.parse(meta.createdAt)<Date.parse(p.startsAt))return;
 const created=Date.parse(meta.createdAt);if(!Number.isFinite(created)||created>now)throw new WorkspaceError('PUBLIC_ADMISSION_CONFIGURATION_INCOMPLETE',503);
 const start=created+Math.floor((now-created)/p.windowMs)*p.windowMs,until=start+p.windowMs,key='public-owner:'+meta.ownerId+':'+start;
 let row=windows.find(w=>w.key===key);
 if(row&&row.count>=PUBLIC_OWNER_CONTROL_REQUESTS)throw new WorkspaceError('OWNER_CONTROL_LIMIT',429,Math.max(1,Math.ceil((until-now)/1000)));
 if(!row){row={key,count:0,until};windows.push(row);}row.count++;
}
