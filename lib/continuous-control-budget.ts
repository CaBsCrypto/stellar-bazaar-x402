import {SPLIT_READ_PIPELINE_LIMITS,splitReadonlyIngress} from './split-ingress-policy.ts';
import {finitePilotProfile,FINITE_PILOT_ID} from './finite-pilot-budget.ts';
import {pilotReviewProfile,withPilotReviewBudget} from './pilot-review-transport.ts';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {Redis} from '@upstash/redis';
import type {OperationalRequestClass} from './operational-pressure.ts';
import {nativeRedisDescriptor} from './catalog-budget.ts';
import {WorkspaceError} from './workspace-types.ts';
import {workspaceRegistryTransportMaximum,COMPACT_WORKSPACE_REGISTRY_MAX_BYTES,isCompactWorkspaceTransport} from './quota-registry-patch.ts';
import {continuousFreeBudgetConfiguration} from './continuous-free-budget.ts';
import {compactTransportV2,freePlanTransportProfile} from './free-plan-transport-profile.ts';
import {continuousPerOrderStorage} from './per-order-storage-profile.ts';
import {isPerOrderPaymentSimulation,isPerOrderPaymentEnabled,perOrderProductionPaymentsConfigured} from './per-order-payment-profile.ts';
import {marketPageFromRequest,marketPageSchema} from './market-pagination.ts';
import {starterActionForRequest,withPublicStarterAction} from './public-registration-profile.ts';

const MiB=1048576,KiB=1024;
export const CONTINUOUS_CONTROL_BUDGET=Object.freeze({
 metadataAnonymous:Object.freeze({commands:64,wireBytes:6*MiB}),
 metadataAuthenticated:Object.freeze({commands:64,wireBytes:8*MiB}),
 compactBootstrap:Object.freeze({commands:160,wireBytes:8*MiB}),
 compactBootstrapV2:Object.freeze({commands:160,wireBytes:3*MiB}),
 read:Object.freeze({commands:160,wireBytes:20*MiB}),
 seller:Object.freeze({commands:216,wireBytes:28*MiB}),
 compactRead:Object.freeze({commands:160,wireBytes:4*MiB}),
 compactOrderRead:Object.freeze({commands:160,wireBytes:6*MiB+256*KiB}),
 compactPrivateHistory:Object.freeze({commands:160,wireBytes:4*MiB}),
 compactObservedMetadata:Object.freeze({commands:160,wireBytes:8*MiB}),
 compactIdentity:Object.freeze({commands:160,wireBytes:4*MiB}),
 compactSeller:Object.freeze({commands:216,wireBytes:10*MiB}),
 compactOrderCreate:Object.freeze({commands:524,wireBytes:12*MiB}),
 compactFinancialUnsigned:Object.freeze({commands:504,wireBytes:12*MiB}),
 compactFinancialSigned:Object.freeze({commands:504,wireBytes:46*MiB}),
 compactFinancialReconcile:Object.freeze({commands:504,wireBytes:16*MiB}),
 compactV2Read:Object.freeze({commands:160,wireBytes:2*MiB}),
 compactV2OrderRead:Object.freeze({commands:160,wireBytes:3*MiB}),
 compactV2PrivateHistory:Object.freeze({commands:160,wireBytes:3*MiB}),
 compactV2ObservedMetadata:Object.freeze({commands:160,wireBytes:3*MiB}),
 compactV2Identity:Object.freeze({commands:160,wireBytes:1.5*MiB}),
 publicIdentityProjection:Object.freeze({commands:64,wireBytes:1.25*MiB}),
 // Native wallet controls retain their original admission/recovery profiles.
 // Both scopes include credential proofs, budget/owner quotas and wallet CAS;
 // completion additionally includes its bounded challenge/document reads.
 compactV2WalletChallenge:Object.freeze({commands:160,wireBytes:4*MiB}),
 compactV2WalletComplete:Object.freeze({commands:160,wireBytes:6*MiB}),
 compactV2Seller:Object.freeze({commands:216,wireBytes:4*MiB}),
 pilotCapacity:Object.freeze({commands:216,wireBytes:4*MiB}),
 pilotOrderCreate:Object.freeze({commands:800,wireBytes:6*MiB}),
 pilotSigned:Object.freeze({commands:1200,wireBytes:12.75*MiB}),
 compactV2Capacity:Object.freeze({commands:216,wireBytes:5*MiB}),
 compactV2OrderCreate:Object.freeze({commands:524,wireBytes:6*MiB}),
 // Admission reads at most50+50 bounded4-KiB summaries. Native create guards
 // contain only market(128KiB), registry(32KiB), permissions(4KiB) and two
 // revisions; order/history values retain their196KiB caps. The conservative
 // complete create bound is below10MiB, including nested JSON escaping.
 // New history pages use a bounded atomic owner-scoped batch; legacy pages
 // keep their original maximum and price.
 perOrderV1OrderCreate:Object.freeze({commands:800,wireBytes:8*MiB}),
 perOrderV1LegacyOrderCreate:Object.freeze({commands:800,wireBytes:12*MiB}),
 perOrderV1History:Object.freeze({commands:320,wireBytes:12*MiB}),
 // The first native page with a validated limit of one reads one bounded
 // history projection, not the twenty projections covered by the full page.
 perOrderBatchHistory:Object.freeze({commands:320,wireBytes:2*MiB}),
 perOrderBatchRead:Object.freeze({commands:160,wireBytes:1.8125*MiB}),
 perOrderBatchSeller:Object.freeze({commands:216,wireBytes:2.875*MiB}),
 perOrderBatchUnsigned:Object.freeze({commands:504,wireBytes:3.625*MiB}),
 perOrderBatchSigned:Object.freeze({commands:1200,wireBytes:16*MiB}),
 perOrderBatchReconcile:Object.freeze({commands:504,wireBytes:2.875*MiB}),
 perOrderBatchNativeText:Object.freeze({commands:256,wireBytes:2*MiB}),
 perOrderV1FirstHistoryPage:Object.freeze({commands:320,wireBytes:3*MiB}),
 compactV2FinancialUnsigned:Object.freeze({commands:504,wireBytes:5*MiB}),
 compactV2FinancialSigned:Object.freeze({commands:504,wireBytes:18*MiB}),
 perOrderV1FinancialSigned:Object.freeze({commands:1200,wireBytes:18*MiB}),
 compactV2FinancialReconcile:Object.freeze({commands:504,wireBytes:6*MiB}),
 nativeText:Object.freeze({commands:256,wireBytes:16*MiB}),
 nativeReadiness:Object.freeze({commands:256,wireBytes:8*MiB}),
 compactNativeText:Object.freeze({commands:256,wireBytes:10*MiB}),
 compactNativeReadiness:Object.freeze({commands:256,wireBytes:5*MiB}),
 compactNativeTextV2:Object.freeze({commands:256,wireBytes:3*MiB}),
 compactNativeReadinessV2:Object.freeze({commands:256,wireBytes:1*MiB}),
 responseBytes:512*KiB,httpAllowanceBytes:768*KiB,compactResponseBytes:128*KiB,compactHttpAllowanceBytes:256*KiB,
});
type Limit={readonly commands:number;readonly wireBytes:number};
type Observation={commands:number;outboundBytes:number;inboundBytes:number;requests:number};
type Context={boundRequest?:Request;identityProjection?:boolean;kind?:OperationalRequestClass;authenticated:boolean;nativeText:boolean;nativeReadiness:boolean;compactRegistry:boolean;financialOperationId?:string;perOrderOperationId?:string;perOrderProfile?:'batch-v1';responseBytes:number;httpAllowanceBytes:number;limit:Limit;observation:Observation;failed:boolean};
const scope=new AsyncLocalStorage<Context>();
/** The injected offline provider represents another process with its own HTTP
 * accounting. A public argument or production environment cannot grant this
 * escape; the root simulation capability must still be active for this ID. */
export function outsideContinuousControlBudgetForSimulation<T>(operationId:string,handler:()=>Promise<T>):Promise<T>{
 if(!isPerOrderPaymentSimulation(operationId))throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);
 return scope.exit(handler);
}
const failure=()=>new WorkspaceError('CONTINUOUS_CONTROL_TRANSPORT_BUDGET',503,60);
const active=()=>process.env.BAZAAR_FREE_DEMO_MODE==='continuous';
/** The native financial route supplies the operation scope before credentials.
 * This clamp grants no authority. Original recovery retains its legacy bounds. */
function financialOperation(kind:OperationalRequestClass,request?:Request){
 if(!request||kind.bootstrapCreation||kind.profile!=='recovery'||kind.newOperation||kind.workload!=='financial'||request.method!=='POST')return undefined;
 const match=/^\/api\/market\/orders\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(?:\/x402)?$/.exec(new URL(request.url).pathname),id=match?.[1];
 if(!id||id==='31c97193-be74-4b9d-b0a3-f3890b0a41e8')return undefined;
 if(!freePlanTransportProfile()||process.env.VERCEL_ENV!=='production')return undefined;
 if(![8500000000,9900000000,9950000000].includes(continuousFreeBudgetConfiguration()?.transferBytes??0))return undefined;
 // Server configuration can select a conservative accounting clamp before the
 // route establishes its capability. It grants no authentication or transport.
 const perOrder=continuousPerOrderStorage()&&(isPerOrderPaymentEnabled(id)||perOrderProductionPaymentsConfigured());
 const v2=compactTransportV2(),limit=new URL(request.url).pathname.endsWith('/x402')?request.headers.get('payment-signature')?v2?perOrder?CONTINUOUS_CONTROL_BUDGET.perOrderV1FinancialSigned:CONTINUOUS_CONTROL_BUDGET.compactV2FinancialSigned:CONTINUOUS_CONTROL_BUDGET.compactFinancialSigned:v2?CONTINUOUS_CONTROL_BUDGET.compactV2FinancialUnsigned:CONTINUOUS_CONTROL_BUDGET.compactFinancialUnsigned:v2?CONTINUOUS_CONTROL_BUDGET.compactV2FinancialReconcile:CONTINUOUS_CONTROL_BUDGET.compactFinancialReconcile;
 return {id,limit};
}
function limitFor(kind:OperationalRequestClass,authenticated:boolean,compactRegistry=false,singleOrder=true,firstHistoryPage=false):Limit|undefined{
 if(kind.bootstrapCreation)return compactRegistry&&kind.profile==='authenticated'&&kind.newOperation?compactTransportV2()?CONTINUOUS_CONTROL_BUDGET.compactBootstrapV2:CONTINUOUS_CONTROL_BUDGET.compactBootstrap:undefined;
 if(compactRegistry&&compactTransportV2()){
  if(kind.workload==='wallet-binding'&&kind.profile==='authenticated'&&kind.newOperation)return CONTINUOUS_CONTROL_BUDGET.compactV2WalletChallenge;
  if(kind.workload==='wallet-binding'&&kind.profile==='recovery'&&!kind.newOperation)return CONTINUOUS_CONTROL_BUDGET.compactV2WalletComplete;
  if(continuousPerOrderStorage()){
   if(kind.profile==='authenticated'&&kind.newOperation&&kind.workload==='order-create')return CONTINUOUS_CONTROL_BUDGET.perOrderV1OrderCreate;
   if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='orders'&&!singleOrder)return firstHistoryPage?(finitePilotProfile()?{...CONTINUOUS_CONTROL_BUDGET.perOrderBatchHistory,wireBytes:1.5*MiB}:CONTINUOUS_CONTROL_BUDGET.perOrderBatchHistory):CONTINUOUS_CONTROL_BUDGET.perOrderV1History;
  }
  if(kind.profile==='authenticated'&&kind.newOperation&&kind.workload==='order-create')return CONTINUOUS_CONTROL_BUDGET.compactV2OrderCreate;
  if(kind.profile==='public'&&!kind.newOperation&&kind.workload==='observed-metadata')return CONTINUOUS_CONTROL_BUDGET.compactV2ObservedMetadata;
  if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='identity')return CONTINUOUS_CONTROL_BUDGET.compactV2Identity;
  if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='orders')return singleOrder?CONTINUOUS_CONTROL_BUDGET.compactV2OrderRead:CONTINUOUS_CONTROL_BUDGET.compactV2Read;
  if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='private-history')return CONTINUOUS_CONTROL_BUDGET.compactV2PrivateHistory;
  if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='seller-control')return CONTINUOUS_CONTROL_BUDGET.compactV2Seller;
  if(kind.profile==='authenticated'&&kind.workload==='capacity')return pilotReviewProfile()?(finitePilotProfile()?{...CONTINUOUS_CONTROL_BUDGET.pilotCapacity,wireBytes:3.75*MiB}:CONTINUOUS_CONTROL_BUDGET.pilotCapacity):CONTINUOUS_CONTROL_BUDGET.compactV2Capacity;
 }
 if(kind.profile==='authenticated'&&kind.newOperation&&kind.workload==='order-create'&&compactRegistry)return CONTINUOUS_CONTROL_BUDGET.compactOrderCreate;
 if(kind.profile==='public'&&!kind.newOperation&&kind.workload==='metadata')return authenticated?CONTINUOUS_CONTROL_BUDGET.metadataAuthenticated:CONTINUOUS_CONTROL_BUDGET.metadataAnonymous;
 if(kind.profile==='public'&&!kind.newOperation&&kind.workload==='observed-metadata')return compactRegistry?CONTINUOUS_CONTROL_BUDGET.compactObservedMetadata:CONTINUOUS_CONTROL_BUDGET.read;
 if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='identity'&&compactRegistry)return CONTINUOUS_CONTROL_BUDGET.compactIdentity;
 if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='orders'&&compactRegistry)return singleOrder?CONTINUOUS_CONTROL_BUDGET.compactOrderRead:CONTINUOUS_CONTROL_BUDGET.compactRead;
 if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='private-history'&&compactRegistry)return CONTINUOUS_CONTROL_BUDGET.compactPrivateHistory;
 if(kind.profile==='recovery'&&!kind.newOperation&&['identity','orders','private-history'].includes(kind.workload??''))return compactRegistry?CONTINUOUS_CONTROL_BUDGET.compactRead:CONTINUOUS_CONTROL_BUDGET.read;
 if(kind.profile==='recovery'&&!kind.newOperation&&kind.workload==='seller-control'||kind.profile==='authenticated'&&kind.workload==='capacity')return compactRegistry?CONTINUOUS_CONTROL_BUDGET.compactSeller:CONTINUOUS_CONTROL_BUDGET.seller;
 return undefined;
}
/** Pure server-side price discovery for operator preflight; it grants no
 * request scope, credential, operation credit or permission. */
export function continuousControlBudgetLimits(kind:OperationalRequestClass,authenticated:boolean,singleOrder=true){return limitFor(kind,authenticated,isCompactWorkspaceTransport(),singleOrder);}
/** Only the native list endpoint or exact native list tool selects the smaller
 * read scope. Individual reads include the ownership/hold lookup and expired
 * settlement recovery. Arguments never select a scope or grant authority. */
function newHistorySection(cursor?:string){if(cursor===undefined)return true;try{const value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));return value?.v===1&&value.s==='n'&&typeof value.o==='string'&&/^[a-f0-9]{32}$/.test(value.o)&&Object.keys(value).sort().join(',')===(value.c===undefined?'o,s,v':'c,o,s,v')&&(value.c===undefined||typeof value.c==='string'&&value.c.length<=400);}catch{return false;}}
async function orderReadShape(kind:OperationalRequestClass,request?:Request):Promise<{singleOrder:boolean;firstHistoryPage:boolean}>{
 const single={singleOrder:true,firstHistoryPage:false},page={singleOrder:false,firstHistoryPage:false};
 if(kind.workload!=='orders'||!request)return single;
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path==='/api/market/orders'){
  try{const parsed=marketPageFromRequest(request);return {...page,firstHistoryPage:newHistorySection(parsed.cursor)&&(!finitePilotProfile()||parsed.limit===1)};}catch{return page;}
 }
 if(request.method!=='POST'||path!=='/api/mcp')return single;
 const reader=request.clone().body?.getReader();if(!reader)return single;
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>64*KiB){void reader.cancel();throw failure();}chunks.push(part.value);}}finally{reader.releaseLock();}
 try{
  const rpc=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(rpc?.method!=='tools/call'||rpc?.params?.name!=='list_market_orders')return single;
  const parsed=marketPageSchema.safeParse(rpc.params.arguments??{});
  return {...page,firstHistoryPage:parsed.success&&newHistorySection(parsed.data.cursor)&&(!finitePilotProfile()||parsed.data.limit===1)};
 }catch{return single;}
}
/** The smaller new-record bound never reprices the protected legacy incident.
 * Parsing selects accounting only; the native handler still validates authority,
 * the complete order schema and its immutable buyer/card/payer binding. */
async function nativeOrderCreate(request?:Request){
 if(!request||request.method!=='POST')return false;
 const path=new URL(request.url).pathname;if(path!=='/api/market/orders'&&path!=='/api/mcp')return false;
 const reader=request.clone().body?.getReader();if(!reader)return false;
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>64*KiB){void reader.cancel();throw failure();}chunks.push(part.value);}}finally{reader.releaseLock();}
 try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),id=path==='/api/market/orders'?body?.operationId:body?.method==='tools/call'&&body?.params?.name==='create_market_order'?body.params.arguments?.operationId:undefined;
  return typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)&&id!=='31c97193-be74-4b9d-b0a3-f3890b0a41e8';
 }catch{return false;}
}
function fresh(kind:OperationalRequestClass|undefined,authenticated:boolean,limit:Limit,nativeText=false,compactRegistry=false,nativeReadiness=false):Context{return {kind:kind?{...kind}:undefined,authenticated,limit,nativeText,nativeReadiness,compactRegistry,responseBytes:compactRegistry?CONTINUOUS_CONTROL_BUDGET.compactResponseBytes:CONTINUOUS_CONTROL_BUDGET.responseBytes,httpAllowanceBytes:compactRegistry?CONTINUOUS_CONTROL_BUDGET.compactHttpAllowanceBytes:CONTINUOUS_CONTROL_BUDGET.httpAllowanceBytes,observation:{commands:0,outboundBytes:0,inboundBytes:0,requests:0},failed:false};}
async function boundedResult<T>(handler:()=>Promise<T>):Promise<T>{
 const result=await handler();
 if(result instanceof Response){
  const headerBytes=Buffer.byteLength(JSON.stringify([...result.headers]));
  const context=scope.getStore()!;
  if(headerBytes>(context.compactRegistry?32:128)*KiB)throw failure();
  const reader=result.clone().body?.getReader();let bytes=0;
  if(reader)try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>context.responseBytes){void reader.cancel();throw failure();}}}finally{reader.releaseLock();}
 }
 return result;
}
/** The outer server classifier creates this scope before credential proof,
 * ingress and account quota work. A request argument cannot select its limit. */
export async function withContinuousControlBudget<T>(kind:OperationalRequestClass,authenticated:boolean,handler:()=>Promise<T>,options:{request?:Request}={}):Promise<T>{
 if(!active())return handler();
 // Nested helpers keep the outer hard scope, even if its request body was read.
 if(scope.getStore())return handler();
 const financial=financialOperation(kind,options.request);
 const walletPath=options.request?new URL(options.request.url).pathname:undefined;
 const split=options.request?splitReadonlyIngress(walletPath!,options.request.method):undefined;
 const nativeSplit=split&&kind.profile===split.profile&&kind.newOperation===false&&kind.workload===split.workload&&isCompactWorkspaceTransport()&&compactTransportV2()?split:undefined;
 if(kind.workload?.startsWith('split-')&&!nativeSplit)throw failure();
 const nativeWallet=kind.workload==='wallet-binding'&&!kind.bootstrapCreation&&isCompactWorkspaceTransport()&&compactTransportV2()&&options.request?.method==='POST'&&(
  walletPath==='/api/account/wallet/challenge'&&kind.profile==='authenticated'&&kind.newOperation||
  walletPath==='/api/account/wallet/complete'&&kind.profile==='recovery'&&!kind.newOperation);
 // A fabricated internal kind cannot install this cheaper scope for another
 // route, method, profile, MCP invocation or a call without a native request.
 if(kind.workload==='wallet-binding'&&!nativeWallet)return handler();
 if(!financial&&!nativeWallet&&!nativeSplit&&!limitFor(kind,authenticated)&&!kind.bootstrapCreation&&!(kind.profile==='authenticated'&&kind.newOperation&&kind.workload==='order-create'))return handler();
 const compactRegistry=isCompactWorkspaceTransport(),read=await orderReadShape(kind,options.request),starterAction=await starterActionForRequest(kind,options.request),selected=nativeSplit?nativeSplit.control:financial?financial.limit:limitFor(kind,authenticated,compactRegistry,read.singleOrder,read.firstHistoryPage);
 let limit=selected===CONTINUOUS_CONTROL_BUDGET.perOrderV1OrderCreate&&!await nativeOrderCreate(options.request)?CONTINUOUS_CONTROL_BUDGET.perOrderV1LegacyOrderCreate:selected;if(!limit)return handler();
 const boundedReview=pilotReviewProfile()&&(kind.workload==='capacity'||limit===CONTINUOUS_CONTROL_BUDGET.perOrderV1OrderCreate||!!financial);
 if(boundedReview&&limit===CONTINUOUS_CONTROL_BUDGET.perOrderV1OrderCreate)limit=CONTINUOUS_CONTROL_BUDGET.pilotOrderCreate;
 const identityHttp=pilotReviewProfile()&&kind.workload==='identity'&&compactRegistry;
 if(options.request&&(Buffer.byteLength(options.request.url)+Buffer.byteLength(JSON.stringify([...options.request.headers]))>(compactRegistry?32:64)*KiB))throw failure();
 // Wallet POST bodies are capped at1024 by their native schemas. A32-KiB
 // response clamp keeps the256-KiB HTTP allowance conservative: request and
 // response metadata each32KiB, body1KiB, response32KiB, plus complete's sole
 // fixed Horizon account response64KiB (8-second, redirect-error reader).
 // Horizon remains an explicit allowance, not a measuredExternal observation.
 return withPublicStarterAction(options.request,starterAction,()=>withPilotReviewBudget(boundedReview,()=>scope.run({...fresh(kind,authenticated,limit,false,compactRegistry),boundRequest:options.request,...(nativeWallet?{responseBytes:32*KiB}:{}),...(nativeSplit?{responseBytes:16*KiB,httpAllowanceBytes:128*KiB}:{}),...(identityHttp?{responseBytes:32*KiB,httpAllowanceBytes:160*KiB}:{}),...(financial?{financialOperationId:financial.id}:{})},async()=>{
  try{return await boundedResult(handler);}catch(error){scope.getStore()!.failed=true;throw error;}
 })));
}
/** Native background text work has an independent fresh Redis scope. It never
 * inherits a caller's read allowance or activates a financial cheap class. */
export function continuousTextNativeBudgetLimits(legacy=false,operationId?:string){return compactTransportV2()&&!legacy?{delivery:operationId===FINITE_PILOT_ID&&finitePilotProfile()?{...CONTINUOUS_CONTROL_BUDGET.compactNativeTextV2,commands:128,wireBytes:1.875*MiB}:CONTINUOUS_CONTROL_BUDGET.compactNativeTextV2,readiness:finitePilotProfile()?{...CONTINUOUS_CONTROL_BUDGET.compactNativeReadinessV2,commands:32}:CONTINUOUS_CONTROL_BUDGET.compactNativeReadinessV2}:{delivery:CONTINUOUS_CONTROL_BUDGET.compactNativeText,readiness:CONTINUOUS_CONTROL_BUDGET.compactNativeReadiness};}
export async function withContinuousTextNativeBudget<T>(handler:()=>Promise<T>,options:{legacy?:boolean;operationId?:string}={}):Promise<T>{
 if(!active())return handler();
 const compactRegistry=isCompactWorkspaceTransport();
 return scope.run(fresh(undefined,true,compactRegistry?continuousTextNativeBudgetLimits(options.legacy,options.operationId).delivery:CONTINUOUS_CONTROL_BUDGET.nativeText,true,compactRegistry),async()=>{
  try{return await boundedResult(handler);}catch(error){scope.getStore()!.failed=true;throw error;}
 });
}
/** Readiness is an explicit native runtime boundary, not an HTTP argument.
 * The smaller fresh scope exists only with the native bounded registry profile. */
export async function withContinuousTextReadinessBudget<T>(handler:()=>Promise<T>,options:{legacy?:boolean}={}):Promise<T>{
 if(!active())return handler();
 if(!isCompactWorkspaceTransport())return handler();
 return scope.run(fresh(undefined,true,continuousTextNativeBudgetLimits(options.legacy).readiness,true,true,true),async()=>{
  try{return await boundedResult(handler);}catch(error){scope.getStore()!.failed=true;throw error;}
 });
}
export function continuousControlBudgetReservation(kind:OperationalRequestClass&{operationId?:string;principalHash?:string;operationLookup?:boolean;bootstrapCreation?:boolean;perOrderProfile?:'batch-v1'}){
 const context=scope.getStore();
 if(!active()||!context||context.failed||context.nativeText||!context.kind||!!kind.bootstrapCreation!==!!context.kind.bootstrapCreation||kind.profile!==context.kind.profile||kind.workload!==context.kind.workload||kind.newOperation!==context.kind.newOperation)return undefined;
 if(context.financialOperationId&&(kind.operationLookup!==true||kind.operationId!==context.financialOperationId))return undefined;
 if(kind.operationId!==undefined||kind.principalHash!==undefined||kind.operationLookup){if(kind.operationLookup!==true||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(kind.operationId??'')||!/^[a-f0-9]{64}$/.test(kind.principalHash??''))return undefined;}
 if(kind.perOrderProfile==='batch-v1'&&kind.operationLookup===true&&kind.operationId&&kind.operationId!=='31c97193-be74-4b9d-b0a3-f3890b0a41e8'&&continuousPerOrderStorage()){
  let selected:Limit|undefined;if(kind.workload==='orders')selected=CONTINUOUS_CONTROL_BUDGET.perOrderBatchRead;
  else if(kind.workload==='seller-control')selected=CONTINUOUS_CONTROL_BUDGET.perOrderBatchSeller;
  else if(kind.workload==='financial')selected=context.limit===CONTINUOUS_CONTROL_BUDGET.compactV2FinancialUnsigned?CONTINUOUS_CONTROL_BUDGET.perOrderBatchUnsigned:context.limit===CONTINUOUS_CONTROL_BUDGET.perOrderV1FinancialSigned?(pilotReviewProfile()?CONTINUOUS_CONTROL_BUDGET.pilotSigned:CONTINUOUS_CONTROL_BUDGET.perOrderBatchSigned):context.limit===CONTINUOUS_CONTROL_BUDGET.compactV2FinancialReconcile?CONTINUOUS_CONTROL_BUDGET.perOrderBatchReconcile:undefined;
  if(selected){if(context.observation.outboundBytes+context.observation.inboundBytes>selected.wireBytes||context.observation.commands>selected.commands)throw failure();context.limit=selected;context.perOrderOperationId=kind.operationId;context.perOrderProfile='batch-v1';}
 }
 return {commands:context.limit.commands,transferBytes:context.limit.wireBytes+context.httpAllowanceBytes};
}
/** A native request-auth proof selects the smaller endpoint-specific scope
 * before its budget debit. Existing usage remains fully counted. */
export async function adoptProjectedIdentityControlBudget(request:Request){const c=scope.getStore();if(!c)return false;if(c.boundRequest!==request||c.failed||c.identityProjection||c.kind?.profile!=='recovery'||c.kind.workload!=='identity'||!c.compactRegistry||!compactTransportV2()||!pilotReviewProfile())throw failure();const {takeProjectedIdentityBudgetProof}=await import('./workspace-http.ts');const proof=takeProjectedIdentityBudgetProof(request);if(!['human','agent'].includes(proof.principal.role))throw failure();const selected=CONTINUOUS_CONTROL_BUDGET.publicIdentityProjection;if(c.observation.commands>selected.commands||c.observation.requests>9||c.observation.outboundBytes+c.observation.inboundBytes>selected.wireBytes)throw failure();c.limit=selected;c.identityProjection=true;return true;}
export function continuousControlBudgetObservation(){const context=scope.getStore();return context?{...context.observation,authenticated:context.authenticated,nativeText:context.nativeText,nativeReadiness:context.nativeReadiness,compactRegistry:context.compactRegistry,commandLimit:context.limit.commands,wireLimit:context.limit.wireBytes,responseLimit:context.responseBytes,httpAllowanceBytes:context.httpAllowanceBytes}:undefined;}
type Middleware=Parameters<Redis['use']>[0];
/** Reserve exact native maximum wire allocations before dispatch, including
 * parallel requests. No decoded response refunds or uncertain-ACK retries. */
export async function continuousControlRedisRequest(request:Parameters<Middleware>[0],next:Parameters<Middleware>[1]){
 const context=scope.getStore();if(!context)return next(request);
 if(context.failed)throw failure();
 try{
  const native=await nativeRedisDescriptor(request.body),splitRead=['split-context','split-terms','split-history'].includes(context.kind?.workload??''),descriptor=splitRead?{...native,responseBytes:native.responseBytes*(native.keys[0]?.startsWith('bazaar:split:v1:')?1:3)}:native,outbound=Buffer.byteLength(JSON.stringify(request.body));
  const observation=context.observation;
  const readPhase=context.kind?.workload?.slice(6) as keyof typeof SPLIT_READ_PIPELINE_LIMITS|undefined,readLimit=splitRead&&readPhase?SPLIT_READ_PIPELINE_LIMITS[readPhase]:undefined;
  if(readLimit&&observation.requests>=readLimit.requests||context.identityProjection&&observation.requests>=9)throw failure();
  if(context.compactRegistry&&descriptor.registryMaximumBytes!==undefined&&descriptor.registryMaximumBytes!==workspaceRegistryTransportMaximum())throw failure();
  if(context.failed||observation.commands+descriptor.commands>context.limit.commands||observation.outboundBytes+observation.inboundBytes+outbound+descriptor.responseBytes>context.limit.wireBytes)throw failure();
  observation.commands+=descriptor.commands;observation.outboundBytes+=outbound;observation.inboundBytes+=descriptor.responseBytes;observation.requests++;
  const response=await next(request),bytes=Buffer.byteLength(JSON.stringify(response)??'');
  if(bytes>descriptor.responseBytes||response&&typeof response==='object'&&'error' in response&&response.error)throw failure();
  return response;
 }catch{context.failed=true;throw failure();}
}
const wrapped=new WeakSet<object>();
export function continuousControlBudgetRedis(redis:Redis):Redis{if(!wrapped.has(redis)){wrapped.add(redis);redis.use(continuousControlRedisRequest);}return redis;}

/** Internal native proof only. HTTP/MCP arguments cannot set this context. */
export function continuousPerOrderResourceProfile(id:string){const c=scope.getStore();return c?.perOrderOperationId===id?c.perOrderProfile:undefined;}
export function adoptContinuousPerOrderNativeProfile(id:string,profile:unknown){const c=scope.getStore();if(!c?.nativeText||profile!=='batch-v1'||id==='31c97193-be74-4b9d-b0a3-f3890b0a41e8'||!/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(id))return;const limit=id===FINITE_PILOT_ID&&finitePilotProfile()?{...CONTINUOUS_CONTROL_BUDGET.perOrderBatchNativeText,commands:128,wireBytes:1.875*MiB}:CONTINUOUS_CONTROL_BUDGET.perOrderBatchNativeText;if(c.observation.outboundBytes+c.observation.inboundBytes>limit.wireBytes||c.observation.commands>limit.commands)throw failure();c.limit=limit;c.perOrderOperationId=id;c.perOrderProfile='batch-v1';}

/** Native private reads admit no external service traffic, even with the optional meter disabled. */
export function assertContinuousExternalAllowed(){if(scope.getStore()?.kind?.workload?.startsWith('split-'))throw new WorkspaceError('SPLIT_READ_EXTERNAL_FORBIDDEN',503);}
