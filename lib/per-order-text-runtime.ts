import {finitePilotProfile,FINITE_PILOT_ID} from './finite-pilot-budget.ts';
import {randomUUID} from 'node:crypto';
import {WorkspaceError} from './workspace-types.ts';
import type {MarketOrder} from './marketplace-store.ts';
import type {MarketOrderRepository} from './market-order-repository.ts';
import {assertMarketOrderFinancialStorage,perOrderOperationId} from './market-order-storage.ts';
import {marketContentExpiresAt} from './market-file-delivery-schema.ts';
import {sha} from './marketplace-identity.ts';
import {withContinuousTextNativeBudget,adoptContinuousPerOrderNativeProfile,outsideContinuousControlBudgetForSimulation} from './continuous-control-budget.ts';
import {isPerOrderPaymentSimulation,isPerOrderPaymentEnabled,perOrderPaymentCapabilityKind,withPerOrderX402Production} from './per-order-payment-profile.ts';

type Binding={serviceId:string;cardHash:string;ownerFingerprint:string};
export type PerOrderTextDispatch={operationId:string;wakeId:string;dispatchAttemptId:string;executionAttemptId:string;mode?:'deliver'|'recover-known-result'};
type Dependencies={
 repository:()=>MarketOrderRepository;
 binding:(order:MarketOrder)=>Binding;
 now:()=>number;
 reserve:(input:{operationId:string;principalHash:string;perOrderProfile?:'batch-v1'})=>Promise<unknown>;
 invoke:(dispatch:PerOrderTextDispatch,order:MarketOrder)=>Promise<{operationId:string;wakeId:string;executionAttemptId:string;paymentSubmissions:0;executed:0|1}>;
};
function boundOrder(order:MarketOrder,binding:Binding){if(order.executionMode!=='on-demand'||order.serviceId!==binding.serviceId||order.cardHash!==binding.cardHash||sha(order.sellerOwnerId)!==binding.ownerFingerprint)throw new WorkspaceError('TEXT_SELLER_BINDING_MISMATCH',503);}
/** Every dispatch requires a live operation capability. Production dependencies
 * are created below from reviewed server configuration, never request input. */
function createRuntime(deps:Dependencies){
 return {async dispatch(operationId:string){
  const assertEnabled=()=>{if(!isPerOrderPaymentEnabled(operationId))throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);};assertEnabled();
  return withContinuousTextNativeBudget(async()=>{
  assertMarketOrderFinancialStorage(operationId);
  if(!perOrderOperationId(operationId))throw new WorkspaceError('LEGACY_ORDER_REQUIRED',409);
  const repository=deps.repository(),envelope=await repository.read(operationId),snapshot=envelope?.order;
  adoptContinuousPerOrderNativeProfile(operationId,envelope?.budgetProfile);
  const profile=envelope?.budgetProfile==='batch-v1'?{perOrderProfile:'batch-v1' as const}:{};
  if(!snapshot)throw new WorkspaceError('NOT_FOUND',404);const binding=deps.binding(snapshot);boundOrder(snapshot,binding);
  const production=perOrderPaymentCapabilityKind(operationId)==='production',recoverKnown=production&&['executing','execution-uncertain'].includes(snapshot.phase);
  if(!snapshot.textWake||['delivered','delivery-failed'].includes(snapshot.phase)||snapshot.phase==='execution-uncertain'&&!recoverKnown||Date.parse(marketContentExpiresAt(snapshot))<=deps.now())return {dispatched:false,reason:'terminal-or-expired'};
  if(!['paid','executing',...(recoverKnown?['execution-uncertain']:[])].includes(snapshot.phase)||!snapshot.paymentVerifiedAt||!snapshot.transactionHash)throw new WorkspaceError('PAYMENT_REQUIRED',409);
  const wake=snapshot.textWake,now=deps.now();
  if(wake.status==='completed'||wake.status==='needs-operator'&&!recoverKnown||wake.retryAt&&Date.parse(wake.retryAt)>now||wake.status==='dispatching'&&Date.parse(wake.leaseExpiresAt??'')>now)return {dispatched:false,reason:'leased-or-delayed'};
  if(snapshot.phase==='executing'&&!production){
   // An expired dispatch lease does not erase a durable execution claim. The
   // provider may have completed its effect and lost an acknowledgement.
   assertEnabled();await deps.reserve({operationId,principalHash:sha(snapshot.buyerOwnerId),...profile});assertEnabled();
   const current=await repository.transact(operationId,envelope=>{
    assertEnabled();
    const order=envelope.order;if(!order||order.phase!=='executing'||order.attemptId!==snapshot.attemptId||order.textWake?.wakeId!==wake.wakeId)return order;
    boundOrder(order,binding);order.phase='execution-uncertain';order.executionUncertainty='An execution claim already exists. Recover its saved result without invoking the provider again.';order.updatedAt=new Date(deps.now()).toISOString();order.textWake.status='needs-operator';order.textWake.updatedAt=order.updatedAt;delete order.textWake.leaseExpiresAt;delete order.textWake.retryAt;return order;
   });
   return {dispatched:false,reason:'existing-execution-claim',needsOperator:current?.phase==='execution-uncertain',delivered:current?.phase==='delivered'};
  }
  if(wake.attempts>=1000)throw new WorkspaceError('TEXT_SELLER_WAKE_LIMIT',503);
  assertEnabled();await deps.reserve({operationId,principalHash:sha(snapshot.buyerOwnerId),...profile});assertEnabled();
  const dispatchAttemptId=randomUUID();
  // Compare the saved wake before publishing a lease. A lost acknowledgement
  // exits before invoking the provider; no CAS callback performs an effect.
  const claimed=await repository.transact(operationId,envelope=>{
   assertEnabled();
   const order=envelope.order;
   if(!order||order.textWake?.wakeId!==wake.wakeId||order.textWake.updatedAt!==wake.updatedAt||order.textWake.status!==wake.status||order.textWake.dispatchAttemptId!==wake.dispatchAttemptId||(recoverKnown?!['executing','execution-uncertain'].includes(order.phase)||order.attemptId!==wake.wakeId:order.phase!=='paid'||order.attemptId!==undefined))throw new WorkspaceError('WAKE_CONFLICT',409);
   boundOrder(order,binding);const at=new Date(now).toISOString();Object.assign(order.textWake,{status:'dispatching',dispatchAttemptId,leaseExpiresAt:new Date(now+60000).toISOString(),updatedAt:at,attempts:order.textWake.attempts+1});delete order.textWake.retryAt;return order;
  });
  const event:PerOrderTextDispatch={operationId,wakeId:claimed.textWake!.wakeId,dispatchAttemptId,executionAttemptId:claimed.textWake!.wakeId,...(recoverKnown?{mode:'recover-known-result' as const}:{})};
  let acknowledged=false;
  try{if(!isPerOrderPaymentEnabled(operationId))throw new WorkspaceError('PER_ORDER_PAYMENTS_NOT_ENABLED',503);const result=await (isPerOrderPaymentSimulation(operationId)?outsideContinuousControlBudgetForSimulation(operationId,()=>deps.invoke(event,claimed)):deps.invoke(event,claimed));if(result.operationId!==event.operationId||result.wakeId!==event.wakeId||result.executionAttemptId!==event.executionAttemptId||result.paymentSubmissions!==0||![0,1].includes(result.executed))throw new WorkspaceError('TEXT_SELLER_RESPONSE_INVALID',503);acknowledged=true;}catch{}
  assertEnabled();const current=await repository.transact(operationId,envelope=>{
   assertEnabled();
   const order=envelope.order;if(!order||order.textWake?.dispatchAttemptId!==dispatchAttemptId)return order;
   if(['delivered','delivery-failed'].includes(order.phase))order.textWake.status='completed';
   else if(order.phase==='execution-uncertain')order.textWake.status='needs-operator';
   else if(order.phase==='executing'){
    // A provider already owns the one execution claim. Missing acknowledgement
    // cannot authorize another execution; recover that saved attempt instead.
    order.phase='execution-uncertain';order.executionUncertainty='Execution is claimed without a confirmed delivery. Recover the saved execution attempt without executing again.';order.textWake.status='needs-operator';
   }else{order.textWake.status='unconfirmed';order.textWake.retryAt=new Date(deps.now()+60000).toISOString();}
   order.updatedAt=new Date(deps.now()).toISOString();order.textWake.updatedAt=order.updatedAt;delete order.textWake.leaseExpiresAt;return order;
  });
  return {dispatched:true,acknowledged,delivered:current?.phase==='delivered',needsOperator:current?.phase==='execution-uncertain'};
 },{operationId});}};
}
export function createPerOrderTextSellerRuntime(deps:Dependencies){if(process.env.NODE_ENV!=='test'||process.env.VERCEL!==undefined)throw new WorkspaceError('PER_ORDER_TEXT_RUNTIME_NOT_ENABLED',503);return createRuntime(deps);}
async function createProductionRuntime(){
 const [{configuredMarketOrderRepository},{textSellerConfiguration,compactTextBackgroundReservation},{reserveContinuousFreeBackground},{readPerOrderProductionProviderConfiguration,createPerOrderProductionProvider}]=await Promise.all([import('./market-order-storage.ts'),import('./market-text-seller-runtime.ts'),import('./continuous-free-budget.ts'),import('./per-order-production-provider.ts')]);
 const identity=(order:MarketOrder)=>({serviceId:order.serviceId,cardHash:order.cardHash,sellerOwnerId:order.sellerOwnerId});
 return createRuntime({repository:configuredMarketOrderRepository,binding:order=>{const binding=textSellerConfiguration(process.env,identity(order));if(!binding)throw new WorkspaceError('PER_ORDER_TEXT_RUNTIME_NOT_ENABLED',503);return binding;},now:Date.now,reserve:input=>reserveContinuousFreeBackground({...compactTextBackgroundReservation(false,false,input.operationId),...(input.perOrderProfile==='batch-v1'&&!(input.operationId===FINITE_PILOT_ID&&finitePilotProfile())?{transferBytes:5*1048576}:{}),reason:'wake',...input}),invoke:(dispatch,order)=>{const configuration=readPerOrderProductionProviderConfiguration(process.env,identity(order));if(!configuration)throw new WorkspaceError('PER_ORDER_TEXT_RUNTIME_NOT_ENABLED',503);return createPerOrderProductionProvider(configuration).invoke(dispatch);}});
}
let injected:ReturnType<typeof createPerOrderTextSellerRuntime>|undefined;
export function setPerOrderTextSellerRuntimeForTests(runtime:ReturnType<typeof createPerOrderTextSellerRuntime>|undefined){if(process.env.NODE_ENV!=='test'||process.env.VERCEL!==undefined)throw new WorkspaceError('PER_ORDER_TEXT_RUNTIME_NOT_ENABLED',503);injected=runtime;}
export async function dispatchPerOrderMarketTextWake(operationId:string){
 if(isPerOrderPaymentSimulation(operationId)){assertMarketOrderFinancialStorage(operationId);if(!injected)throw new WorkspaceError('PER_ORDER_TEXT_RUNTIME_NOT_ENABLED',503);return injected.dispatch(operationId);}
 return withPerOrderX402Production(operationId,async()=>{const {withPerOrderProductionBackgroundMeter}=await import('./acceptance-meter.ts');return withPerOrderProductionBackgroundMeter(operationId,async()=>{assertMarketOrderFinancialStorage(operationId);return (await createProductionRuntime()).dispatch(operationId);});});
}
