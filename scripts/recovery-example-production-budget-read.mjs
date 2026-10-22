// A single new production observation: fixed GET/GET only. No admission,
// settlement, provider wake or alteration of a budget/hold/storage ledger.
import {createHash} from 'node:crypto';
import {readFile,lstat,open} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PRODUCTION_BUDGET_COMMANDS,PRODUCTION_BUDGET_READ,summarizeProductionBudgetPipeline} from './payment-recovery-acceptance-postpublication-budget-read.mjs';

const ROOT='C:/Users/MGC/Documents/ChatGPT/Bazaarx402/beta-open-build';
const sha=value=>createHash('sha256').update(value).digest('hex'),fail=code=>{throw Error(code);};
export const RECOVERY_EXAMPLE_PRODUCTION_BUDGET=Object.freeze({
 authority:'docs/evidence/recovery-example-production-authority-2026-10-12.json',
 intent:'.vercel/recovery-example-production-budget-read-intent.json',
 evidence:'docs/evidence/recovery-example-production-budget-read-2026-10-12.json',
 parser:'scripts/payment-recovery-acceptance-postpublication-budget-read.mjs',
 parserSha256:'5ea4e7184afae45a37991b132df92ed2a59eb095ab1b47bb08dabfb6f2a6c561',
 originalCipher:'.vercel/on-demand-production-purchase-31c97193-be74-4b9d-b0a3-f3890b0a41e8.journal.dpapi',
 originalCipherSha256:'97efd58199da7499b40f0b0b889ddbd7844f91fab0fedb8351e9b9881c530cfb',
 bazaarDeploymentId:'dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY',providerDeploymentId:'dpl_59zNf8MCvktnzTgci3eppUriS2Un',
 sourceDigest:'3c3fe5ad3dc886e770c5aec1e1cee2762686558036c3bf55ec310899a35173ed',providerSourceDigest:'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232',
 maximumAgeMs:300000,maximumResponseBytes:2097152,maximumDurationMs:10000,
 expectedTransferLimitBytes:8500000000,expectedCommandLimit:360000,
 exampleRequiredTransferBytes:2000000000,exampleRecoveryCommands:12000,exampleBackgroundCommands:4000,
 originalReservedTransferBytes:1421972480,originalReservedRecoveryCommands:9984,originalReservedBackgroundCommands:4000,
});
const C=RECOVERY_EXAMPLE_PRODUCTION_BUDGET;
const zero=Object.freeze({redisWrites:0,evalOperations:0,ttlOperations:0,scanOperations:0,newOrders:0,newPayments:0,signatures:0,settlements:0,providerExecutions:0,limitChanges:0,credentialValuesReturned:0,ownerIdsReturned:0,payloadsReturned:0,promptsReturned:0,operationIdsReturned:0,rawKeysReturned:0,financialStateReads:0,ordersRead:0});
const safe=error=>/^[A-Z][A-Z0-9_]{2,95}$/.test(error?.message??'')?error.message:'EXAMPLE_PRODUCTION_BUDGET_READ_UNCONFIRMED';
function owned(path){const absolute=resolve(ROOT,path),rel=relative(ROOT,absolute);if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('EXAMPLE_PRODUCTION_BUDGET_OWN_PATH_REQUIRED');return absolute;}
async function artifact(path,maximum=2097152){const absolute=owned(path),info=await lstat(absolute);if(!info.isFile()||info.isSymbolicLink()||info.size>maximum)fail('EXAMPLE_PRODUCTION_BUDGET_ARTIFACT_BOUND');return readFile(absolute);}
async function absent(path){try{await lstat(owned(path));fail('EXAMPLE_PRODUCTION_BUDGET_EXISTING_INTENT');}catch(error){if(error.code!=='ENOENT')throw error;}}
async function exclusive(path,value){const file=await open(owned(path),'wx',0o600);try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}}
export async function verifyRecoveryExampleProductionBudgetParser(readArtifact=artifact){if(sha(await readArtifact(C.parser))!==C.parserSha256)fail('EXAMPLE_PRODUCTION_BUDGET_PARSER_CHANGED');return true;}
async function originalUnchanged(readArtifact=artifact){if(sha(await readArtifact(C.originalCipher,524288))!==C.originalCipherSha256)fail('EXAMPLE_ORIGINAL_PAYMENT_CIPHER_CHANGED');return true;}
export function validateRecoveryExampleProductionAuthority(value,now=Date.now()){
 const timestamp=Date.parse(value?.observedAt);
 if(!Number.isSafeInteger(now)||!Number.isFinite(timestamp)||new Date(timestamp).toISOString()!==value.observedAt||timestamp>now||now-timestamp>C.maximumAgeMs||value.status!=='PASS_FRESH_RECOVERY_EXAMPLE_PRODUCTION_AUTHORITY'||value.bazaarDeploymentId!==C.bazaarDeploymentId||value.providerDeploymentId!==C.providerDeploymentId||value.canonicalOrigin!=='https://bazaar.browns.studio'||value.canonicalAssigned!==true||value.sourceDigest!==C.sourceDigest||value.providerSourceDigest!==C.providerSourceDigest||value.transferLimitBytes!==C.expectedTransferLimitBytes||value.commandLimit!==C.expectedCommandLimit||value.generalPurchasesEnabled!==false||value.purchaseAdmission!=='restricted'||value.upstashPlan!=='free'||value.originalFinancialJournalUnchanged!==true)fail('EXAMPLE_FRESH_PRODUCTION_AUTHORITY_REQUIRED');
 return {observedAt:value.observedAt,bazaarDeploymentId:value.bazaarDeploymentId,providerDeploymentId:value.providerDeploymentId,canonicalOrigin:value.canonicalOrigin,sourceDigest:value.sourceDigest,providerSourceDigest:value.providerSourceDigest,expectedTransferLimitBytes:value.transferLimitBytes,expectedCommandLimit:value.commandLimit,generalPurchasesEnabled:false,purchaseAdmission:'restricted',upstashPlan:'free',scope:'fresh deployment identity with expected limits from immutable published candidate; no production HTTP invocation'};
}
export function summarizeRecoveryExampleProductionBudget(rows,{observedAt=new Date().toISOString(),authority,authoritySha256}={}){
 const binding=validateRecoveryExampleProductionAuthority(authority,Date.parse(observedAt)),summary=summarizeProductionBudgetPipeline(rows,{observedAt}),budget=summary.budget;
 const conserved=budget.configurationMatches360k===true&&budget.configurationId===PRODUCTION_BUDGET_READ.configurationId&&budget.commandLimit===C.expectedCommandLimit&&budget.windowMs===31*86400000&&budget.heldOperationCount===1&&budget.originalOperationHoldPresent===true&&budget.reservedTransferBytes===C.originalReservedTransferBytes&&budget.reservedCommandsByProfile.recovery===C.originalReservedRecoveryCommands&&budget.reservedCommandsByProfile.background===C.originalReservedBackgroundCommands;
 const transferFits=budget.remainingTransferBytes>=C.exampleRequiredTransferBytes,commandsFit=budget.remainingCommandsByProfile.recovery>=C.exampleRecoveryCommands&&budget.remainingCommandsByProfile.background>=C.exampleBackgroundCommands;
 const reserveFits=conserved&&transferFits&&commandsFit;
 return {version:1,status:reserveFits?'PASS_READ_ONLY_RECOVERY_EXAMPLE_PRODUCTION_BUDGET':'BLOCKED_READ_ONLY_RECOVERY_EXAMPLE_PRODUCTION_BUDGET',observedAt,authority:binding,authorityReceiptSha256:authoritySha256,budget,storage:summary.storage,restRequests:1,redisCommands:2,...zero,originalHoldConservationProven:conserved,originalFinancialJournalUnchanged:true,originalPaymentStateRead:false,originalPaymentStateChanged:false,heldOperationsNeverExpired:true,commandLedgerReset:false,pendingHoldsReleased:false,limitsChanged:false,productionPublished:false,generalPurchasesEnabled:false,exampleReservationProjection:{requiredRecoveryCommands:C.exampleRecoveryCommands,requiredBackgroundCommands:C.exampleBackgroundCommands,requiredHeldTransferBytes:C.exampleRequiredTransferBytes,availableCurrentTransferBytes:budget.remainingTransferBytes,commandsFit,transferFits,shortfallBytes:Math.max(0,C.exampleRequiredTransferBytes-budget.remainingTransferBytes),remainingAfterReservationBytes:Math.max(0,budget.remainingTransferBytes-C.exampleRequiredTransferBytes),minimumCapForReservationBytes:budget.accountedTransferBytes+C.exampleRequiredTransferBytes,existingHoldsIncluded:true,existingHoldsRetained:true,storageReservationNotEvaluated:true,fullFinancialAndDeliveryRouteNotEvaluated:true,admissionNotAuthorized:true,newFinancialAuthorizationRequired:true,physicalMonthlyPlanUsageNotRead:true,physicalDashboardAndRuntimeAdmissionStillRequired:true},...(reserveFits?{}:{blockedCode:!conserved?'ORIGINAL_HOLD_OR_CONFIGURATION_CHANGED':!commandsFit?'EXAMPLE_RESERVED_COMMAND_MARGIN_INSUFFICIENT':'EXAMPLE_GENERIC_RESERVATION_MARGIN_INSUFFICIENT'}),explanation:'A fresh read retains all committed usage and pending holds. The example needs the unchanged generic 2 GB operation reservation, plus separate route admission checks; this report neither changes limits nor authorizes a purchase.'};
}
export async function readRecoveryExampleProductionBudget(access,{fetcher=globalThis.fetch,now=Date.now,readArtifact=artifact,assertAbsent=absent,writeExclusive=exclusive,assertOriginalUnchanged=()=>originalUnchanged(readArtifact)}={}){
 if(resolve(process.cwd())!==resolve(ROOT)||!access||Object.keys(access).sort().join(',')!=='token,url'||access.url!==PRODUCTION_BUDGET_READ.origin||typeof access.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(access.token))fail('EXAMPLE_FIXED_PRODUCTION_REDIS_ACCESS_REQUIRED');
 await verifyRecoveryExampleProductionBudgetParser(readArtifact);const authorityBytes=await readArtifact(C.authority,131072),authority=JSON.parse(authorityBytes.toString('utf8')),binding=validateRecoveryExampleProductionAuthority(authority,now()),authoritySha256=sha(authorityBytes);
 await assertOriginalUnchanged();await assertAbsent(C.intent);await assertAbsent(C.evidence);
 await writeExclusive(C.intent,{version:1,status:'ONE_RECOVERY_EXAMPLE_PRODUCTION_BUDGET_READ_NO_RETRY',at:new Date(now()).toISOString(),authority:binding,authorityReceiptSha256:authoritySha256,restRequests:1,redisCommands:2,maximumResponseBytes:C.maximumResponseBytes,maximumDurationMs:C.maximumDurationMs,...zero});
 let response;
 try{response=await fetcher(PRODUCTION_BUDGET_READ.origin+'/pipeline',{method:'POST',headers:{authorization:'Bearer '+access.token,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(PRODUCTION_BUDGET_COMMANDS),redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(C.maximumDurationMs)});}finally{access.token='';}
 if(response.status!==200||response.redirected||response.url&&response.url!==PRODUCTION_BUDGET_READ.origin+'/pipeline'||response.headers.has('location')||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'){await response.body?.cancel();fail('EXAMPLE_PRODUCTION_BUDGET_TRANSPORT_UNCONFIRMED');}
 const reader=response.body?.getReader(),parts=[];let bytes=0;if(!reader)fail('EXAMPLE_PRODUCTION_BUDGET_RESPONSE_REQUIRED');
 try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>C.maximumResponseBytes){await reader.cancel();fail('EXAMPLE_PRODUCTION_BUDGET_RESPONSE_BOUND');}parts.push(next.value);}}finally{reader.releaseLock();}
 const raw=Buffer.concat(parts);let report;
 try{report=summarizeRecoveryExampleProductionBudget(JSON.parse(raw.toString('utf8')),{observedAt:new Date(now()).toISOString(),authority,authoritySha256});}finally{raw.fill(0);parts.forEach(part=>part.fill(0));}
 await assertOriginalUnchanged();await writeExclusive(C.evidence,{...report,responseBytes:bytes,evidence:C.evidence});return {...report,responseBytes:bytes,evidence:C.evidence};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{
 const [action='check',flag,pin]=process.argv.slice(2);
 if(action==='check'&&process.argv.length===3){await verifyRecoveryExampleProductionBudgetParser();console.log(JSON.stringify({status:'PREPARED_READ_ONLY_RECOVERY_EXAMPLE_PRODUCTION_BUDGET',restRequests:1,redisCommands:2,maximumAgeMs:C.maximumAgeMs,maximumResponseBytes:C.maximumResponseBytes,maximumDurationMs:C.maximumDurationMs,expectedTransferLimitBytes:C.expectedTransferLimitBytes,expectedCommandLimit:C.expectedCommandLimit,exampleRequiredTransferBytes:C.exampleRequiredTransferBytes,networkRequests:0,dpapiReads:0,...zero}));}
 else if(action==='read'&&process.argv.length===5&&flag==='--approved-helper-sha256'&&pin===sha(await readFile(process.argv[1]))){const parts=[];let bytes=0;for await(const part of process.stdin){bytes+=part.length;if(bytes>8192)fail('EXAMPLE_PRODUCTION_PRIVATE_INPUT_BOUND');parts.push(part);}const raw=Buffer.concat(parts);let access;try{access=JSON.parse(raw.toString('utf8'));}finally{raw.fill(0);parts.forEach(part=>part.fill(0));}const report=await readRecoveryExampleProductionBudget(access);console.log(JSON.stringify(report));if(report.status.startsWith('BLOCKED'))process.exitCode=1;}
 else fail('EXAMPLE_EXACT_PRODUCTION_BUDGET_ACTION_REQUIRED');
}catch(error){console.log(JSON.stringify({status:'UNCONFIRMED_RECOVERY_EXAMPLE_PRODUCTION_BUDGET',code:safe(error),...zero,retryPolicy:'Inspect the exclusive read intent and receipt before any further expressly authorized observation.'}));process.exitCode=1;}
