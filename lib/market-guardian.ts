import {createHash,randomUUID} from 'node:crypto';
import {finiteGuardianEnabled,reserveFiniteGuardianIdle,claimGuardianPolicy,transitionGuardianPolicy,withGuardianWireScope,withGuardianIdleWireScope,guardianWireObservation,type GuardianPolicy} from './guardian-finite-budget.ts';
import {z} from 'zod';
import {marketOperator} from './marketplace.ts';
import {configuredMarketStore,type MarketState,type MarketStore} from './marketplace-store.ts';
import {configuredMarketX402Store,type MarketX402State} from './marketplace-x402-store.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {demoConfiguration} from './demo-configuration.ts';
import {WorkspaceError} from './workspace-types.ts';
import {probeMarketStorage} from './market-storage-probe.ts';
import {configuredMarketMaintenance,pruneExpiredMarketContent} from './market-maintenance.ts';
import {reconcileMarketGuardianOrder} from './marketplace-x402.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders} from './workspace-http.ts';
import {demoIngress} from './demo-http.ts';
import {assertMarketGuardianCronRequest} from './market-guardian-cron.ts';
export {assertMarketGuardianCronRequest} from './market-guardian-cron.ts';
function guardianFailure(error:unknown){
 if(error instanceof WorkspaceError&&'guardian'in error){
  return Response.json({error:{code:error.code},guardian:(error as WorkspaceError&{guardian:unknown}).guardian},{status:error.status,headers:{...workspaceHeaders,'Retry-After':String(error.retryAfter??60)}});
 }
 return workspaceFailure(error);
}

export const MARKET_GUARDIAN_LIMITS=Object.freeze({durationMs:45000,reconciliations:2,expiredOrders:2,workspaces:20,deliveryPendingMs:360000});
export type MarketGuardianIncident={operationId:string;code:string;transactionHash?:string;canReconcile:boolean};
/** Operator-only diagnostics contain identifiers and fixed codes, never an
 * authorization, prompt, generated result or uploaded object capability. */
export function marketGuardianIncidents(market:MarketState,settlements:MarketX402State,now=Date.now()):MarketGuardianIncident[]{
 const incidents:MarketGuardianIncident[]=[];
 for(const r of settlements.records){
  const order=market.orders.find(o=>o.operationId===r.operationId);
  // Ledger confirmation and the order's final CAS are separate durable writes.
  // Losing the latter acknowledgement must remain recoverable by the guardian.
  const finalizationPending=r.phase==='confirmed'&&Boolean(order&&!order.paymentVerifiedAt);
  if(!finalizationPending&&!['verifying','settling','uncertain','settled'].includes(r.phase))continue;
  const transactionHash=r.transactionHash??r.outcome?.transaction;
  incidents.push({operationId:r.operationId,code:finalizationPending?'PAYMENT_FINALIZATION_REQUIRED':transactionHash?'PAYMENT_RECONCILIATION_REQUIRED':'PAYMENT_IDENTIFIER_REQUIRED',...(transactionHash?{transactionHash}:{}),canReconcile:Boolean(transactionHash)&&['uncertain','settling','settled','confirmed'].includes(r.phase)});
 }
 for(const r of market.archived??[])if(r.paymentPhase==='uncertain')incidents.push({operationId:r.operationId,code:'EXPIRED_PAYMENT_UNCERTAIN',...(r.transactionHash?{transactionHash:r.transactionHash}:{}),canReconcile:Boolean(r.transactionHash&&r.authorizationFingerprint)});
 for(const r of market.archived??[])if(r.paymentPhase==='confirmed'&&r.sellerReservationPending)incidents.push({operationId:r.operationId,code:'EXPIRED_PAID_DELIVERY_PENDING',canReconcile:false});
 for(const o of market.orders){
  if(o.phase==='execution-uncertain'||o.phase==='delivery-failed')incidents.push({operationId:o.operationId,code:o.phase==='execution-uncertain'?'EXECUTION_UNCERTAIN':'DELIVERY_FAILED',canReconcile:false});
  else if(o.fileDelivery?.files.some(f=>f.status==='pending'))incidents.push({operationId:o.operationId,code:'FILES_PENDING',canReconcile:false});
  else if(['paid','executing'].includes(o.phase)&&now-Date.parse(o.updatedAt)>=MARKET_GUARDIAN_LIMITS.deliveryPendingMs)incidents.push({operationId:o.operationId,code:o.phase==='paid'?'PAID_DELIVERY_PENDING':'EXECUTION_PENDING',canReconcile:false});
 }
 for(const entry of market.fileCleanup??[])incidents.push({operationId:entry.operationId,code:'EXPIRED_FILE_CLEANUP_PENDING',canReconcile:false});
 return incidents;
}
export async function marketGuardianSnapshot(limit=20){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw new WorkspaceError('INVALID_REQUEST',400);
 const [market,settlements]=await Promise.all([configuredMarketStore().transact(s=>s),configuredMarketX402Store().transact(s=>s)]),now=Date.now();
 const incidents=marketGuardianIncidents(market,settlements,now),reservations=market.orders.filter(o=>o.fileReservation&&!o.fileReservation.released);
 return {paused:market.paused??false,incidents:incidents.slice(0,limit),moreIncidents:incidents.length>limit,
  orders:market.orders.length,expiredOrders:market.orders.filter(o=>Date.parse(marketContentExpiresAt(o))<=now).length,
  recoveryControls:(market.archived??[]).length,fileReservedBytes:reservations.reduce((n,o)=>n+o.fileReservation!.maxBytes,0)+(market.fileCleanup??[]).reduce((n,e)=>n+e.maxBytes,0),
  configuration:demoConfiguration(),namespaceFingerprints:Object.fromEntries(['BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_FILE_PREFIX'].map(k=>[k,process.env[k]?createHash('sha256').update(process.env[k]!).digest('hex'):null])),
  actions:{providerSuspension:'human-only',reconciliation:'read-ledger-only',paymentResubmission:false},observedAt:new Date(now).toISOString()};
}
type GuardianWorkspaceStore=Pick<ReturnType<typeof configuredWorkspaceStore>,'retentionOwnerIds'|'pruneExpiredContent'> & Partial<Pick<ReturnType<typeof configuredWorkspaceStore>,'maintenanceIndex'|'bootstrapMaintenanceIndex'>>;
type GuardianMarketIndex={initialized:boolean;index?:{version:1;nextExpiryAt:string|null;reconciliationDue:boolean;deliveryDue:boolean;operatorAttention?:boolean};guardianPolicy?:GuardianPolicy};
export type MarketGuardianDependencies={
 snapshot:(limit:number)=>Promise<Pick<Awaited<ReturnType<typeof marketGuardianSnapshot>>,'incidents'>>;
 marketStore:()=>MarketStore;workspaceStore:()=>GuardianWorkspaceStore;
 reconcile:(id:string)=>Promise<unknown>;
 cleanup:()=>ReturnType<typeof pruneExpiredMarketContent>;
 marketIndex:()=>Promise<GuardianMarketIndex>;
 reserveBackground:(commands:number,transferBytes:number)=>Promise<unknown>;
 dispatch:(operationId:string)=>Promise<unknown>;
 now:()=>number;
};
/** Dependency injection is internal to local tests; the HTTP handlers always
 * construct the production runner. No request can select an adapter or clock.
 * Stop starting work before the hosting deadline, without cancelling a durable
 * write whose outcome could otherwise become uncertain. */
export function createMarketGuardianRunner(overrides:Partial<MarketGuardianDependencies>={}){
 const deps:MarketGuardianDependencies={snapshot:marketGuardianSnapshot,marketStore:configuredMarketStore,workspaceStore:configuredWorkspaceStore,reconcile:reconcileMarketGuardianOrder,cleanup:()=>pruneExpiredMarketContent({...configuredMarketMaintenance(),limit:MARKET_GUARDIAN_LIMITS.expiredOrders}),
 marketIndex:async()=>{const store=deps.marketStore(),read=finiteGuardianEnabled()?store.finiteGuardianMaintenanceIndex:store.maintenanceIndex;if(!read)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);return read();},
 reserveBackground:async(commands,transferBytes)=>{if(finiteGuardianEnabled()){if(commands!==12||transferBytes!==32768)throw new WorkspaceError('GUARDIAN_IDLE_SOURCE_UNREVIEWED',503);return reserveFiniteGuardianIdle();}const {reserveContinuousFreeBackground}=await import('./continuous-free-budget.ts');return reserveContinuousFreeBackground({commands,transferBytes,reason:'guardian'});},
 dispatch:async(operationId)=>{const {dispatchMarketTextWake}=await import('./market-text-seller-runtime.ts');return dispatchMarketTextWake(operationId);},
 now:Date.now,...overrides};
 return async function run(){
 return withGuardianIdleWireScope(async()=>{
 const started=deps.now();let observed=started,timeBound=false;
 const available=()=>{if(timeBound)return false;const current=deps.now();if(!Number.isSafeInteger(current)||current<observed){timeBound=true;return false;}observed=current;if(current-started>=MARKET_GUARDIAN_LIMITS.durationMs){timeBound=true;return false;}return true;};
 if(!Number.isSafeInteger(started)||started<0)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
 if(process.env.BAZAAR_FREE_DEMO_MODE==='continuous'){
  // This reservation includes the credential check done by the HTTP tick.
  // Only tiny maintenance projections are read while no work is due.
  // The budget adapter adds its own four Lua/transport commands: 12 + 4 = 16.
  await deps.reserveBackground(12,32768);
  const workspaceStore=deps.workspaceStore();
  if(!workspaceStore.maintenanceIndex||!workspaceStore.bootstrapMaintenanceIndex)throw new WorkspaceError('MAINTENANCE_UNAVAILABLE',503);
  let [marketIndex,initialWorkspaceIndex]=await Promise.all([deps.marketIndex(),workspaceStore.maintenanceIndex()]);
  const finite=finiteGuardianEnabled();
  const work=async()=>{
  let workspaceIndex=initialWorkspaceIndex;
  let marketInitialized=marketIndex.initialized&&Boolean(marketIndex.index);
  if(workspaceIndex.needsBootstrap||!marketInitialized){
    if(!available())return {idle:false,indexInitialized:false,needsOperator:true,timeBound:true,paymentResubmission:false};
    if(!finite)await deps.reserveBackground(1100,64_000_000);
    if(!marketInitialized){const marketStore=deps.marketStore() as MarketStore&{bootstrapMaintenanceIndex?:()=>Promise<unknown>};if(marketStore.bootstrapMaintenanceIndex){await marketStore.bootstrapMaintenanceIndex();marketIndex=await deps.marketIndex();marketInitialized=marketIndex.initialized&&Boolean(marketIndex.index);}}
    if(workspaceIndex.needsBootstrap)workspaceIndex=await workspaceStore.bootstrapMaintenanceIndex!(MARKET_GUARDIAN_LIMITS.workspaces,started+MARKET_GUARDIAN_LIMITS.durationMs);
    if(!marketInitialized||!workspaceIndex.initialized)return {idle:false,indexInitialized:false,workspaceBootstrapPending:!workspaceIndex.initialized,needsOperator:true,timeBound:false,paymentResubmission:false};
  }
  const marketDue=Boolean(marketIndex.index&&(marketIndex.index.reconciliationDue||marketIndex.index.deliveryDue||marketIndex.index.nextExpiryAt!==null&&Date.parse(marketIndex.index.nextExpiryAt)<=workspaceIndex.observedAt));
  const workspaceDue=workspaceIndex.nextExpiryAt!==null&&workspaceIndex.nextExpiryAt<=workspaceIndex.observedAt;
  if(!marketDue&&!workspaceDue)return {idle:true,indexInitialized:true,needsOperator:Boolean(marketIndex.index?.operatorAttention),timeBound:false,processedWorkspaceCount:0,reconciliation:[],dispatch:[],cleanup:null,workspaces:[],incidents:[],paymentResubmission:false,limits:MARKET_GUARDIAN_LIMITS};
  if(!available())return {idle:false,indexInitialized:true,needsOperator:true,timeBound:true,paymentResubmission:false};
  if(!finite)await deps.reserveBackground(1100,64_000_000);
  const snapshot=marketDue?await deps.snapshot(1000):{incidents:[]},store=deps.marketStore(),cursors=await store.transact(s=>s.maintenance??{});
  const reconciliation:{operationId:string;confirmed:boolean;code?:string}[]=[],dispatch:{operationId:string;acknowledged:boolean;code?:string}[]=[],workspaces:(Awaited<ReturnType<GuardianWorkspaceStore['pruneExpiredContent']>>|{ownerId:string;code:string})[]=[];
  const candidateIncidents=snapshot.incidents.filter(i=>i.canReconcile).sort((a,b)=>a.operationId.localeCompare(b.operationId)),reconciliationCursor=cursors.reconciliationCursor??'';
  for(const incident of [...candidateIncidents.filter(i=>i.operationId>reconciliationCursor),...candidateIncidents.filter(i=>i.operationId<=reconciliationCursor)].slice(0,MARKET_GUARDIAN_LIMITS.reconciliations)){
    if(!available())break;
    try{await deps.reconcile(incident.operationId);reconciliation.push({operationId:incident.operationId,confirmed:true});}catch{reconciliation.push({operationId:incident.operationId,confirmed:false,code:'RECONCILIATION_UNCONFIRMED'});}
  }
  if(marketDue&&available()){
    const deliveryIds=await store.transact(s=>s.orders.filter(o=>['paid','executing'].includes(o.phase)&&o.textWake&&['pending','unconfirmed','dispatching'].includes(o.textWake.status)).map(o=>o.operationId).slice(0,2));
    for(const operationId of deliveryIds){if(!available())break;try{await deps.dispatch(operationId);dispatch.push({operationId,acknowledged:true});}catch{dispatch.push({operationId,acknowledged:false,code:'DELIVERY_WAKE_UNCONFIRMED'});}}
  }
  let cleanup:Awaited<ReturnType<typeof pruneExpiredMarketContent>>|{code:string}|null=null;
  if(marketIndex.index?.nextExpiryAt&&Date.parse(marketIndex.index.nextExpiryAt)<=workspaceIndex.observedAt&&available()){try{cleanup=await deps.cleanup();}catch{cleanup={code:'MARKET_CLEANUP_UNCONFIRMED'};}}
  let registryCode:string|undefined;
  if(workspaceDue&&available()){
    try{const owners=(await workspaceStore.retentionOwnerIds(workspaceIndex.observedAt)).sort(),cursor=cursors.workspaceCursor??'',ordered=[...owners.filter(id=>id>cursor),...owners.filter(id=>id<=cursor)].slice(0,MARKET_GUARDIAN_LIMITS.workspaces);
      for(const ownerId of ordered){if(!available())break;try{workspaces.push(await workspaceStore.pruneExpiredContent(ownerId,workspaceIndex.observedAt));}catch{workspaces.push({ownerId,code:'WORKSPACE_CLEANUP_UNCONFIRMED'});}}
    }catch{registryCode='WORKSPACE_REGISTRY_UNCONFIRMED';}
  }
  available();
  // A legacy due index can contain only an unidentified payment. One bounded
  // full pass acknowledges that operator incident without recurring full scans.
  // The native commit recomputes the index from fresh market AND settlement
  // revisions; a concurrently recorded transaction keeps reconciliation due.
  const refreshUnidentifiedPaymentIndex=marketDue&&!candidateIncidents.length&&!reconciliation.length&&!dispatch.length&&!workspaces.length&&!cleanup&&!registryCode&&snapshot.incidents.length>0
   &&snapshot.incidents.every(i=>!i.canReconcile&&!i.transactionHash&&['PAYMENT_IDENTIFIER_REQUIRED','EXPIRED_PAYMENT_UNCERTAIN'].includes(i.code))&&available();
  if(reconciliation.length||dispatch.length||workspaces.length||cleanup||refreshUnidentifiedPaymentIndex)await store.transact(s=>{s.maintenance={...s.maintenance,...(reconciliation.length?{reconciliationCursor:reconciliation[reconciliation.length-1].operationId}:{}),...(workspaces.length?{workspaceCursor:workspaces[workspaces.length-1].ownerId}:{}),lastRunAt:new Date(observed).toISOString()};});
  const incidents=snapshot.incidents.filter(i=>!i.canReconcile),needsOperator=timeBound||Boolean(registryCode)||incidents.length>0||reconciliation.some(r=>!r.confirmed)||dispatch.some(r=>!r.acknowledged)||Boolean(cleanup&&('code'in cleanup||cleanup.incidents.length))||workspaces.some(w=>'code'in w);
  return {idle:false,indexInitialized:true,reconciliation,dispatch,cleanup,workspaces,...(registryCode?{registryCode}:{}),incidents,processedWorkspaceCount:workspaces.length,timeBound,needsOperator,paymentResubmission:false,limits:MARKET_GUARDIAN_LIMITS};
  };
  if(!finite)return work();
  const pending={reconciliationDue:Boolean(marketIndex.index?.reconciliationDue),deliveryDue:Boolean(marketIndex.index?.deliveryDue),cleanupDue:Boolean(marketIndex.index?.nextExpiryAt&&Date.parse(marketIndex.index.nextExpiryAt)<=initialWorkspaceIndex.observedAt)||Boolean(initialWorkspaceIndex.nextExpiryAt!==null&&initialWorkspaceIndex.nextExpiryAt<=initialWorkspaceIndex.observedAt),bootstrapDue:!marketIndex.initialized||initialWorkspaceIndex.needsBootstrap,recoveryUsesExistingHolds:true,paymentResubmission:false,physicalDeletionMayRemainPending:true};
  const policyStore=deps.marketStore();
  if(!marketIndex.guardianPolicy||!policyStore.claimAndPrechargeGuardian||!policyStore.compareGuardianPolicy){const e=new WorkspaceError('GUARDIAN_POLICY_UNINITIALIZED',503,60);Object.assign(e,{guardian:pending});throw e;}
  if(!pending.reconciliationDue&&!pending.deliveryDue&&!pending.cleanupDue&&!pending.bootstrapDue)return work();
  try{
   const id=randomUUID(),claimed=claimGuardianPolicy(marketIndex.guardianPolicy,started,id);
   return await withGuardianWireScope(async()=>{
    await policyStore.claimAndPrechargeGuardian!(marketIndex.guardianPolicy!,claimed);
    const debited=transitionGuardianPolicy(claimed,id,'debited',started);
    let result:Awaited<ReturnType<typeof work>>;
    try{result=await work();}catch(error){
     try{await policyStore.compareGuardianPolicy!(debited,transitionGuardianPolicy(debited,id,'failed',deps.now()));}catch{}
     throw error;
    }
    const finished=transitionGuardianPolicy(debited,id,result.needsOperator||result.timeBound?'failed':'completed',deps.now());
    if(await policyStore.compareGuardianPolicy!(debited,finished)!==true)throw new WorkspaceError('GUARDIAN_COMPLETION_ACK_UNCONFIRMED',503,60);
    return {...result,finiteMaintenance:{windowDays:32,maximumFullPasses:2,attempts:finished.attempts.length,wire:guardianWireObservation(),cleanupGuaranteed:false,historyRecoveryUnchanged:true}};
   });
  }catch(error){if(error instanceof WorkspaceError)Object.assign(error,{guardian:{...pending,...(error.code==='GUARDIAN_INITIAL_CREDIT_UNCONFIRMED'?{maintenanceCreditStatus:'initial-credit-unconfirmed'}:{})}});throw error;}

 }
 const snapshot=await deps.snapshot(1000),reconciliation:{operationId:string;confirmed:boolean;code?:string}[]=[],store=deps.marketStore();
 const cursors=await store.transact(s=>s.maintenance??{}),reconciliationCursor=cursors.reconciliationCursor??'';
 const candidates=snapshot.incidents.filter(i=>i.canReconcile).sort((a,b)=>a.operationId.localeCompare(b.operationId));
 const selected=[...candidates.filter(i=>i.operationId>reconciliationCursor),...candidates.filter(i=>i.operationId<=reconciliationCursor)].slice(0,MARKET_GUARDIAN_LIMITS.reconciliations);
 for(const incident of selected){
  if(!available())break;
  try{await deps.reconcile(incident.operationId);reconciliation.push({operationId:incident.operationId,confirmed:true});}
  catch{reconciliation.push({operationId:incident.operationId,confirmed:false,code:'RECONCILIATION_UNCONFIRMED'});}
 }
 let cleanup:Awaited<ReturnType<typeof pruneExpiredMarketContent>>|{code:string}|null=null;
 if(available()){try{cleanup=await deps.cleanup();}catch{cleanup={code:'MARKET_CLEANUP_UNCONFIRMED'};}}
 let workspaceStore:GuardianWorkspaceStore|undefined,owners:string[]=[],registryCode:string|undefined;
 if(available()){try{workspaceStore=deps.workspaceStore();owners=(await workspaceStore.retentionOwnerIds()).sort();}catch{registryCode='WORKSPACE_REGISTRY_UNCONFIRMED';}}
 // A rotating operator-only cursor prevents inactive first accounts starving others.
 const cursor=cursors.workspaceCursor??'',ordered=[...owners.filter(id=>id>cursor),...owners.filter(id=>id<=cursor)].slice(0,MARKET_GUARDIAN_LIMITS.workspaces);
 const workspaces:(Awaited<ReturnType<GuardianWorkspaceStore['pruneExpiredContent']>>|{ownerId:string;code:string})[]=[];
 for(const ownerId of ordered){if(!available())break;try{workspaces.push(await workspaceStore!.pruneExpiredContent(ownerId));}catch{workspaces.push({ownerId,code:'WORKSPACE_CLEANUP_UNCONFIRMED'});}}
 available();
 // Persist only attempted work. Skipped owners and payments stay eligible for
 // the following tick, including after a bounded or failed run.
 await store.transact(s=>{s.maintenance={...s.maintenance,...(reconciliation.length?{reconciliationCursor:reconciliation[reconciliation.length-1].operationId}:{}),...(workspaces.length?{workspaceCursor:workspaces[workspaces.length-1].ownerId}:{}),lastRunAt:new Date(observed).toISOString()};});
 const incidents=snapshot.incidents.filter(i=>!i.canReconcile);
 const needsOperator=timeBound||incidents.length>0||reconciliation.some(r=>!r.confirmed)||Boolean(registryCode)||Boolean(cleanup&&('code'in cleanup||cleanup.incidents.length))||workspaces.some(w=>'code'in w);
 return {reconciliation,cleanup,workspaces,...(registryCode?{registryCode}:{}),incidents,processedWorkspaceCount:workspaces.length,timeBound,needsOperator,paymentResubmission:false,limits:MARKET_GUARDIAN_LIMITS};
 });
 };
}
export async function runMarketGuardian(){return createMarketGuardianRunner()();}
async function operator(request:Request){await demoIngress(request);assertWorkspaceRequest(request);await marketOperator(request.headers.get('authorization'));}
export function createMarketGuardianTickHandler(run:()=>Promise<unknown>=runMarketGuardian){
 return async function tick(request:Request){try{
  assertMarketGuardianCronRequest(request);
  await marketOperator(request.headers.get('authorization'));
  return Response.json(await run(),{headers:workspaceHeaders});
 }catch(e){return guardianFailure(e);}};
}
export const marketGuardianHandlers={
 async read(request:Request){try{await operator(request);return Response.json(await marketGuardianSnapshot(),{headers:workspaceHeaders});}catch(e){return workspaceFailure(e);}},
 async write(request:Request){try{await operator(request);const input=await parseWorkspaceBody(request,z.discriminatedUnion('action',[
  z.object({action:z.literal('probe-storage')}).strict(),z.object({action:z.literal('run')}).strict(),
  z.object({action:z.literal('reconcile'),operationId:z.string().uuid()}).strict()]),1024);
  if(input.action==='probe-storage')return Response.json(await probeMarketStorage(),{headers:workspaceHeaders});
  if(input.action==='reconcile'){const operation=await reconcileMarketGuardianOrder(input.operationId);return Response.json({operationId:operation.operationId,verified:Boolean(operation.paymentVerifiedAt),paymentResubmission:false},{headers:workspaceHeaders});}
  return Response.json(await runMarketGuardian(),{headers:workspaceHeaders});
 }catch(e){return workspaceFailure(e);}},
 tick:createMarketGuardianTickHandler(),
};
