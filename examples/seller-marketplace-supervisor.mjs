import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withSellerMcp,validateSellerConfiguration} from './marketplace-seller-mcp.mjs';
import {createSellerHttpAdapter} from './seller-http-adapter.mjs';
import {sellerCanonical,sellerHash} from './seller-service-card.mjs';
import {createSellerIntent,executeSellerIntent,readSellerJournal,listSellerOrders,watchSellerOrders} from './seller-marketplace-worker.mjs';

const maximumDuration=24*60*60*1000;
const reasons=new Set(['session-bound','time-bound','request-bound','provider-bound','quota','uncertainty','unconfirmed','fault','owner-stop','clock','requires-review']);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function settings(input){
 const value={durationMs:input.durationMs??maximumDuration,maxSessions:input.maxSessions??144,maxMcpRequests:input.maxMcpRequests??3000,maxProviderRequests:input.maxProviderRequests??50,pollsPerSession:input.pollsPerSession??10,intervalMs:input.intervalMs??60000};
 if(!integer(value.durationMs,60000,maximumDuration)||!integer(value.maxSessions,1,1440)||!integer(value.maxMcpRequests,1,5000)||!integer(value.maxProviderRequests,1,200)||!integer(value.pollsPerSession,1,10)||!integer(value.intervalMs,60000,3600000))throw Error('SUPERVISOR_BOUNDS_REQUIRED');
 return value;
}
function validateState(state,configuration,bindingHash){
 const keys=['version','bindingHash','configuration','createdAt','deadlineAt','lastObservedAt','phase','reason','sessionsStarted','sessionsCompleted','mcpRequests','providerRequests','executed',...(state?.retryAfterSeconds!==undefined?['retryAfterSeconds']:[])].sort().join(',');
 if(!state||Object.keys(state).sort().join(',')!==keys||state.version!==1||state.bindingHash!==bindingHash||sellerCanonical(state.configuration)!==sellerCanonical(configuration)||!['bound','running','stopped'].includes(state.phase)||!integer(state.createdAt,0,Number.MAX_SAFE_INTEGER-configuration.durationMs)||state.deadlineAt!==state.createdAt+configuration.durationMs||!integer(state.lastObservedAt,state.createdAt,Number.MAX_SAFE_INTEGER)||!integer(state.sessionsStarted,0,configuration.maxSessions)||!integer(state.sessionsCompleted,0,state.sessionsStarted)||!integer(state.mcpRequests,0,configuration.maxMcpRequests)||!integer(state.providerRequests,0,configuration.maxProviderRequests)||!integer(state.executed,0,state.providerRequests)||state.phase==='running'&&state.sessionsStarted!==state.sessionsCompleted+1||state.phase==='bound'&&state.sessionsStarted!==state.sessionsCompleted||state.phase!=='stopped'&&state.reason!==null||state.phase==='stopped'&&!reasons.has(state.reason)||state.retryAfterSeconds!==undefined&&!integer(state.retryAfterSeconds,1,86400))throw Error('SUPERVISOR_STATE_REQUIRES_REVIEW');
}
function retrySeconds(value){return typeof value==='string'&&/^[0-9]{1,5}$/.test(value)&&Number(value)>0&&Number(value)<=86400?Number(value):undefined;}
function summary(state,reason=state.reason){
 return {version:1,status:'stopped',reason:reasons.has(reason)?reason:'fault',sessionsCompleted:state.sessionsCompleted,mcpRequests:state.mcpRequests,providerRequests:state.providerRequests,executed:state.executed,deadlineAt:state.deadlineAt,...(state.retryAfterSeconds?{retryAfterSeconds:state.retryAfterSeconds}:{}),needsOwner:true,machineMustRemainAwake:true};
}
function wait(ms,signal){
 return new Promise((done,reject)=>{
  const cleanup=()=>signal?.removeEventListener('abort',cancel),timer=setTimeout(()=>{cleanup();done();},ms);
  const cancel=()=>{clearTimeout(timer);cleanup();reject(Error('SUPERVISOR_STOP'));};
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 });
}

/** Participant-owned local supervisor. This API never pays, deploys or changes
 * provider admission. A supplied fetcher is trusted transport code; it may add
 * preview protection only after checking the exact saved Bazaar endpoint.
 * Requests are durably charged before transport. Crashes and uncertain results
 * require owner recovery, never a fresh budget or another provider execution.
 */
export async function runSellerSupervisor(input){
 const configuration=settings(input),{store,fetcher=fetch,now=Date.now,sleep=wait,onStatus=()=>{},signal}=input;
 if(!store?.read||!store?.journal||!store?.acquireLock||typeof fetcher!=='function'||typeof now!=='function'||typeof sleep!=='function'||typeof onStatus!=='function'||signal!==undefined&&!(signal instanceof AbortSignal))throw Error('SUPERVISOR_CONFIGURATION_REQUIRED');
 const release=await store.acquireLock('seller.watch');
 let state,stopReason,stateTrusted=false,budgetTail=Promise.resolve();
 const journal=store.journal('seller.supervisor');
 const persist=async()=>{await journal.append(structuredClone(state));};
 const clock=()=>{
  if(stopReason)throw Error('SUPERVISOR_STOP');
  const value=now();
  if(!integer(value,0,Number.MAX_SAFE_INTEGER)||value<state.lastObservedAt){stopReason='clock';throw Error('SUPERVISOR_STOP');}
  state.lastObservedAt=value;
  if(signal?.aborted){stopReason='owner-stop';throw Error('SUPERVISOR_STOP');}
  if(value>=state.deadlineAt){stopReason='time-bound';throw Error('SUPERVISOR_STOP');}
  return value;
 };
 // A serialized durable budget prevents overlapping SDK requests from racing.
 const charge=kind=>{
  const next=budgetTail.then(async()=>{
   clock();const key=kind==='mcp'?'mcpRequests':'providerRequests',limit=kind==='mcp'?configuration.maxMcpRequests:configuration.maxProviderRequests;
   if(state[key]>=limit){stopReason=kind==='mcp'?'request-bound':'provider-bound';throw Error('SUPERVISOR_STOP');}
   state[key]++;await persist();
  });
  budgetTail=next;return next;
 };
 const pause=async duration=>{
  let left=duration;
  while(left>0){const remaining=state.deadlineAt-clock(),part=Math.min(left,remaining,60000);await sleep(part,signal);left-=part;clock();}
 };
 try{
  const config=validateSellerConfiguration(await store.read('seller-config'));
  if(!/^[a-zA-Z0-9_-]{43}$/.test(config.agentAccess??'')||!/^[a-zA-Z0-9_-]{43}$/.test(config.providerAccess??''))throw Error('SUPERVISOR_CONFIGURATION_REQUIRED');
  const bindingHash=sellerHash(sellerCanonical({bazaarOrigin:config.bazaarOrigin,ownerId:config.ownerId,agentId:config.agentId,cardHash:config.cardHash,allowedOrigins:config.allowedOrigins,agentAccessHash:sellerHash(config.agentAccess),providerAccessHash:sellerHash(config.providerAccess)}));
  state=await readSellerJournal(journal);
  if(!state){const createdAt=now();if(!integer(createdAt,0,Number.MAX_SAFE_INTEGER-maximumDuration))throw Error('SUPERVISOR_CLOCK_REQUIRED');state={version:1,bindingHash,configuration,createdAt,deadlineAt:createdAt+configuration.durationMs,lastObservedAt:createdAt,phase:'bound',reason:null,sessionsStarted:0,sessionsCompleted:0,mcpRequests:0,providerRequests:0,executed:0};await journal.initialize(state);}
  validateState(state,configuration,bindingHash);
  stateTrusted=true;
  if(state.phase==='stopped'){const result=summary(state);await onStatus(result);return result;}
  if(state.phase!=='bound'){state.phase='stopped';state.reason='requires-review';await persist();const result=summary(state);await onStatus(result);return result;}
  let providerFetcher=input.providerFetcher??fetch;
  if(!input.providerFetcher&&config.providerFetchModule){const own=await import(pathToFileURL(resolve(config.providerFetchModule)).href);providerFetcher=await own.createFetch({configuration:config.providerProtection});}
  if(typeof providerFetcher!=='function')throw Error('SUPERVISOR_CONFIGURATION_REQUIRED');
  const guardedFetch=async(kind,transport,url,init)=>{
   await charge(kind);const response=await transport(url,{...init,...(signal?{signal:AbortSignal.any([init.signal,signal].filter(Boolean))}: {})});
   if(response.status===429){stopReason='quota';const retry=retrySeconds(response.headers.get('retry-after'));if(retry)state.retryAfterSeconds=retry;}
   return response;
  };
  const adapter=createSellerHttpAdapter({providerOrigin:config.card.url,route:config.card.routeTemplate,allowedOrigins:config.allowedOrigins,providerAccess:config.providerAccess,fetcher:(url,init)=>guardedFetch('provider',providerFetcher,url,init)});
  for(;;){
   clock();
   if(state.sessionsStarted>=configuration.maxSessions){stopReason='session-bound';break;}
   if(state.mcpRequests>=configuration.maxMcpRequests){stopReason='request-bound';break;}
   if(state.providerRequests>=configuration.maxProviderRequests){stopReason='provider-bound';break;}
   state.phase='running';state.sessionsStarted++;await persist();
   const sessionRequestLimit=Math.min(1000,configuration.maxMcpRequests-state.mcpRequests);
   const result=await withSellerMcp({agentAccess:config.agentAccess,origin:config.bazaarOrigin,maxRequests:sessionRequestLimit,fetcher:(url,init)=>guardedFetch('mcp',fetcher,url,init)},async transport=>{
    const scanJournal=store.journal('seller.scan');let scan=await readSellerJournal(scanJournal),nextCursor;
    if(scan&&(scan.version!==1||scan.cursor!==null&&typeof scan.cursor!=='string'))throw Error('INVALID_SCAN_STATE');
    if(!scan){scan={version:1,cursor:null};await scanJournal.initialize(scan);}
    return watchSellerOrders({polls:configuration.pollsPerSession,intervalMs:configuration.intervalMs,sleep:pause,poll:async()=>{clock();const page=await listSellerOrders(transport,{cursor:scan.cursor??undefined});nextCursor=page.nextCursor;return page.orders.filter(order=>order.serviceId===config.card.id);},afterPage:async()=>{scan={version:1,cursor:nextCursor};await scanJournal.append(scan);},processOrder:async order=>{
     clock();if(state.providerRequests>=configuration.maxProviderRequests){stopReason='provider-bound';throw Error('SUPERVISOR_STOP');}
     // Reserve headroom for the five execution tools and transport overhead
     // before creating or claiming an intent, rather than cutting a paid order
     // between the provider response and its frozen delivery.
     if(state.mcpRequests+7>configuration.maxMcpRequests||transport.requestCount()+7>sessionRequestLimit){stopReason='request-bound';throw Error('SUPERVISOR_STOP');}
     const name='seller.'+order.operationId,operationRelease=await store.acquireLock(name);
     try{
      const operationJournal=store.journal(name);
      if(await readSellerJournal(operationJournal))throw Error('EXISTING_INTENT_REQUIRES_RECOVERY');
      const intent=createSellerIntent({operationId:order.operationId,cardHash:config.cardHash,serviceId:config.card.id,providerOrigin:config.card.url,providerRoute:config.card.routeTemplate,ownerId:config.ownerId,agentId:config.agentId});
      await operationJournal.initialize(intent);
      await executeSellerIntent(intent,{...transport,adapter,persistIntent:value=>operationJournal.append(value)});
      state.executed++;await persist();
     }finally{await operationRelease();}
    }});
   });
   if(result.stopped!=='bound'){
    stopReason??=['quota','uncertainty','unconfirmed'].includes(result.stopped)?result.stopped:'fault';
    const retry=retrySeconds(result.retryAfter);if(retry)state.retryAfterSeconds=retry;
    break;
   }
   state.sessionsCompleted++;state.phase='bound';await persist();
   // Keep each reconnected session at least one polling interval apart.
   if(state.sessionsStarted<configuration.maxSessions)await pause(configuration.intervalMs);
  }
 }catch(error){
  if(!stateTrusted)throw Error('SUPERVISOR_PREPARATION_UNCONFIRMED');
  if(signal?.aborted)stopReason??='owner-stop';
  if(error.httpStatus===429){stopReason='quota';const retry=retrySeconds(error.retryAfter);if(retry)state.retryAfterSeconds=retry;}
  stopReason??=state.mcpRequests>=configuration.maxMcpRequests?'request-bound':'fault';
 }finally{
  // Owner inspection is required if any final journal or lock acknowledgement
  // fails. Never return a successful run or reconnect after that failure.
  if(stateTrusted&&state.phase!=='stopped'){state.phase='stopped';state.reason=stopReason??'fault';try{await persist();}catch{await release();throw Error('SUPERVISOR_STATE_UNCONFIRMED');}}
  await release();
 }
 const result=summary(state);await onStatus(result);return result;
}

function cliArguments(argv){
 const args=[...argv],directory=args.shift();if(!directory)throw Error('SUPERVISOR_ARGUMENTS_REQUIRED');
 const values={},names={'--hours':'durationMs','--max-sessions':'maxSessions','--max-mcp-requests':'maxMcpRequests','--max-provider-requests':'maxProviderRequests','--polls':'pollsPerSession'};let pipe=false;
 for(let i=0;i<args.length;i++){const name=args[i];if(name==='--secret-stdin'){if(pipe)throw Error('SUPERVISOR_ARGUMENTS_REQUIRED');pipe=true;continue;}const key=names[name],value=args[++i];if(!key||key in values||!/^\d+$/.test(value??''))throw Error('SUPERVISOR_ARGUMENTS_REQUIRED');values[key]=Number(value)*(key==='durationMs'?3600000:1);}
 return {directory,pipe,...settings(values)};
}
async function main(){
 const options=cliArguments(process.argv.slice(2));
 const {readPrivateInput}=await import('./buyer-private-input.mjs');const {openPortableSecretStore}=await import('./buyer-portable-secret-store.mjs');
 let password;
 if(options.pipe){const raw=await readPrivateInput({allowPipe:true});try{const packet=JSON.parse(raw.toString('utf8'));if(Object.keys(packet).join(',')!=='password'||typeof packet.password!=='string')throw Error('PRIVATE_PASSWORD_REQUIRED');password=Buffer.from(packet.password);}finally{raw.fill(0);}}
 else password=await readPrivateInput({prompt:'Seller store password: '});
 let store;const controller=new AbortController(),stop=()=>controller.abort();
 try{store=await openPortableSecretStore({directory:options.directory,password});password.fill(0);process.once('SIGINT',stop);process.once('SIGTERM',stop);const result=await runSellerSupervisor({...options,store,signal:controller.signal,onStatus:value=>console.error(JSON.stringify({alert:'seller-supervisor-stopped',...value}))});console.log(JSON.stringify(result));if(!['session-bound','time-bound','request-bound','provider-bound'].includes(result.reason))process.exitCode=1;}
 finally{password?.fill(0);store?.dispose();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({alert:'seller-supervisor-unconfirmed',needsOwner:true,message:'Preserve encrypted state. Do not restart an uncertain execution or reset counters.'}));process.exitCode=1;});
