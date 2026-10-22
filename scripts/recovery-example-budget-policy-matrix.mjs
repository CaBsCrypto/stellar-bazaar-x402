// Pure planning arithmetic. Inputs must come from a reviewed, enforced native
// transport matrix. This file does not choose or apply a production limit.
import {continuousFreeReservation,CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND} from '../lib/continuous-free-budget.ts';
import {assertExactExampleProviderIoLimits} from '../lib/example-provider-readiness-proof.ts';
export const EXAMPLE_BUDGET_POLICY=Object.freeze({coldReadiness:1,forcedReadiness:2,deliveryDispatches:3,heldOrderCallsPerTargetedDispatch:7,sdkMetadataCallsPerInvocation:3,identityCallsPerInvocation:1,capacityCallsPerInvocation:2,minimumBuyerFinancialCalls:3,minimumBuyerOrderReads:2,archivedFinancialCalls:1,archivedRecoveryGets:1});
const families=['metadata','identity','capacity','orders','financial'];
const own=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
const safe=value=>Number.isSafeInteger(value)&&value>=0;
const fail=()=>{throw Error('REVIEWED_FINITE_EXAMPLE_MATRIX_INPUT_REQUIRED');};
function cost(value){if(!own(value,['commands','transferBytes'])||!safe(value.commands)||value.commands<4||!safe(value.transferBytes)||value.transferBytes<4096)fail();return {...value};}
const profiles=['public','authenticated','recovery','background'];
function row(family,count,unit,reason,profile){if(!safe(count)||!profiles.includes(profile))fail();const commands=count*unit.commands,transferBytes=count*unit.transferBytes;if(!safe(commands)||!safe(transferBytes))fail();return {family,profile,count,unit:{...unit},commands,transferBytes,reason};}
function sum(rows){const result={commands:0,transferBytes:0,commandsByProfile:Object.fromEntries(profiles.map(name=>[name,0]))};for(const item of rows){result.commands+=item.commands;result.transferBytes+=item.transferBytes;result.commandsByProfile[item.profile]+=item.commands;}if(!safe(result.commands)||!safe(result.transferBytes))fail();return result;}
/** Held and globally charged work are deliberately separate. Control requests
 * never borrow an operation ID merely to make this forecast look smaller. */
export function deriveRecoveryExampleBudgetPolicyMatrix(input){
 if(!own(input,['providerIoLimits','nativeCosts','nativeBackground','buyerScenario','remaining'])||!own(input.nativeCosts,families)||!own(input.buyerScenario,['financialCalls','orderReads','globalRequests'])||!Array.isArray(input.buyerScenario.globalRequests)||input.buyerScenario.globalRequests.length>20)fail();
 assertExactExampleProviderIoLimits(input.providerIoLimits);
 const costs=Object.fromEntries(families.map(name=>[name,cost(input.nativeCosts[name])])),background=cost(input.nativeBackground),scenario=input.buyerScenario,p=EXAMPLE_BUDGET_POLICY;
 if(!safe(scenario.financialCalls)||scenario.financialCalls<p.minimumBuyerFinancialCalls||scenario.financialCalls>20||!safe(scenario.orderReads)||scenario.orderReads<p.minimumBuyerOrderReads||scenario.orderReads>20)fail();
 const provider=CONTINUOUS_EXAMPLE_TEXT_PROVIDER_IO_BOUND;
 if(provider.commands!==input.providerIoLimits.combinedConservativeRedisCommands||provider.transferBytes!==input.providerIoLimits.conservativeTransferBytes)fail();
 const completeTick={commands:provider.commands+background.commands+4,transferBytes:provider.transferBytes+background.transferBytes+4096};
 const archiveFinancial=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'financial'}),archiveGet=continuousFreeReservation({profile:'recovery',newOperation:false,workload:'orders'});
 const heldRows=[
  row('background',p.forcedReadiness+p.deliveryDispatches,completeTick,'Two forced readiness checks and three delivery dispatches; native tick + provider + ledger.','background'),
  row('seller-orders',p.deliveryDispatches*p.heldOrderCallsPerTargetedDispatch,costs.orders,'Targeted worker source has at most seven order tools per invocation, including claim recovery.','recovery'),
  row('buyer-financial',scenario.financialCalls,costs.financial,'Includes challenge, one submission and recovery after a lost confirmation; no second payment.','recovery'),
  row('buyer-order-recovery',scenario.orderReads,costs.orders,'Explicit finite accepted recovery allowance before delivery releases the unused hold.','recovery'),
  row('archived-financial',p.archivedFinancialCalls,archiveFinancial,'Content-free archived operations deliberately retain generic financial costs.','recovery'),
  row('archived-get',p.archivedRecoveryGets,archiveGet,'One technical archived lookup at the generic recovery cost.','recovery'),
 ];
 const invocations=p.coldReadiness+p.forcedReadiness+p.deliveryDispatches;
 const globalRows=[
  row('cold-readiness',p.coldReadiness,completeTick,'Before atomic order admission there is no held credit.','background'),
  row('seller-sdk-metadata',invocations*p.sdkMetadataCallsPerInvocation,costs.metadata,'Locked stateless SDK handshake, including its independent HTTP subscription request.','public'),
  row('seller-identity',invocations*p.identityCallsPerInvocation,costs.identity,'Assumes cold identity every time; a cache hit cannot worsen this bound.','recovery'),
  row('seller-capacity',invocations*p.capacityCallsPerInvocation,costs.capacity,'Ready report plus a possible false close report; no held order identity.','authenticated'),
  ...scenario.globalRequests.map(item=>{if(!own(item,['family','profile','count','unit','reason'])||typeof item.family!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(item.family)||typeof item.reason!=='string'||!item.reason||item.reason.length>300)fail();return row(item.family,item.count,cost(item.unit),item.reason,item.profile);}),
 ];
 const held=sum(heldRows),global=sum(globalRows),completeForecast=sum([...heldRows,...globalRows]);
 let suppliedRemainingProjection=null;
 if(input.remaining!==null){if(!own(input.remaining,['transferBytes','commandsByProfile','observedAt','source'])||!safe(input.remaining.transferBytes)||!own(input.remaining.commandsByProfile,profiles)||!profiles.every(name=>safe(input.remaining.commandsByProfile[name]))||!Number.isFinite(Date.parse(input.remaining.observedAt))||typeof input.remaining.source!=='string'||!input.remaining.source||input.remaining.source.length>300)fail();suppliedRemainingProjection={source:input.remaining.source,observedAt:input.remaining.observedAt,byteMargin:input.remaining.transferBytes-completeForecast.transferBytes,commandMarginsByProfile:Object.fromEntries(profiles.map(name=>[name,input.remaining.commandsByProfile[name]-completeForecast.commandsByProfile[name]])),freshReadVerifiedByThisModule:false};}
 return {version:1,status:'OFFLINE_DERIVED_FINITE_POLICY_FORECAST_ONLY',policy:p,providerOnlyBound:{...provider},nativeBackgroundBound:background,completeTickBound:completeTick,heldRows,globalRows,held,global,completeForecast,suppliedRemainingProjection,appliesNumericalLimits:false,networkRequests:0,ledgerWrites:0,payments:0,limitations:['Costs supplied by the caller must first be proved against the full real isolated Redis trace and saturated snapshot replay and enforced at the transport layer.','Provider/control work is global. This forecast does not invent an operation credit for metadata, identity or capacity.','Three SDK metadata exchanges per invocation assumes the locked stateless client and opt-in FIFO wrapper; a protocol/source change requires renewed evidence.','This reserves finite recovery, including one archived reconciliation and lookup. It does not promise unlimited retries or polling.','A supplied quota observation is arithmetic input, never a fresh authenticated ledger reading or authorization to publish.']};
}
