// Import-safe. Pure gate arithmetic plus an optional local source/build hash
// verifier. Neither function queries a service, reads secrets or mutates state.
import {readFile,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {safeSourcePath,sourceDigest} from './prepare-functional-preview-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),safe=value=>Number.isSafeInteger(value)&&value>=0,profiles=['public','authenticated','recovery','background'];
const limits=Object.freeze({public:115000,authenticated:90000,recovery:105000,background:50000}),configurationId=hash(JSON.stringify(limits));
const fail=code=>{throw Error(code);},time=value=>{const n=Date.parse(value??'');if(!Number.isFinite(n)||new Date(n).toISOString()!==value)fail('EXACT_V3_OBSERVATION_TIME_REQUIRED');return n;};
function snapshot(row){
 if(!row||row.role!=='production'||row.ledgerVersion!==2||row.readOnly!==true||row.configurationId!==configurationId||!['namespaceFingerprint','heldFingerprint'].every(key=>/^[a-f0-9]{64}$/.test(row[key]??''))||!safe(row.committedTransferBytes)||!safe(row.heldTransferBytes)||!safe(row.holdCount))fail('EXACT_V3_READ_ONLY_LEDGER_REQUIRED');
 for(const key of ['committedCommands','heldCommands'])if(!row[key]||Object.keys(row[key]).sort().join(',')!==[...profiles].sort().join(',')||profiles.some(profile=>!safe(row[key][profile])))fail('EXACT_V3_COMMAND_PARTITIONS_REQUIRED');
 time(row.observedAt);return row;
}
/** Source observations are supplied by root-owned read-only collectors. A
 * decreasing counter is rejected even if legitimate window expiry is possible;
 * that case needs an explicit separate review, never an inferred quota reset.
 */
export function recomputeV3FreshCapacity({forecast,before,after,sharedFree,now=Date.now(),outsideValidationBytes=0,outsideValidationCommands=0,guardianBound}){
 snapshot(before);snapshot(after);
 if(!safe(now)||!safe(outsideValidationBytes)||!safe(outsideValidationCommands)||forecast?.profile!=='example-text-wire/v3'||forecast.totalNewTransferBytes!==2403704832||forecast.proposedTransferCapBytes!==9900000000||forecast.held?.transferBytes!==1071140864||forecast.completeHistoryScope?.identityPanelButton!==true||forecast.completeHistoryScope?.observedQueryHistoryPanel!==true)fail('EXACT_V3_COMPLETE_UI_FORECAST_REQUIRED');
 if(before.namespaceFingerprint!==after.namespaceFingerprint||before.configurationId!==after.configurationId||before.heldFingerprint!==after.heldFingerprint||before.holdCount!==after.holdCount||before.heldTransferBytes!==after.heldTransferBytes||profiles.some(profile=>before.heldCommands[profile]!==after.heldCommands[profile]))fail('V3_ALL_OLD_HOLDS_AND_CONFIG_MUST_BE_UNCHANGED');
 if(after.committedTransferBytes<before.committedTransferBytes||profiles.some(profile=>after.committedCommands[profile]<before.committedCommands[profile]))fail('V3_OLD_CONSUMPTION_MUST_NOT_DECREASE');
 const beforeAt=time(before.observedAt),afterAt=time(after.observedAt);if(afterAt<beforeAt||afterAt>now)fail('V3_MONOTONIC_OBSERVATION_CLOCK_REQUIRED');
 const rounded=sharedFree?.maximumRoundedForGate;if(sharedFree?.plan!=='Free Tier'||!rounded||!['commands','bandwidthBytes','storageBytes'].every(key=>safe(rounded[key])))fail('EXACT_V3_SHARED_FREE_OBSERVATION_REQUIRED');const uiAt=time(sharedFree.observedAt);if(uiAt>now)fail('V3_SHARED_FREE_CLOCK_REQUIRED');
 const freshAfter=now-afterAt<=300000,freshUi=now-uiAt<=300000,safetyMarginBytes=8*1048576,accountedBytes=after.committedTransferBytes+after.heldTransferBytes,requiredTotal=accountedBytes+forecast.totalNewTransferBytes,knownMargin=9900000000-requiredTotal;
 const commands=Object.fromEntries(profiles.map(profile=>{const work=forecast.commandForecast?.[profile]?.newWork;if(!safe(work))fail('V3_EXACT_FUTURE_COMMAND_WORK_REQUIRED');const total=after.committedCommands[profile]+after.heldCommands[profile]+work;return [profile,{limit:limits[profile],committed:after.committedCommands[profile],held:after.heldCommands[profile],newWork:work,total,remaining:limits[profile]-total,fits:total<=limits[profile]}];}));
 const allCommandPartitionsFit=Object.values(commands).every(row=>row.fits),fullCommandCap=Object.values(limits).reduce((sum,value)=>sum+value,0),physicalCombinedBytes=9900000000+rounded.bandwidthBytes+outsideValidationBytes,physicalCombinedCommands=fullCommandCap+rounded.commands+outsideValidationCommands,physicalStorageUpperBytes=200000000+20000000+32768+rounded.storageBytes;
 const physicalByteMargin=10000000000-physicalCombinedBytes,physicalCommandMargin=500000-physicalCombinedCommands,physicalStorageMargin=238000000-physicalStorageUpperBytes;
 const guardianBoundConfirmed=guardianBound?.maximumFullPasses===2&&guardianBound?.creditPerPassCommands===1104&&guardianBound?.creditPerPassBytes===64004096&&guardianBound?.enforcedDurably===true&&guardianBound?.unknownIndexNeverIdle===true&&guardianBound?.exhaustionReportedToOperator===true&&guardianBound?.sourceAndBuildReviewed===true&&/^[a-f0-9]{64}$/.test(guardianBound?.sourceDigest??'');
 const reasons=[];if(!freshAfter)reasons.push('FRESH_PRODUCTION_LEDGER_REQUIRED');if(!freshUi)reasons.push('FRESH_SHARED_FREE_UI_REQUIRED');if(knownMargin<safetyMarginBytes)reasons.push('V3_FULL_FLOW_PLUS_8MIB_MARGIN_REQUIRED');if(!allCommandPartitionsFit)reasons.push('V3_COMMAND_PARTITION_MARGIN_REQUIRED');if(physicalByteMargin<safetyMarginBytes)reasons.push('V3_SHARED_PHYSICAL_BYTES_AND_VALIDATION_MARGIN_REQUIRED');if(physicalCommandMargin<0)reasons.push('V3_SHARED_COMMAND_MARGIN_REQUIRED');if(physicalStorageMargin<0)reasons.push('V3_SHARED_STORAGE_MARGIN_REQUIRED');if(!guardianBoundConfirmed)reasons.push('ENFORCED_GUARDIAN_FULL_PASS_BOUND_REQUIRED');
 return {version:1,status:reasons.length?'BLOCKED_V3_FRESH_CAPACITY_GATE':'PASS_V3_FRESH_CAPACITY_ARITHMETIC_ONLY',checkedAt:new Date(now).toISOString(),lastLedgerObservedAt:after.observedAt,lastSharedObservedAt:sharedFree.observedAt,configurationId,oldHoldFingerprint:after.heldFingerprint,oldUsageAndHoldsBytes:accountedBytes,newFiniteWorkBytes:forecast.totalNewTransferBytes,requiredTotalWithOldUsageAndHolds:requiredTotal,proposedInternalCapBytes:9900000000,knownByteMargin:knownMargin,safetyMarginBytes,remainingAfterSafety:knownMargin-safetyMarginBytes,commands,allCommandPartitionsFit,physicalShared:{roundedPrior:structuredClone(rounded),outsideValidationBytes,outsideValidationCommands,fullInternalCommandBudget:fullCommandCap,physicalCombinedBytes,physicalByteMargin,physicalCombinedCommands,physicalCommandMargin,physicalStorageUpperBytes,physicalStorageMargin,oldActualUsageConservativelyAddedToFullBudget:true,storagePoolConservativelyCountedInAdditionToNativeCap:true,notAnInvoice:true},freshLedger:freshAfter,freshSharedUi:freshUi,guardianBoundConfirmed,blockedReasons:reasons,holdsPreservedExactly:true,consumptionPreservedMonotonically:true,quotaReset:false,configurationChanged:false,limitsChanged:false,publicationAuthorized:false,paymentAuthorized:false,networkRequests:0,ledgerWrites:0,payments:0};
}
/** Verifies every frozen source row, manifest digest, build receipt and lock.
 * Reads only reviewed local source paths. Never rebuilds or runs application code.
 */
export async function verifyLocalV3SourceBuild({manifestPath,buildPath,root=process.cwd()}){
 if(!/^docs\/evidence\/recovery-example-budget3-(?:production-)?bazaar-source-2026-10-13\.json$/.test(manifestPath??'')||!/^docs\/evidence\/recovery-example-budget3-(?:production-)?bazaar-build-2026-10-13\.json$/.test(buildPath??''))fail('EXACT_V3_LOCAL_SOURCE_BUILD_PATH_REQUIRED');
 const [manifestRaw,buildRaw]=await Promise.all([readFile(resolve(root,manifestPath)),readFile(resolve(root,buildPath))]),manifest=JSON.parse(manifestRaw),build=JSON.parse(buildRaw);
 if(!/^\.vercel\/recovery-example-budget3-(?:production-)?bazaar-source$/.test(manifest.sourceDirectory??'')||!Array.isArray(manifest.files)||manifest.files.length!==348||manifest.fileCount!==348||sourceDigest(manifest.files)!==manifest.sourceDigest||build.sourceDigest!==manifest.sourceDigest||build.manifest!==manifestPath||build.manifestSha256!==hash(manifestRaw)||build.filesVerified!==348||build.sourceUntouched!==true||build.exitCode!==0||build.typeScriptSucceeded!==true||build.productionPublished!==false||build.payments!==0||build.signatures!==0)fail('V3_LOCAL_SOURCE_BUILD_BINDING_MISMATCH');
 const directory=resolve(root,manifest.sourceDirectory);if((await lstat(directory)).isSymbolicLink())fail('V3_PLAIN_FROZEN_SOURCE_REQUIRED');
 const seen=new Set(),results=await Promise.allSettled(manifest.files.map(async row=>{
  if(!safeSourcePath(row.path)||seen.has(row.path)||!safe(row.bytes)||!/^[a-f0-9]{64}$/.test(row.sha256))fail('V3_REVIEWED_SOURCE_ENTRY_REQUIRED');seen.add(row.path);
  const file=resolve(directory,row.path),rel=relative(directory,file);if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('V3_CONFINED_SOURCE_PATH_REQUIRED');
  let current=directory;for(const part of rel.split(sep)){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())fail('V3_PLAIN_FROZEN_SOURCE_REQUIRED');}
  const raw=await readFile(file);if(raw.length!==row.bytes||hash(raw)!==row.sha256)fail('V3_FROZEN_SOURCE_FILE_CHANGED');return row.path;
 }));const failures=results.filter(value=>value.status==='rejected');if(failures.length)fail('V3_FROZEN_SOURCE_FILES_UNCONFIRMED');
 const lock=manifest.files.find(row=>row.path==='package-lock.json');if(!lock||build.dependencies?.packageLockSha256!==lock.sha256)fail('V3_FROZEN_LOCK_BINDING_MISMATCH');
 return {status:'PASS_LOCAL_INDEPENDENT_V3_SOURCE_BUILD_PINS',sourceDigest:manifest.sourceDigest,manifestPath,manifestSha256:hash(manifestRaw),buildPath,buildSha256:hash(buildRaw),filesVerified:results.length,packageLockSha256:lock.sha256,networkRequests:0,sourceWrites:0,buildsRun:0,productionPublished:false,payments:0};
}
