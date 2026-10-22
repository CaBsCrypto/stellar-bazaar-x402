// Offline analytical source model for the three exact, authenticated control
// families. This module chooses no runtime envelope and performs no I/O itself.
// Every serialized native state position is separately charged at its writer's
// cap. Plain/base64 response maxima are both covered by the double-JSON bound.
export const CONTROL_TYPED_CAPS=Object.freeze({registry:1048576,owner:131072,permission:4096,market:524288,review:1048576,settlement:131072,capacity:65536,index:512});
const bytes=value=>Buffer.byteLength(value,'utf8');
const stringCap=raw=>2*raw+2;
const scalarResponseBytes=256;
const httpFramingBytes=4096;
const keyMaximumBytes=512;
function checkedInteger(n){if(!Number.isSafeInteger(n)||n<0)throw Error('BOUNDED_TYPED_CONTROL_QUANTITY_REQUIRED');return n;}
function scriptByCategory(catalog,category){const row=catalog.localScriptFixtures.find(v=>v.category===category);if(!row||typeof row.script!=='string'||row.scriptSha256!==catalog.rows.find(v=>v.category===category)?.scriptSha256)throw Error('EXACT_AUDITED_CONTROL_SCRIPT_REQUIRED');return row;}
function evalRow(catalog,label,category,argsRawCaps,responseRawCaps=[]){
 const script=scriptByCategory(catalog,category);
 if(script.argCount!==argsRawCaps.length)throw Error('TYPED_CONTROL_ARGUMENT_POSITION_MISMATCH');
 // Literal EVAL/script/arity/keys/arguments commas and array framing are given
 // 256 bytes. Exact JSON-escaped source bytes are used, not a heuristic size.
 const requestBodyUpper=256+bytes(JSON.stringify(script.script))+script.keyCount*stringCap(keyMaximumBytes)+argsRawCaps.reduce((n,cap)=>n+stringCap(checkedInteger(cap)),0);
 const responseBodyUpper=scalarResponseBytes+responseRawCaps.reduce((n,cap)=>n+stringCap(checkedInteger(cap)),0);
 return {label,category,scriptSha256:script.scriptSha256,restRequests:1,commandsUpper:script.maximumRedisCommands,argsRawCaps,responseRawCaps,requestBodyUpper,responseBodyUpper,outboundUpperBytes:requestBodyUpper+httpFramingBytes,inboundUpperBytes:responseBodyUpper+httpFramingBytes};
}
function getRow(label,role){const cap=CONTROL_TYPED_CAPS[role];if(cap===undefined)throw Error('TYPED_CONTROL_GET_ROLE_REQUIRED');const requestBodyUpper=256+stringCap(keyMaximumBytes),responseBodyUpper=scalarResponseBytes+stringCap(cap);return {label,category:'GET',restRequests:1,commandsUpper:1,responseRawCaps:[cap],role,requestBodyUpper,responseBodyUpper,outboundUpperBytes:requestBodyUpper+httpFramingBytes,inboundUpperBytes:responseBodyUpper+httpFramingBytes};}
function workspaceRead(catalog,label,owner=false){return evalRow(catalog,label,'workspace-read',[],[CONTROL_TYPED_CAPS.registry,owner?CONTROL_TYPED_CAPS.owner:0,12]);}
function workspaceCommit(catalog,label,owner=false,writeOwner=false){const c=CONTROL_TYPED_CAPS;return evalRow(catalog,label,'workspace-cas-storage',[c.registry,owner?c.owner:0,12,c.registry,writeOwner?c.owner:0,c.index,64,672]);}
function permissionRead(catalog,label){const c=CONTROL_TYPED_CAPS;return evalRow(catalog,label,'permission-read',[],[c.registry,c.owner,12,c.permission]);}
function marketCommit(catalog,label,guards){const c=CONTROL_TYPED_CAPS;return evalRow(catalog,label,'market-joint-g'+guards+'-plain',[8,c.market,8,c.settlement,8,c.capacity,c.market,0,c.capacity,guards?8:16,guards?c.registry:0,guards?8:16,guards>1?c.permission:0,16,8,c.index,c.index,64,672]);}
function total(rows){const out={restRequests:0,commandsUpper:0,outboundUpperBytes:0,inboundUpperBytes:0,combinedUpperBytes:0};for(const row of rows){out.restRequests+=row.restRequests;out.commandsUpper+=row.commandsUpper;out.outboundUpperBytes+=row.outboundUpperBytes;out.inboundUpperBytes+=row.inboundUpperBytes;}out.combinedUpperBytes=out.outboundUpperBytes+out.inboundUpperBytes;return out;}
// Reuse the same audited serialization model for private, direct operator setup.
// These are analytical helpers; they never select a server budget profile.
export {evalRow as controlTypedEvalRow,getRow as controlTypedGetRow,workspaceRead as controlTypedWorkspaceRead,workspaceCommit as controlTypedWorkspaceCommit,permissionRead as controlTypedPermissionRead,marketCommit as controlTypedMarketCommit,total as controlTypedTotal};
/** The family names here are source roles, not user-selectable profile inputs.
 * Caller supplies scripts captured by reviewed native builders using fake Redis.
 * Index bootstrap is explicit; a missing maintenance index is not ignored. */
export function deriveExampleControlTypedBounds(catalog){
 if(!catalog||!Array.isArray(catalog.rows)||!Array.isArray(catalog.localScriptFixtures))throw Error('LOCAL_EXACT_CONTROL_CATALOG_REQUIRED');
 const common=[workspaceRead(catalog,'ingress-credential-proof'),evalRow(catalog,'continuous-free-command-debit','continuous-budget',[512,512]),workspaceRead(catalog,'global-ingress-registry-read'),getRow('global-ingress-maintenance-index','index'),workspaceCommit(catalog,'global-ingress-registry-cas')];
 const identity=[...common,workspaceRead(catalog,'handler-credential-proof'),workspaceRead(catalog,'account-quota-read',true),getRow('account-quota-maintenance-index','index'),workspaceCommit(catalog,'account-quota-registry-cas',true),permissionRead(catalog,'generation-bound-wallet-identity')];
 const capacity=[...identity,getRow('reported-service-read','market'),getRow('activated-review-read','review'),getRow('capacity-report-market-read','market'),getRow('capacity-report-settlement-read','settlement'),getRow('capacity-report-reservation-ledger-read','capacity'),getRow('capacity-report-maintenance-index','index'),marketCommit(catalog,'capacity-report-atomic-generation-guard',2)];
 const coldRepair=[getRow('missing-market-index-settlement-read','settlement'),getRow('missing-market-index-reservation-ledger-read','capacity'),getRow('missing-market-index-read','index'),marketCommit(catalog,'missing-market-index-bootstrap',0)];
 const families={metadata:{rows:common,total:total(common)},identity:{rows:identity,total:total(identity)},capacity:{rows:capacity,total:total(capacity)},capacityWithLegacyIndexBootstrap:{rows:[...capacity,...coldRepair],total:total([...capacity,...coldRepair])}};
 return {version:1,status:'OFFLINE_SOURCE_TYPED_CONTROL_BOUNDS_ONLY',families,snapshotCaps:CONTROL_TYPED_CAPS,model:{stateStringUpper:'2*writerRawCap+2 bytes per serialized string; covers plain/base64 encodings and quote-heavy native values',requestLiteralEnvelopeBytes:256,responseLiteralEnvelopeBytes:scalarResponseBytes,requestAndResponseFramingBytesEach:httpFramingBytes,keyMaximumBytes,workspaceMaintenanceIndexMaximumBytes:512,workspaceStoragePatchMaximumBytes:672,workspaceCommitMaximumPatchRows:4,storageLedgerRawTransported:false,continuousAccountQuotaAttempts:1,continuousIngressAttempts:1},networkRequests:0,credentialsRead:0,ledgerWrites:0,payments:0,limitsChanged:false,limitations:['These are source-position upper bounds, not a live trace or a Redis invoice.','Observed-metadata query/history tools are a different family and are intentionally excluded.','Generation proofs, quota checks, permission snapshots and capacity CAS generation guards are all retained.','Capacity warm bounds require initialized market maintenance; the legacy bootstrap branch is separately included rather than silently omitted.','Reducing a guarded cap also requires a per-command response preflight. Uniform 4-MiB response preflight can falsely deny a small final scalar CAS even though actual typed I/O fits.','A runtime source change, new Redis argument position, retry or transport encoding must regenerate this model and tests.']};
}
