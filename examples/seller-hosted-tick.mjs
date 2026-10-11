import {withSellerMcp,validateSellerConfiguration} from './seller-mcp-transport.mjs';
import {randomUUID} from 'node:crypto';
import {createSellerHttpAdapter} from './seller-http-adapter.mjs';
import {sellerCanonical,sellerHash} from './seller-service-card.mjs';
import {sellerUuid,createSellerIntent,validateSellerIntent,bindSellerOrder,readSellerJournal,sellerTool,listSellerOrders,inspectSellerIntent,executeSellerIntent,recoverSellerIntent,deliverSellerIntent,uncertainSellerIntent} from './seller-marketplace-worker.mjs';

const stateName='seller.hosted.tick',maximumTicks=1440,maximumExecutions=50,maximumMcpRequests=20,maximumDailyMcpRequests=5000;
const permittedTools=new Set(['get_bazaar_identity','report_market_capacity','list_market_orders','get_market_order','claim_market_order','deliver_market_order','uncertain_market_order']);
const reasons=new Set(['disabled','idle','delivered','uncertainty','quota','backoff','tick-bound','provider-bound','request-bound','time-bound','owner-stop','clock','locked','unconfirmed']);
const diagnosticCodes=new Set(['HOSTED_STORAGE_READ_FAILED','HOSTED_CHECKPOINT_FAILED','MCP_LEASE_UNCONFIRMED','MCP_FETCH_FAILED','MCP_FETCH_TIMEOUT','MCP_REDIRECT_DENIED','MCP_RESPONSE_UNCONFIRMED','MCP_HTTP_REJECTED','MCP_INITIALIZE_FAILED','MCP_ACTION_FAILED']);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const day=value=>new Date(value).toISOString().slice(0,10);
function binding(config){return sellerHash(sellerCanonical({bazaarOrigin:config.bazaarOrigin,ownerId:config.ownerId,agentId:config.agentId,cardHash:config.cardHash,allowedOrigins:config.allowedOrigins,agentAccessHash:sellerHash(config.agentAccess),providerAccessHash:sellerHash(config.providerAccess)}));}
function validateState(state,bindingHash){
 const keys=['version','bindingHash','day','ticks','providerRequests','executed','mcpRequests','lastObservedAt','cursor','pending','retryAt'].sort().join(',');
 if(!state||Object.keys(state).filter(k=>k!=='capacityReport').sort().join(',')!==keys||state.version!==1||state.bindingHash!==bindingHash||!integer(state.lastObservedAt,0,8640000000000000)||state.day!==day(state.lastObservedAt)||!integer(state.ticks,0,maximumTicks)||!integer(state.providerRequests,0,maximumExecutions)||!integer(state.executed,0,state.providerRequests)||!integer(state.mcpRequests,0,maximumDailyMcpRequests)||state.cursor!==null&&(typeof state.cursor!=='string'||!/^[a-zA-Z0-9_-]{1,512}$/.test(state.cursor))||!Array.isArray(state.pending)||state.pending.length>20||state.pending.some(id=>!sellerUuid.test(id))||new Set(state.pending).size!==state.pending.length||!integer(state.retryAt,0,8640000000000000))throw Error('HOSTED_STATE_REQUIRES_REVIEW');
 if(state.capacityReport!==undefined&&state.capacityReport!==null&&(!sellerUuid.test(state.capacityReport.reportId??'')||typeof state.capacityReport.ready!=='boolean'||!integer(state.capacityReport.usedToday,0,maximumExecutions)||!Number.isFinite(Date.parse(state.capacityReport.observedAt))||Buffer.byteLength(JSON.stringify(state.capacityReport))>2048))throw Error('HOSTED_CAPACITY_REQUIRES_REVIEW');
}
function retrySeconds(value){return typeof value==='string'&&/^\d{1,5}$/.test(value)&&integer(Number(value),1,86400)?Number(value):60;}
function orderContentExpiresAt(order){
 // get_market_order returns the stored order; list_market_orders additionally
 // decorates it with expiresAt. Both use the same fixed creation-based week.
 if(typeof order?.createdAt!=='string'||!Number.isFinite(Date.parse(order.createdAt)))throw stop('unconfirmed');
 const expiry=new Date(Date.parse(order.createdAt)+7*24*60*60*1000).toISOString();
 if(order.expiresAt!==undefined&&order.expiresAt!==expiry)throw stop('unconfirmed');return expiry;
}
function stop(reason){return Object.assign(Error('HOSTED_TICK_STOP'),{hostedReason:reason});}
function summary(reason,state,counts,extra={}){return {version:1,status:'completed',reason:reasons.has(reason)?reason:'unconfirmed',mcpRequests:counts.mcp,mcpHttpStatuses:[...counts.mcpHttpStatuses],toolCalls:counts.tools,providerRequests:counts.provider,executed:counts.executed,...(state?{dayTicks:state.ticks,dayProviderRequests:state.providerRequests}:{}),needsOwner:['uncertainty','unconfirmed','clock'].includes(reason)||Boolean(counts.incidents?.length),...(['unconfirmed','time-bound','owner-stop'].includes(reason)&&diagnosticCodes.has(counts.diagnosticCode)?{diagnosticCode:counts.diagnosticCode}:{}),...(counts.incidents?.length?{incidents:counts.incidents}:{}),...extra};}

/** External participant worker, one short invocation. The supplied store must
 * acknowledge durable writes and hold distributed locks for the entire tick.
 * No CLI, arbitrary imports, signing, payment, or service publication exists.
 * Missing storage, lost acknowledgements and expired deadlines fail closed.
 */
export async function runHostedSellerTick(input){
 const counts={mcp:0,mcpHttpStatuses:[],tools:0,provider:0,executed:0,incidents:[]};
 // These fixed codes expose where an acknowledgement was lost, never an error
 // message, endpoint, request/response body, header or private configuration.
 const diagnose=code=>{if(diagnosticCodes.has(code)&&!counts.diagnosticCode)counts.diagnosticCode=code;};
 if(input.enabled!==true)return summary('disabled',undefined,counts);
 const {store,withMcp=withSellerMcp,fetcher=fetch,providerFetcher=fetch,now=Date.now,signal,maxDurationMs=45000}=input;
 if(!store?.read||!store?.write||!store?.journal||!store?.acquireLock||!store?.assertLocks||typeof withMcp!=='function'||typeof fetcher!=='function'||typeof providerFetcher!=='function'||typeof now!=='function'||signal!==undefined&&!(signal instanceof AbortSignal)||!integer(maxDurationMs,1,45000))throw Error('HOSTED_CONFIGURATION_REQUIRED');
 const config=validateSellerConfiguration(structuredClone(input.config));
 if(!/^[a-zA-Z0-9_-]{43}$/.test(config.agentAccess??'')||!/^[a-zA-Z0-9_-]{43}$/.test(config.providerAccess??''))throw Error('HOSTED_CONFIGURATION_REQUIRED');
 const started=now();if(!integer(started,0,8640000000000000-maxDurationMs))throw Error('HOSTED_CLOCK_REQUIRED');
 const deadline=started+maxDurationMs,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),maxDurationMs);
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 let state,reason='idle',release,operationRelease,budgetTail=Promise.resolve(),writeTail=Promise.resolve(),observed=started,haltReason,contentDeadline;
 const check=()=>{if(haltReason)throw stop(haltReason);const value=now();if(!integer(value,0,8640000000000000)||value<observed||value<(state?.lastObservedAt??started))throw stop('clock');if(signal?.aborted)throw stop('owner-stop');if(controller.signal.aborted||value>=deadline)throw stop('time-bound');observed=value;return value;};
 const assertEffects=async()=>{const value=check();if(contentDeadline!==undefined&&value>=contentDeadline)throw stop('uncertainty');await store.assertLocks();const observed=check();if(contentDeadline!==undefined&&observed>=contentDeadline)throw stop('uncertainty');};
 const persist=()=>{
  const write=async()=>{await assertEffects();state.lastObservedAt=check();if(day(state.lastObservedAt)!==state.day)throw stop('time-bound');validateState(state,binding(config));await store.write(stateName,structuredClone(state));await assertEffects();};
  const pending=writeTail.then(write);writeTail=pending.catch(error=>{diagnose('HOSTED_CHECKPOINT_FAILED');haltReason=error.hostedReason??'unconfirmed';});return pending;
 };
 const charge=kind=>{
  const action=async()=>{check();if(kind==='provider'){if(counts.provider>=1||state.providerRequests>=maximumExecutions)throw stop('provider-bound');counts.provider++;state.providerRequests++;}
   else{if(counts.mcp>=maximumMcpRequests||state.mcpRequests>=maximumDailyMcpRequests)throw stop('request-bound');counts.mcp++;state.mcpRequests++;}await persist();};
  const pending=budgetTail.then(action);budgetTail=pending.catch(()=>{});return pending;
 };
 const bounded=async action=>{check();let handle;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{handle=setTimeout(()=>reject(stop('time-bound')),Math.max(1,deadline-check()));})]);}finally{clearTimeout(handle);} };
 const buffered=async(response,endpoint,maximumBytes)=>{
  if(response.redirected||response.status>=300&&response.status<400||response.url&&response.url!==endpoint)throw stop('unconfirmed');
  let bytes=0;for(const [key,value]of response.headers)bytes+=Buffer.byteLength(key+': '+value+'\r\n');
  if(bytes>maximumBytes)throw stop('unconfirmed');
  const reader=response.body?.getReader(),parts=[];
  try{if(reader)for(;;){const {done,value}=await bounded(()=>reader.read());check();if(done)break;bytes+=value.byteLength;if(bytes>maximumBytes)throw stop('unconfirmed');parts.push(Buffer.from(value));}
   return new Response([204,205,304].includes(response.status)?null:Buffer.concat(parts),{status:response.status,headers:response.headers});
  }catch(error){reader?.cancel().catch(()=>{});throw error;}finally{reader?.releaseLock();}
 };
 const quota=async error=>{state.retryAt=check()+retrySeconds(error.retryAfter)*1000;await persist();};
 try{
  check();try{release=await store.acquireLock('seller.hosted');}catch{throw stop('locked');}check();
  try{state=await store.read(stateName);}catch(error){diagnose('HOSTED_STORAGE_READ_FAILED');throw error;}
  if(state)validateState(state,binding(config));
  else state={version:1,bindingHash:binding(config),day:day(started),ticks:0,providerRequests:0,executed:0,mcpRequests:0,lastObservedAt:started,cursor:null,pending:[],retryAt:0};
  check();
  if(day(check())!==state.day){state.day=day(check());state.lastObservedAt=check();state.ticks=0;state.providerRequests=0;state.executed=0;state.mcpRequests=0;}
  if(state.retryAt>check())throw stop('backoff');
  if(state.ticks>=maximumTicks)throw stop('tick-bound');
  if(state.mcpRequests>=maximumDailyMcpRequests)throw stop('request-bound');
  state.ticks++;await persist();
  const marketTransport=async(url,init)=>{
   const endpoint=new URL('/api/mcp',config.bazaarOrigin).href,target=new URL(url instanceof Request?url.url:String(url));
   if(target.href!==endpoint||target.username||target.password||!['GET','POST','DELETE'].includes(init?.method??'GET'))throw stop('unconfirmed');
   await charge('mcp');try{await assertEffects();}catch(error){diagnose('MCP_LEASE_UNCONFIRMED');throw error;}
   let response;
   try{response=await bounded(()=>fetcher(url,{...init,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.any([combined,...(init?.signal?[init.signal]:[])])}));check();}
   catch(error){diagnose(['TimeoutError','AbortError'].includes(error?.name)||error?.hostedReason==='time-bound'?'MCP_FETCH_TIMEOUT':'MCP_FETCH_FAILED');throw error;}
   if(!integer(response?.status,100,599)||counts.mcpHttpStatuses.length>=maximumMcpRequests){diagnose('MCP_RESPONSE_UNCONFIRMED');throw stop('unconfirmed');}
   counts.mcpHttpStatuses.push(response.status);
   if(response.redirected||response.status>=300&&response.status<400||response.url&&response.url!==endpoint){diagnose('MCP_REDIRECT_DENIED');throw stop('unconfirmed');}
   if(response.status>=400&&!(response.status===405&&(init?.method??'GET')==='GET'))diagnose('MCP_HTTP_REJECTED');
   if(response.status===429){const error=Object.assign(Error('HOSTED_QUOTA'),{httpStatus:429,retryAfter:response.headers.get('retry-after')});await quota(error);throw error;}
   try{return await buffered(response,endpoint,262144);}catch(error){diagnose('MCP_RESPONSE_UNCONFIRMED');throw error;}
  };
  const providerTransport=async(url,init)=>{
   const endpoint=new URL(config.card.routeTemplate,config.card.url).href;
   if(String(url)!==endpoint||init.method!=='POST'||init.redirect!=='error')throw stop('unconfirmed');
   await charge('provider');await assertEffects();
   const response=await bounded(()=>providerFetcher(url,{...init,signal:AbortSignal.any([combined,...(init.signal?[init.signal]:[])])}));check();
   if(response.status===429){await quota({retryAfter:response.headers.get('retry-after')});throw Object.assign(Error('HOSTED_QUOTA'),{httpStatus:429});}
   return buffered(response,endpoint,16384);
  };
  let initialized=false;
  try{await withMcp({agentAccess:config.agentAccess,origin:config.bazaarOrigin,fetcher:marketTransport,maxRequests:maximumMcpRequests},async native=>{
   initialized=true;
   const tools={callTool:async(name,args)=>{await assertEffects();if(!permittedTools.has(name)||counts.tools>=maximumMcpRequests)throw stop('request-bound');counts.tools++;const result=await bounded(()=>native.callTool(name,args));check();return result;}};
   const identity=await sellerTool(tools,'get_bazaar_identity',{});
   if(identity.ownerId!==config.ownerId||identity.agentId!==config.agentId||identity.network!=='stellar:testnet'||!integer(identity.generation,1,Number.MAX_SAFE_INTEGER))throw stop('unconfirmed');
   // Exact authenticated health GET; it does not consume a provider execution.
   let providerReady=false;
   try{
    const healthUrl=new URL(config.card.routeTemplate+'/availability',config.card.url).href;
    await assertEffects();const health=await bounded(()=>providerFetcher(healthUrl,{method:'GET',headers:{authorization:'Bearer '+config.providerAccess,accept:'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal:combined}));
    const incoming=await buffered(health,healthUrl,1024);if(incoming.status===200){const body=await incoming.json();providerReady=body?.ready===true&&body.network==='stellar:testnet';}
   }catch{providerReady=false;}
   const reportTime=check(),ready=providerReady&&state.providerRequests<maximumExecutions&&state.mcpRequests+12<maximumDailyMcpRequests;
   // Recover the saved intention while it still describes this observation.
   // A fresh health result, changed budget or old clock needs a new report;
   // never replay a prior ready:true after detecting an unavailable adapter.
   const saved=state.capacityReport;
   if(!saved||saved.day!==day(reportTime)||saved.ready!==ready||saved.usedToday!==state.providerRequests||Math.abs(reportTime-Date.parse(saved.observedAt))>30000){state.capacityReport={serviceId:config.card.id,cardHash:config.cardHash,reportId:randomUUID(),ready,day:day(reportTime),usedToday:state.providerRequests,observedAt:new Date(reportTime).toISOString()};await persist();}
   await sellerTool(tools,'report_market_capacity',state.capacityReport);state.capacityReport=null;await persist();
   if(!state.pending.length){
    const page=await listSellerOrders(tools,{limit:20,...(state.cursor?{cursor:state.cursor}:{})});
    if(page.orders.length>20)throw stop('unconfirmed');
    const matching=page.orders.filter(order=>order.serviceId===config.card.id&&['paid','executing','execution-uncertain'].includes(order.phase));
    if(matching.some(order=>!sellerUuid.test(order.operationId??'')||order.sellerOwnerId!==config.ownerId||order.cardHash!==config.cardHash)||new Set(matching.map(order=>order.operationId)).size!==matching.length)throw stop('unconfirmed');
    for(const order of matching)orderContentExpiresAt(order);
    state.pending=matching.map(order=>order.operationId);state.cursor=page.nextCursor;await persist();
   }
   // Delivered/failed/unpaid entries require no new journal or provider request.
   // Consume at most one actionable paid or conserved attempt per invocation.
   while(state.pending.length){
    check();if(counts.tools+8>maximumMcpRequests||counts.mcp+9>maximumMcpRequests)throw stop('request-bound');
    const operationId=state.pending[0],name='seller.'+operationId;
    operationRelease=await store.acquireLock(name);check();
    try{
     const journal=store.journal(name);let intent;
     try{intent=await readSellerJournal(journal);}catch(error){const expired=new Set(['WORKER_CONTENT_EXPIRED','WORKER_CONTENT_EXPIRED_REQUIRES_REVIEW']);if(!expired.has(error.code)&&!expired.has(error.message))throw error;reason='uncertainty';counts.incidents.push({operationId,code:'WORKER_CONTENT_EXPIRED'});state.pending.shift();await persist();continue;}check();
     const probe=createSellerIntent({operationId,cardHash:config.cardHash,serviceId:config.card.id,providerOrigin:config.card.url,providerRoute:config.card.routeTemplate,ownerId:config.ownerId,agentId:config.agentId});
     let order;
     try{order=await inspectSellerIntent(probe,tools);}catch(error){
      if(error.httpStatus!==410||error.message!=='ORDER_CONTENT_EXPIRED')throw error;
      counts.incidents.push({operationId,code:'ORDER_CONTENT_EXPIRED'});reason='uncertainty';state.pending.shift();await persist();continue;
     }
     if(!intent&&order?.phase!=='paid'||intent&&['delivered','delivery-failed'].includes(intent.phase)){
      state.pending.shift();await persist();continue;
     }
     if(!intent){
      if(state.providerRequests>=maximumExecutions)throw stop('provider-bound');
      bindSellerOrder(probe,order,['paid']);
      const contentExpiresAt=orderContentExpiresAt(order);if(Date.parse(contentExpiresAt)<=check())throw stop('unconfirmed');
      intent={...probe,contentExpiresAt};await assertEffects();await journal.initialize(structuredClone(intent));await assertEffects();
     }
     validateSellerIntent(intent);
     if(intent.ownerId!==config.ownerId||intent.agentId!==config.agentId||intent.cardHash!==config.cardHash||intent.serviceId!==config.card.id||intent.providerOrigin!==config.card.url||intent.providerRoute!==config.card.routeTemplate)throw stop('unconfirmed');
     if(typeof intent.contentExpiresAt!=='string'||intent.contentExpiresAt!==orderContentExpiresAt(order)||Date.parse(intent.contentExpiresAt)<=check())throw stop('unconfirmed');
     contentDeadline=Date.parse(intent.contentExpiresAt);
     const options={...tools,persistIntent:async value=>{await assertEffects();await journal.append(value);await assertEffects();}};
     if(intent.phase==='claim-started')await recoverSellerIntent(intent,options);
     if(['provider-started','uncertain-report-started','execution-uncertain'].includes(intent.phase)){
      if(intent.phase!=='execution-uncertain')await uncertainSellerIntent(intent,options);
      reason='uncertainty';state.pending.shift();await persist();return;
     }
     if(['generated','delivery-started','delivery-uncertain'].includes(intent.phase))await deliverSellerIntent(intent,options);
     else if(['prepared','claimed'].includes(intent.phase)){
      if(!providerReady)throw stop('unconfirmed');
      if(state.providerRequests>=maximumExecutions)throw stop('provider-bound');
      const adapter=createSellerHttpAdapter({providerOrigin:config.card.url,route:config.card.routeTemplate,allowedOrigins:config.allowedOrigins,providerAccess:config.providerAccess,fetcher:providerTransport,timeoutMs:10000});
      await executeSellerIntent(intent,{...options,adapter});counts.executed++;state.executed++;await persist();
     }else throw stop('unconfirmed');
     reason='delivered';state.pending.shift();await persist();return;
    }finally{contentDeadline=undefined;await operationRelease();operationRelease=undefined;}
   }
  });}catch(error){diagnose(initialized?'MCP_ACTION_FAILED':'MCP_INITIALIZE_FAILED');throw error;}
 }catch(error){
  reason=error.hostedReason??(signal?.aborted?'owner-stop':controller.signal.aborted?'time-bound':error.httpStatus===429?'quota':'unconfirmed');
  if(state&&error.httpStatus===429&&reason==='quota'){try{await quota(error);}catch{reason='unconfirmed';}}
 }finally{
  clearTimeout(timer);
  try{if(operationRelease)await operationRelease();}catch{reason='unconfirmed';}
  try{if(release)await release();}catch{reason='unconfirmed';}
 }
 return summary(reason,state,counts,reason==='backoff'?{retryAfterSeconds:Math.ceil((state.retryAt-observed)/1000)}:{});
}
