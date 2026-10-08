import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {marketOperator} from './marketplace.ts';
import {configuredMarketStore} from './marketplace-store.ts';
import {configuredMarketX402Store} from './marketplace-x402-store.ts';
import {configuredWorkspaceStore} from './workspace-store.ts';
import {demoConfiguration,guardianCronConfiguration} from './demo-configuration.ts';
import {WorkspaceError} from './workspace-types.ts';
import {probeMarketStorage} from './market-storage-probe.ts';
import {configuredMarketMaintenance,pruneExpiredMarketContent} from './market-maintenance.ts';
import {reconcileMarketGuardianOrder} from './marketplace-x402.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {assertWorkspaceRequest,parseWorkspaceBody,workspaceFailure,workspaceHeaders} from './workspace-http.ts';
import {demoIngress} from './demo-http.ts';

export async function marketGuardianSnapshot(limit=20){
 const [market,settlements]=await Promise.all([configuredMarketStore().transact(s=>s),configuredMarketX402Store().transact(s=>s)]);
 const incidents:{operationId:string;code:string;transactionHash?:string;canReconcile:boolean}[]=[];
 for(const r of settlements.records.filter(r=>['verifying','settling','uncertain','settled'].includes(r.phase))){
  const transactionHash=r.transactionHash??r.outcome?.transaction;
  incidents.push({operationId:r.operationId,code:transactionHash?'PAYMENT_RECONCILIATION_REQUIRED':'PAYMENT_IDENTIFIER_REQUIRED',...(transactionHash?{transactionHash}:{}),canReconcile:Boolean(transactionHash)&&['uncertain','settling','settled','confirmed'].includes(r.phase)});
 }
 for(const r of market.archived??[])if(r.paymentPhase==='uncertain')incidents.push({operationId:r.operationId,code:'EXPIRED_PAYMENT_UNCERTAIN',...(r.transactionHash?{transactionHash:r.transactionHash}:{}),canReconcile:Boolean(r.transactionHash&&r.authorizationFingerprint)});
 for(const o of market.orders){
  if(o.phase==='execution-uncertain'||o.phase==='delivery-failed')incidents.push({operationId:o.operationId,code:o.phase==='execution-uncertain'?'EXECUTION_UNCERTAIN':'DELIVERY_FAILED',canReconcile:false});
  else if(o.fileDelivery?.files.some(f=>f.status==='pending'))incidents.push({operationId:o.operationId,code:'FILES_PENDING',canReconcile:false});
 }
 const reservations=market.orders.filter(o=>o.fileReservation&&!o.fileReservation.released);
 for(const entry of market.fileCleanup??[])incidents.push({operationId:entry.operationId,code:'EXPIRED_FILE_CLEANUP_PENDING',canReconcile:false});
 return {paused:market.paused??false,incidents:incidents.slice(0,limit),moreIncidents:incidents.length>limit,
  orders:market.orders.length,expiredOrders:market.orders.filter(o=>Date.parse(marketContentExpiresAt(o))<=Date.now()).length,
  recoveryControls:(market.archived??[]).length,fileReservedBytes:reservations.reduce((n,o)=>n+o.fileReservation!.maxBytes,0)+(market.fileCleanup??[]).reduce((n,e)=>n+e.maxBytes,0),
  configuration:demoConfiguration(),namespaceFingerprints:Object.fromEntries(['BAZAAR_WORKSPACE_PREFIX','BAZAAR_MARKET_PREFIX','BAZAAR_REVIEW_PREFIX','BAZAAR_MARKET_FILE_PREFIX'].map(k=>[k,process.env[k]?createHash('sha256').update(process.env[k]!).digest('hex'):null])),
  actions:{providerSuspension:'human-only',reconciliation:'read-ledger-only',paymentResubmission:false},observedAt:new Date().toISOString()};
}
export async function runMarketGuardian(){
 const snapshot=await marketGuardianSnapshot(1000),reconciliation=[];
 const reconciliationCursor=await configuredMarketStore().transact(s=>s.maintenance?.reconciliationCursor??'');
 const candidates=snapshot.incidents.filter(i=>i.canReconcile).sort((a,b)=>a.operationId.localeCompare(b.operationId));
 const selected=[...candidates.filter(i=>i.operationId>reconciliationCursor),...candidates.filter(i=>i.operationId<=reconciliationCursor)].slice(0,2);
 for(const incident of selected){
  try{await reconcileMarketGuardianOrder(incident.operationId);reconciliation.push({operationId:incident.operationId,confirmed:true});}
  catch{reconciliation.push({operationId:incident.operationId,confirmed:false,code:'RECONCILIATION_UNCONFIRMED'});}
 }
 if(selected.length)await configuredMarketStore().transact(s=>{s.maintenance={...s.maintenance,reconciliationCursor:selected[selected.length-1].operationId};});
 const cleanup=await pruneExpiredMarketContent({...configuredMarketMaintenance(),limit:2});
 const store=configuredWorkspaceStore(),owners=(await store.retentionOwnerIds()).sort();
 // A rotating operator-only cursor prevents inactive first accounts starving others.
 const cursor=await configuredMarketStore().transact(s=>s.maintenance?.workspaceCursor??'');
 const ordered=[...owners.filter(id=>id>cursor),...owners.filter(id=>id<=cursor)].slice(0,20);
 const workspaces=[];
 for(const ownerId of ordered){try{workspaces.push(await store.pruneExpiredContent(ownerId));}catch{workspaces.push({ownerId,code:'WORKSPACE_CLEANUP_UNCONFIRMED'});}}
 if(ordered.length)await configuredMarketStore().transact(s=>{s.maintenance={...s.maintenance,workspaceCursor:ordered[ordered.length-1],lastRunAt:new Date().toISOString()};});
 return {reconciliation,cleanup,workspaces,processedWorkspaceCount:ordered.length,paymentResubmission:false};
}
async function operator(request:Request){await demoIngress(request);assertWorkspaceRequest(request);await marketOperator(request.headers.get('authorization'));}
/** Machine-to-machine authentication. A cron request has no browser Origin and
 * targets its deployment hostname, which can differ from the public app domain.
 * Its configured secret must represent the existing operator permission. */
export function assertMarketGuardianCronRequest(request:Request,environment:Readonly<Record<string,string|undefined>>=process.env){
 const authorization=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');
 const expected=environment.BAZAAR_MARKET_OPERATOR_HASH;
 if(!authorization||!/^[a-f0-9]{64}$/.test(expected??'')||!timingSafeEqual(createHash('sha256').update(authorization[1]).digest(),Buffer.from(expected!,'hex')))throw new WorkspaceError('UNAUTHORIZED',401);
 const configuration=guardianCronConfiguration(environment);
 if(!configuration.credentialConfigured||!configuration.operatorHashMatches)throw new WorkspaceError('GUARDIAN_CRON_NOT_CONFIGURED',503);
 if(request.headers.has('origin'))throw new WorkspaceError('ORIGIN_FORBIDDEN',403);
 const url=new URL(request.url),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(request.method!=='GET'||url.pathname!=='/api/market/guardian/tick'||url.search||url.hash||url.username||url.password||(url.protocol!=='https:'&&(environment.VERCEL==='1'||!local||url.protocol!=='http:')))throw new WorkspaceError('INVALID_REQUEST',400);
}
export function createMarketGuardianTickHandler(run:()=>Promise<unknown>=runMarketGuardian){
 return async function tick(request:Request){try{
  assertMarketGuardianCronRequest(request);
  await marketOperator(request.headers.get('authorization'));
  return Response.json(await run(),{headers:workspaceHeaders});
 }catch(e){return workspaceFailure(e);}};
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
