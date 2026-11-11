import {finitePilotReservation} from './finite-pilot-budget.ts';
import {workspaceMaintenanceProfile,PILOT_WORKSPACE_ADMISSION_FORECAST_BYTES} from './pilot-maintenance-profile.ts';
import {pilotReviewProfile} from './pilot-review-transport.ts';
import {WorkspaceError} from './workspace-types.ts';
import {continuousFreeBudgetConfiguration,continuousFreeBudgetKey,continuousFreeOperationRequest,continuousFreeOperationCommitScript,type ContinuousFreeOperation} from './continuous-free-budget.ts';
import {prepareContinuousStorageCommit,type ContinuousStorageWrite} from './continuous-free-storage.ts';
import {MARKET_ORDER_REPOSITORY_CAS} from './market-order-repository-lua.ts';
import {sha} from './marketplace-identity.ts';
import type {MarketOrder} from './marketplace-store.ts';

type StorageCommit=NonNullable<Awaited<ReturnType<typeof prepareContinuousStorageCommit>>>;
/** The first seventeen slots are the existing repository's native snapshots.
 * The allocation, storage and command ledgers have fixed, auditable positions. */
export const PER_ORDER_CONTINUOUS_SLOTS=Object.freeze({allocation:18,storage:19,budget:20,admission:21,guardStart:22,argumentCount:21,maximumGuards:8});
export const PER_ORDER_COMPACT_GLOBAL_ALLOWANCE_BYTES=59023360;
/** New bounded envelopes only. Existing holds/floors are never rewritten. */
export const PER_ORDER_BATCH_OPERATION_RESERVATION=Object.freeze({recoveryCommands:12000,backgroundCommands:4000,transferBytes:62005248,globalAllowanceBytes:46964736});
export function perOrderContinuousCommitScript(storage:Pick<StorageCommit,'appendScript'|'writeScript'>,guardCount:number,hasOperation:boolean){
 if(!Number.isSafeInteger(guardCount)||guardCount<0||guardCount>8)throw new WorkspaceError('INVALID_COMMIT_GUARD');
 let script=MARKET_ORDER_REPOSITORY_CAS
  .replace('-- bazaar-per-order-cas-v2-local',`-- bazaar-per-order-cas-v2-continuous guards=${guardCount} operation=${hasOperation?'1':'0'}`)
  .replace("local id=ARGV[6]",`if #KEYS~=${21+guardCount} or #ARGV~=21 then return -8 end\nlocal id=ARGV[6]`)
  .replace("KEYS[17+n]","KEYS[21+n]");
 const allocationGuard=`local allocationOld=redis.call('GET',KEYS[18])
if ARGV[1]=='missing' then
 if allocationOld then return -23 end
else
 if not allocationOld or allocationOld~=ARGV[14] then return -23 end
end
if #ARGV[15]>512 then return -22 end
local admissionOld=redis.call('GET',KEYS[21])
if ARGV[1]=='missing' then
 if admissionOld then return -23 end
else
 if not admissionOld or admissionOld~=ARGV[21] then return -23 end
end
if #ARGV[20]>4096 then return -24 end
`;
 const operationGuard=hasOperation?`local budgetBefore=redis.call('GET',KEYS[20])
if ARGV[1]=='missing' and budgetBefore then
 if #budgetBefore>262144 then return -10 end
 local valid,before=pcall(cjson.decode,budgetBefore)
 if not valid or type(before)~='table' or type(before.held)~='table' then return -10 end
 for _,held in ipairs(before.held) do if held.operationId==id then return -12 end end
end
${continuousFreeOperationCommitScript(20,18,19)}`:'';
 // Native revisions, legacy collision checks, fingerprint and deadline all run
 // first. Both native guards only calculate their proposed ledgers in memory.
 script=script.replace('-- Every precondition precedes the first write.',allocationGuard+storage.appendScript(19,16)+operationGuard+'\n-- Every precondition precedes the first write.');
 const end=script.lastIndexOf('\nreturn 1');
 if(end<0)throw new WorkspaceError('PER_ORDER_STATE_UNAVAILABLE');
 return script.slice(0,end)+`\nredis.call('SET',KEYS[18],ARGV[15])\nredis.call('SET',KEYS[21],ARGV[20])\n${storage.writeScript(19)}${hasOperation?"redis.call('SET',KEYS[20],budgetNext)\n":''}`+script.slice(end);
}

/** One durable allocation entry accounts for the complete order container:
 * document, private-history projection, six sorted-set members, their keys,
 * revision strings and the permanent authorization claim. Allocation never
 * shrinks when the current representation is archived or compacted. */
export async function preparePerOrderContinuousCommit(
 redis:{eval(script:string,keys:string[],args:string[]):Promise<unknown>},workspacePrefix:string,
 allocation:ContinuousStorageWrite,guardCount:number,operation:ContinuousFreeOperation|undefined,immutableOrder:MarketOrder|undefined,budgetProfile?:'batch-v1',
){
 const configuration=continuousFreeBudgetConfiguration();
 if(!configuration)throw new WorkspaceError('FREE_DEMO_BUDGET_UNAVAILABLE');
 if(operation&&(operation.operationId==='31c97193-be74-4b9d-b0a3-f3890b0a41e8'||!immutableOrder||operation.operationId!==immutableOrder.operationId||operation.principalHash!==sha(immutableOrder.buyerOwnerId)))throw new WorkspaceError('INVALID_COMMIT_GUARD');
 const storage=await prepareContinuousStorageCommit(redis,workspacePrefix,[allocation]);
 if(!storage)throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
 const nativeRequest=operation?continuousFreeOperationRequest(operation,immutableOrder):undefined;
 // Full per-order history can read twenty maximum-sized projections. Retain
 // the original75-MiB completion hold, adding10MiB only to *new* protected
 // control headroom. No existing hold or native generic reservation changes.
 const newBatch=nativeRequest&&nativeRequest.action==='reserve'&&budgetProfile==='batch-v1'&&'globalAllowanceBytes' in nativeRequest&&nativeRequest.globalAllowanceBytes===48537600;
 const finite=newBatch?finitePilotReservation(immutableOrder):undefined;
 const request=newBatch?{...nativeRequest,...PER_ORDER_BATCH_OPERATION_RESERVATION,...(pilotReviewProfile()?{transferBytes:58597376}:{}),...(workspaceMaintenanceProfile()?{globalAllowanceBytes:PILOT_WORKSPACE_ADMISSION_FORECAST_BYTES,optimizedAdmissionForecast:true}:{}),...(finite??{}),publicTransferFloorBytes:PER_ORDER_BATCH_OPERATION_RESERVATION.globalAllowanceBytes}:nativeRequest&&nativeRequest.action==='reserve'&&'globalAllowanceBytes' in nativeRequest&&nativeRequest.globalAllowanceBytes===48537600?{...nativeRequest,globalAllowanceBytes:PER_ORDER_COMPACT_GLOBAL_ALLOWANCE_BYTES,publicTransferFloorBytes:PER_ORDER_COMPACT_GLOBAL_ALLOWANCE_BYTES}:nativeRequest;
 return {
  keys:[allocation.key,...storage.keys,continuousFreeBudgetKey(workspacePrefix)],
  args:[allocation.expectedRaw??'',allocation.nextRaw??'',...storage.args,operation?JSON.stringify(configuration):'',request?JSON.stringify(request):''],
  script:perOrderContinuousCommitScript(storage,guardCount,Boolean(operation)),
 };
}

/** Pure recognition material for the Redis wire meter. The native storage
 * helper computes source text only; this never reads Redis or changes a ledger. */
export async function perOrderContinuousScriptDescriptor(workspacePrefix:string,guardCount:number,hasOperation:boolean){
 const storage=await prepareContinuousStorageCommit({eval:async()=>{throw new Error('DESCRIPTOR_IO_FORBIDDEN');}},workspacePrefix,[]);
 if(!storage)throw new WorkspaceError('FREE_DEMO_STORAGE_UNAVAILABLE');
 return {script:perOrderContinuousCommitScript(storage,guardCount,hasOperation),keyCount:21+guardCount,argCount:21,guardCount,hasOperation};
}
