// Read-only source arithmetic. No default fetch, credential, Lua execution,
// production quota mutation or maintenance invocation.
import {createHash} from 'node:crypto';
import {continuousFreeBudgetConfiguration,continuousFreeBudgetKey} from '../lib/continuous-free-budget.ts';
import {READ_WORKSPACE_MAINTENANCE_LUA} from '../lib/workspace-store.ts';
import {READ_GUARDIAN_INDEX_POLICY_LUA,GUARDIAN_POLICY_MAX_BYTES,guardianExistingIdleBudgetLua} from '../lib/guardian-finite-budget.ts';
const sha=value=>createHash('sha256').update(value).digest('hex');
const commands=Object.freeze({public:115000,authenticated:90000,recovery:105000,background:50000});
const prefix='bazaar-market:pilot-'+'a'.repeat(32),workspace=prefix.replace('bazaar-market','bazaar-workspace'),overhead=4096,envelope=512;
export function deriveGuardianIdleTypedBound(){
 if(GUARDIAN_POLICY_MAX_BYTES!==512)throw Error('GUARDIAN_POLICY_RAW_CAP_REVIEW_REQUIRED');
 const base=continuousFreeBudgetConfiguration({BAZAAR_FREE_DEMO_MODE:'continuous',BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON:JSON.stringify(commands)});
 // Numeric model only: this does not configure the application or its ledger.
 const configuration={...base,transferBytes:9900000000};
 const rows=[
  {name:'idle-credit-debit',body:['EVAL',guardianExistingIdleBudgetLua(),1,continuousFreeBudgetKey(workspace),JSON.stringify(configuration),JSON.stringify({action:'debit',profile:'background',commands:16,transferBytes:36864})],responseAllocation:envelope+overhead,maximumCommands:4,reason:'Existing-ledger-only private debit. The Lua script itself is included in outbound bytes; missing ledger never creates a zero ledger.'},
  {name:'market-index-and-guardian-policy',body:['EVAL',READ_GUARDIAN_INDEX_POLICY_LUA,2,prefix+':maintenance-index:v1',prefix+':guardian-policy:v1'],responseAllocation:2*(512+512)+envelope+overhead,maximumCommands:3,reason:'Two independently validated512-byte raw JSON strings; outer escaping/base64 and envelope included.'},
  {name:'workspace-maintenance-index',body:['EVAL',READ_WORKSPACE_MAINTENANCE_LUA,1,workspace+`:{${workspace.split(':')[1]}}:maintenance`],responseAllocation:2*512+envelope+overhead,maximumCommands:3,reason:'One validated512-byte index plus the Redis clock fields within the512-byte envelope; exact native hash-tagged key.'},
 ];
 let bytes=0,redisCommands=0;
 const proof=rows.map(row=>{
  const outboundUpperBytes=Buffer.byteLength(JSON.stringify(row.body),'utf8')+overhead,inboundUpperBytes=row.responseAllocation,beforeSendUpperBytes=bytes+outboundUpperBytes+inboundUpperBytes;
  const syntacticCommands=1+(row.body[1].match(/redis\.call\s*\(/g)?.length??0);if(syntacticCommands!==row.maximumCommands)throw Error('GUARDIAN_IDLE_SCRIPT_COMMAND_COUNT_CHANGED');
  bytes=beforeSendUpperBytes;redisCommands+=row.maximumCommands;
  return {name:row.name,scriptSha256:sha(row.body[1]),keyCount:row.body[2],argumentCount:row.body.length-3-row.body[2],maximumCommands:row.maximumCommands,outboundUpperBytes,inboundUpperBytes,beforeSendUpperBytes,marginToCreditBytes:36864-beforeSendUpperBytes,reason:row.reason};
 });
 return {version:2,status:'LOCAL_TYPED_GUARDIAN_IDLE_BOUND_NOT_RUNTIME_ACCEPTANCE',proposedProfile:'example-text-wire/v3',fixedCommandConfigurationId:configuration.configurationId,scriptBytes:Buffer.byteLength(guardianExistingIdleBudgetLua()),rows:proof,requestCount:3,maximumCommands:redisCommands,maximumCombinedBytes:bytes,creditCommands:16,creditTransferBytes:36864,commandsMargin:16-redisCommands,bytesMargin:36864-bytes,allPrefixesFit:proof.every(row=>row.marginToCreditBytes>=0),missingIdleLedgerNeverInitialized:true,fullClaimChargedToSeparateFullPass:true,fullClaimIncludedInFullPassWireScopeRequired:true,rawPolicyKeyMaxBytes:512,clockAndEnvelopeUpperBytes:envelope,overheadPerDirectionBytes:overhead,sharedFreeInvoice:false,noNewGetPerHour:true,sourceRuntimeIdleGuardRequired:true,networkRequests:0,realRedisLua:false,ledgerWrites:0,productionChanges:0,payments:0};
}
