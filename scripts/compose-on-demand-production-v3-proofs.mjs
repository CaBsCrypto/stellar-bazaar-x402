// Local evidence composition only. No network, Redis, DPAPI, deployment,
// wallet, payment, cron or modification of the frozen source/pins.
import {createHash} from 'node:crypto';
import {open,readFile,lstat,rename} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {productionStoragePlan,validateProductionStorageReadiness} from './initialize-on-demand-production-v3-storage.mjs';
import {validateV3QuotaProof} from '../.vercel/on-demand-production-v3-control.mjs';

export const COMPOSITION_PATHS=Object.freeze({
 quota:'docs/evidence/on-demand-upstash-free-current-v3-2026-10-12.json',
 capacity:'.vercel/on-demand-production-v3-free-capacity-receipt.json',
 native:'docs/evidence/on-demand-production-v3-storage-inventory-2026-10-12.json',
 init:'.vercel/on-demand-production-v3-storage-init-intent.json',
 drain:'.vercel/on-demand-production-v3-writer-drain-receipt.json',
 preview:'docs/evidence/on-demand-v2-preview-budget-read-2026-10-12.json',
 attestation:'docs/evidence/on-demand-production-v3-native-drain-attestation-2026-10-12.json',
});
const sha=value=>createHash('sha256').update(value).digest('hex'),hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),fail=code=>{throw Error(code);};
const caps=Object.freeze({public:115000,authenticated:90000,recovery:105000,background:50000});
const prior={historicalHighest:47000,previewCommandReservations:27808,conservativeFloor:74808};
const canon=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canon(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canon(value[k]))])):value);
function own(root,path){const out=resolve(root,path),r=relative(root,out);if(!r||r==='..'||r.startsWith('..'+sep)||isAbsolute(r)||!path.endsWith('.json'))fail('OWN_JSON_EVIDENCE_PATH_REQUIRED');return out;}
async function raw(root,path,optional=false){try{const target=own(root,path),info=await lstat(target);if(!info.isFile()||info.isSymbolicLink()||info.size>1_000_000)fail('PLAIN_BOUNDED_EVIDENCE_REQUIRED');return await readFile(target);}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
async function exclusive(root,path,bytes){const f=await open(own(root,path),'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function preserveAndReplace(root,path,oldBytes,newBytes){
 const current=await raw(root,path,true);if((current===null)!==(oldBytes===null)||current!==null&&!current.equals(oldBytes))fail('EVIDENCE_CHANGED_NO_REPLACEMENT');
 if(current!==null&&current.equals(newBytes))return {path,sha256:sha(newBytes),alreadyIdentical:true,previousPreserved:null};
 let previousPreserved=null;
 if(current!==null){previousPreserved=path.replace(/\.json$/,'.previous-'+sha(current)+'.json');const existing=await raw(root,previousPreserved,true);if(existing!==null&&!existing.equals(current))fail('PREVIOUS_SNAPSHOT_CONFLICT');if(existing===null)await exclusive(root,previousPreserved,current);}
 const staged=path.replace(/\.json$/,'.staged-'+sha(newBytes)+'.json'),stagedPrior=await raw(root,staged,true);if(stagedPrior!==null&&!stagedPrior.equals(newBytes))fail('STAGED_EVIDENCE_CONFLICT');if(stagedPrior===null)await exclusive(root,staged,newBytes);
 // No recursive operations or content deletion. The exact previous bytes have
 // been preserved before the canonical metadata pointer is replaced.
 const before=await raw(root,path,true);if((before===null)!==(oldBytes===null)||before!==null&&!before.equals(oldBytes))fail('EVIDENCE_CHANGED_BEFORE_REPLACEMENT');
 await rename(own(root,staged),own(root,path));
 const confirmed=await raw(root,path);if(!confirmed.equals(newBytes))fail('EVIDENCE_REPLACEMENT_UNCONFIRMED');return {path,sha256:sha(newBytes),alreadyIdentical:false,previousPreserved};
}

export function buildFreshQuotaProof(input,previewRaw,now=Date.now()){
 if(!input||Object.keys(input).sort().join(',')!=='observation,observedAt,version'||input.version!==1||typeof input.observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.observedAt)||!Number.isFinite(Date.parse(input.observedAt))||Date.parse(input.observedAt)>now||now-Date.parse(input.observedAt)>600000)fail('ACTUAL_FRESH_UI_OBSERVATION_UTC_REQUIRED');
 const o=input.observation;
 if(!o||Object.keys(o).sort().join(',')!=='commandLimit,commandsDisplay,monthlyChargeDisplay,plan,provider,region,storageDisplay,storageLimitDisplay,transferDisplay,transferLimitDisplay'||o.plan!=='Free Tier'||o.provider!=='AWS'||o.region!=='us-east-1'||o.commandLimit!==500000||!/^\d{1,2}mil$/.test(o.commandsDisplay)||!/^\d{1,4}(?:\.\d{1,3})?(?:MB|GB)$/.test(o.transferDisplay)||o.transferLimitDisplay!=='10GB'||!/^\d{1,4}(?:\.\d{1,3})?(?:KB|MB)$/.test(o.storageDisplay)||o.storageLimitDisplay!=='238MB'||o.monthlyChargeDisplay!=='$0.00')fail('EXACT_PROVIDED_ACTUAL_FREE_UI_OBSERVATION_REQUIRED');
 const roundedCommands=Number(o.commandsDisplay.slice(0,-3))*1000;if(roundedCommands+1000>80000)fail('ACTUAL_UI_COUNTER_EXCEEDS_80K_CONSERVATIVE_UPPER');
 const preview=JSON.parse(previewRaw);if(preview.status!=='PASS_READ_ONLY_PREVIEW_BUDGET'||preview.evidenceType!=='conservative-reservation-not-provider-invoice'||preview.pendingHeldOperations!==0||preview.transferReservedBytes!==7133724928||preview.transferLimitBytes!==8000000000||!preview.usedReservations)fail('ORIGINAL_PREVIEW_RESERVATION_SNAPSHOT_REQUIRED');
 const previewSum=['public','authenticated','recovery','background'].reduce((n,k)=>{const value=preview.usedReservations[k];if(!Number.isSafeInteger(value)||value<0)fail('ORIGINAL_PREVIEW_RESERVATION_SNAPSHOT_REQUIRED');return n+value;},0);
 if(previewSum!==26808)fail('ORIGINAL_PREVIEW_COMMAND_SUM_REQUIRED');
 const upper=80000,total=360000+upper+50000+3500;
 const quota={version:3,status:'FREE_CONFIRMED_READ_ONLY',observedAt:input.observedAt,plan:'Free Tier',provider:'AWS',region:'us-east-1',monthlyChargeDisplay:o.monthlyChargeDisplay,commandsUsed:upper,commandsUsedConservative:upper,commandsUsedObserved:roundedCommands,commandsUsedObservedRounded:true,observedCommandsDisplay:o.commandsDisplay,commandsRemainingConservative:500000-upper,priorConsumptionEvidence:prior,previewCommandReservationsSnapshot:previewSum,previewAdditionalConservativeAllowance:1000,previewReservedTransferBytes:preview.transferReservedBytes,previewReservationIsNotPhysicalInvoice:true,previewNamespaceNotResetOrTransferred:true,smallerUiObservationIsNotResetProof:true,commandsSource:'Provided actual visible UI snapshot; rounded display does not replace the preserved 80k conservative prior-use upper bound',actualUiObservationUtcProvided:true,observationSource:'upstash-console-current-visible-ui',physicalTransferDisplay:o.transferDisplay,physicalTransferLimitDisplay:o.transferLimitDisplay,physicalStorageDisplay:o.storageDisplay,physicalStorageLimitDisplay:o.storageLimitDisplay,rolloutEnvelope:{appCommands:360000,priorUpper:upper,sharedAndDenied:50000,setup:3500,total,unallocatedCommands:500000-total},previewSnapshotSha256:sha(previewRaw),observationInputSha256:sha(encode(input)),subscriptionChanged:false,paymentMethodSubmitted:false,newPayments:0,networkRequests:0,redisCommands:0,productionPublished:false,cronActivated:false};
 if(!validateV3QuotaProof(quota,now))fail('COMPOSED_QUOTA_CONTROLLER_REJECTED');
 const capacity={version:1,status:'CONFIRMED_FREE_CAPACITY_FOR_PRODUCTION',observedAt:input.observedAt,upstashPlan:'Free',monthlyCommandLimit:500000,sharedAndDeniedMargin:50000,initializationCommandReserve:3500,commandsUsed:upper,commandsUsedObserved:roundedCommands,commandsUsedObservedRounded:true,priorConsumptionEvidence:prior,applicationCommandBudget:360000,commandCaps:caps,commandsRemainingConservative:420000,quotaProofSha256:sha(encode(quota)),previewSnapshotSha256:sha(previewRaw),observationInputSha256:sha(encode(input)),counterRegressionIsNotReset:true,previewCommandReservationSum:26808,previewAdditionalConservativeAllowance:1000,productionPublished:false,cronActivated:false,payments:0};
 return {quota,capacity};
}

export async function composeQuotaEvidence(input,root=process.cwd(),deps={}){
 root=resolve(root);const now=deps.now?.()??Date.now(),preview=await raw(root,COMPOSITION_PATHS.preview),built=buildFreshQuotaProof(input,preview,now),oldQuota=await raw(root,COMPOSITION_PATHS.quota,true),oldCapacity=await raw(root,COMPOSITION_PATHS.capacity,true);
 const quotaOnly=deps.quotaOnly===true;if(quotaOnly&&oldCapacity===null)fail('ORIGINAL_CAPACITY_RECEIPT_REQUIRED_FOR_QUOTA_ONLY');
 const inputHash=sha(encode(input)),intentPath='.vercel/on-demand-production-v3-quota-'+(quotaOnly?'refresh-only':'composition')+'-'+inputHash+'.json',intent={version:1,action:quotaOnly?'refresh-only-controller-quota-preserve-init-receipts':'compose-local-ui-quota-evidence',observationInputSha256:inputHash,providedActualObservedAt:input.observedAt,originalQuotaSha256:oldQuota===null?null:sha(oldQuota),originalCapacitySha256:oldCapacity===null?null:sha(oldCapacity),newQuotaSha256:sha(encode(built.quota)),newCapacitySha256:quotaOnly?sha(oldCapacity):sha(encode(built.capacity)),networkRequests:0,redisCommands:0};
 const priorIntent=await raw(root,intentPath,true);if(priorIntent===null)await exclusive(root,intentPath,encode(intent));else{const original=JSON.parse(priorIntent);if(original.newQuotaSha256!==intent.newQuotaSha256||original.newCapacitySha256!==intent.newCapacitySha256)fail('COMPOSITION_INTENT_CHANGED');}
 const quota=await preserveAndReplace(root,COMPOSITION_PATHS.quota,oldQuota,encode(built.quota)),capacity=quotaOnly?{path:COMPOSITION_PATHS.capacity,sha256:sha(oldCapacity),preservedExactly:true}:await preserveAndReplace(root,COMPOSITION_PATHS.capacity,oldCapacity,encode(built.capacity));
 return {status:quotaOnly?'PASS_LOCAL_FRESH_QUOTA_ONLY_ORIGINAL_RECEIPTS_PRESERVED':'PASS_LOCAL_FRESH_QUOTA_EVIDENCE_COMPOSED',quota,capacity,intentPath,observedAt:input.observedAt,commandsUpper:80000,observedRounded:built.quota.commandsUsedObserved,totalRolloutEnvelope:493500,remainingCommands:6500,setupReservedCommands:3500,originalInitIntentUnchanged:true,networkRequests:0,redisCommands:0,privateProfilesRead:0,cloudWrites:0,productionPublished:false,cronActivated:false,payments:0};
}

export function buildNativeDrainAttestation({reportRaw,intentRaw,drainRaw,capacityRaw,approvedHashes,plan},now=Date.now()){
 if(!approvedHashes||Object.keys(approvedHashes).sort().join(',')!=='capacityReceiptSha256,drainReceiptSha256,initIntentSha256,rawEvidenceSha256'||Object.values(approvedHashes).some(v=>!hex(v))||sha(reportRaw)!==approvedHashes.rawEvidenceSha256||sha(intentRaw)!==approvedHashes.initIntentSha256||sha(drainRaw)!==approvedHashes.drainReceiptSha256||sha(capacityRaw)!==approvedHashes.capacityReceiptSha256)fail('EXACT_REAL_INIT_AND_DRAIN_HASHES_REQUIRED');
 const report=JSON.parse(reportRaw),intent=JSON.parse(intentRaw),drain=JSON.parse(drainRaw),capacity=JSON.parse(capacityRaw),started=Date.parse(intent.at),ended=Date.parse(report.observedAt);
 if(intent.version!==1||intent.planHash!==plan.planHash||intent.reviewHash!==plan.reviewHash||intent.maximumWrites!==1||intent.drainReceiptSha256!==approvedHashes.drainReceiptSha256||intent.capacityReceiptSha256!==approvedHashes.capacityReceiptSha256||!Number.isFinite(started)||!Number.isFinite(ended)||started>ended||ended>now||report.recoveredReadOnly!==true&&ended-started>150000)fail('EXACT_VALIDATED_INIT_INTENT_REQUIRED');
 validateProductionStorageReadiness(plan,{approvedPlanHash:plan.planHash,approvedReviewHash:plan.reviewHash,drainReceiptSha256:approvedHashes.drainReceiptSha256,capacityReceiptSha256:approvedHashes.capacityReceiptSha256},drain,capacity,started);
 if(drain.drainedForSeconds<305)fail('ACTUAL_PROVIDER_TIMEOUT300_REQUIRES_305S_DRAIN');
 if(report.status!=='PASS_PRODUCTION_STORAGE_INITIALIZED'||report.planHash!==plan.planHash||report.reviewHash!==plan.reviewHash||report.sourceDigest!==plan.sourceDigest||report.namespaceFingerprint!==plan.namespaceFingerprint||report.maximumBytes!==200000000||report.technicalReserveBytes!==20000000||report.mutatedKeys!==1&&report.recoveredReadOnly!==true||report.unknownKeysScanned!==0||report.ttlOperations!==0||report.contentOrPaymentControlsChanged!==false||report.commandLedgerReset!==false||report.oldWriterDrainStillRequiredUntilNewRuntimeActive!==true||report.productionPublished!==false||report.cronActivated!==false||report.payments!==0||report.secretValuesReturned!==0||report.ownerIdsReturned!==0)fail('CONFIRMED_ORIGINAL_NATIVE_INIT_REPORT_REQUIRED');
 if(report.legacyWritersDrained!==undefined&&report.legacyWritersDrained!==true)fail('CONFLICTING_DRAIN_ATTESTATION');
 const attestation={version:1,status:'PASS_REAL_INIT_DRAIN_ATTESTATION_COMPOSED',observedAt:new Date(now).toISOString(),initializerReportedAt:report.observedAt,initializerStartedAt:intent.at,planHash:plan.planHash,reviewHash:plan.reviewHash,sourceDigest:plan.sourceDigest,rawEvidenceSha256:approvedHashes.rawEvidenceSha256,initIntentSha256:approvedHashes.initIntentSha256,drainReceiptSha256:approvedHashes.drainReceiptSha256,capacityReceiptSha256:approvedHashes.capacityReceiptSha256,legacyWritersDrained:true,minimumActualSafeDrainedSeconds:305,actualDrainedSeconds:drain.drainedForSeconds,proofBasis:'Actual initialization report plus exact saved original intent and both validated receipts; receipt was fresh when initialization began; old provider build timeout300 requires at least305 seconds',frozenSourceOrPinsChanged:false,networkRequests:0,redisCommands:0,privateProfilesRead:0,cloudWrites:0,payments:0};
 return {attestation,aggregate:{...report,legacyWritersDrained:true,legacyWriterDrainAttestation:attestation}};
}

export async function attestNativeEvidence(approvedHashes,root=process.cwd(),deps={}){
 root=resolve(root);const plan=await (deps.plan??productionStoragePlan)(root),reportRaw=await raw(root,COMPOSITION_PATHS.native),intentRaw=await raw(root,COMPOSITION_PATHS.init),drainRaw=await raw(root,COMPOSITION_PATHS.drain),capacityRaw=await raw(root,COMPOSITION_PATHS.capacity),now=deps.now?.()??Date.now();
 const built=buildNativeDrainAttestation({reportRaw,intentRaw,drainRaw,capacityRaw,approvedHashes,plan},now),existing=await raw(root,COMPOSITION_PATHS.attestation,true);
 if(existing!==null){const old=JSON.parse(existing);if(old.rawEvidenceSha256!==approvedHashes.rawEvidenceSha256||old.drainReceiptSha256!==approvedHashes.drainReceiptSha256||old.initIntentSha256!==approvedHashes.initIntentSha256)fail('EXISTING_ATTESTATION_REQUIRES_OPERATOR_REVIEW');}
 else await exclusive(root,COMPOSITION_PATHS.attestation,encode(built.attestation));
 const aggregate=await preserveAndReplace(root,COMPOSITION_PATHS.native,reportRaw,encode(built.aggregate));
 return {status:'PASS_LOCAL_NATIVE_DRAIN_AGGREGATE_COMPOSED',aggregate,attestationPath:COMPOSITION_PATHS.attestation,legacyWritersDrained:true,setupReservedCommands:3500,networkRequests:0,redisCommands:0,privateProfilesRead:0,cloudWrites:0,productionPublished:false,cronActivated:false,payments:0};
}

async function packet(){let size=0,parts=[];for await(const b of process.stdin){size+=b.length;if(size>16384)fail('BOUNDED_PUBLIC_METADATA_INPUT_REQUIRED');parts.push(b);}return JSON.parse(Buffer.concat(parts).toString());}
export function compositionCheck(){return {status:'PREPARED_LOCAL_PRODUCTION_V3_PROOF_COMPOSITION',paths:COMPOSITION_PATHS,actualObservedAtMustBeSupplied:true,previousSnapshotsPreservedExactly:true,conservativePriorUpper:80000,observedRounded32000:true,previewCommandReservationSnapshot:26808,additionalConservativeAllowance:1000,appCommands:360000,sharedMargin:50000,setupCommands:3500,totalEnvelope:493500,remainingCommands:6500,initIsNotExecuted:true,ledgerReset:false,frozenSourceOrPinsChanged:false,networkRequests:0,redisCommands:0,privateProfilesRead:0,cloudWrites:0,payments:0};}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{
 if(process.env.VERCEL||process.argv.length!==3)fail('EXPLICIT_LOCAL_COMPOSITION_ONLY');const action=process.argv[2];let report;
 if(action==='check')report=compositionCheck();else if(action==='compose-quota')report=await composeQuotaEvidence(await packet());else if(action==='refresh-quota-only')report=await composeQuotaEvidence(await packet(),process.cwd(),{quotaOnly:true});else if(action==='attest-native')report=await attestNativeEvidence(await packet());else fail('EXACT_LOCAL_COMPOSITION_ACTION_REQUIRED');
 console.log(JSON.stringify(report));
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(e.message??'')?e.message:'LOCAL_EVIDENCE_COMPOSITION_UNCONFIRMED',partialLocalEvidenceWritesPossible:true,recoveryPolicy:'Inspect exact preserved snapshot and composition intent; never reset or rerun initialization',networkRequests:0,redisCommands:0,privateProfilesRead:0,cloudWrites:0,payments:0}));process.exitCode=1;}}
