// One exact, read-only five-command pipeline. Credentials are accepted only
// on private stdin by the reviewed root wrapper and are never serialized.
import {createHash} from 'node:crypto';
import {readFile,lstat,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const family='pilot-0cd860b8cfc35fc459b4838fa9092007',wp='bazaar-workspace:'+family,mp='bazaar-market:'+family;
const origin='https://smooth-dory-323957.upstash.io';
const plan='5d7ef135f78cf9be801d6b7b58bd49eb305749f161eaaf3b18ee527c5d576266',review='9f536603152df78703f01002d7f6c861ea313364d9d781e09d3583e1d1d6c636';
const sources={bazaar:'034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52',provider:'9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232'};
const ids={bazaar:'dpl_14sk88QGZ9A7UfatU2uQ2i95rYai',provider:'dpl_59zNf8MCvktnzTgci3eppUriS2Un'};
const caps={public:115000,authenticated:90000,recovery:105000,background:50000};
const config='cffe2b85e9f007d5bbfefcd78178a726868b694494e8860d9120f54560fec405';
const sha=v=>createHash('sha256').update(v).digest('hex'),fail=c=>{throw Error(c);},int=v=>Number.isSafeInteger(v)&&v>=0;
export const PRODUCTION_CAPACITY_READ_PATH='docs/evidence/on-demand-v3-production-capacity-after-bootstrap-read-2026-10-12.json';
export const PRODUCTION_CAPACITY_READ_COMMANDS=Object.freeze([
 ['TIME'],['GET',`${wp}:{${family}}:continuous-free-budget:v1`],['GET',`${wp}:{${family}}:continuous-free-storage:v1`],['GET',`${wp}:{${family}}:maintenance`],['GET',mp+':maintenance-index:v1'],
]);
export function capacityReadPlan(){return {status:'PREPARED_READ_ONLY_PRODUCTION_CAPACITY_NOT_EXECUTED',planHash:plan,reviewHash:review,sourceDigests:sources,expectedConfigurationId:config,knownKeys:4,commands:['TIME','GET','GET','GET','GET'],plannedRedisCommands:5,plannedRestRequests:1,maximumResponseBytes:3000000,deleteOperations:0,ttlOperations:0,scanOperations:0,evalOperations:0,redisWrites:0,newPayments:0,providerExecutions:0,evidence:PRODUCTION_CAPACITY_READ_PATH,networkRequests:0,secretValuesReturned:0};}
export function validateCapacityReadReceipts(receipts){
 for(const kind of ['bazaar','provider']){const r=receipts[kind];if(r?.status!=='CANONICAL_ON_DEMAND_PRODUCTION_READY_ACCEPTANCE_PENDING'||r.planHash!==plan||r.reviewHash!==review||r.sourceDigest!==sources[kind]||r.deploymentId!==ids[kind]||r.readyState!=='READY'||r.target!=='production'||r.generalPurchasesEnabled!==false||r.newPayments!==0)fail('EXACT_READY_RESTRICTED_SOURCE_RECEIPTS_REQUIRED');}
 return true;
}
function array(v){if(Array.isArray(v))return v;if(v&&typeof v==='object'&&Object.keys(v).length===0)return [];fail('BOUNDED_LEDGER_ARRAY_REQUIRED');}
function json(raw,bound,code){if(typeof raw!=='string'||Buffer.byteLength(raw)>bound)fail(code);try{return JSON.parse(raw);}catch{fail(code);}}
/** Pure aggregate validation: never return operation IDs, principals,
 * per-entry hashes, registry revisions, credentials or stored content. */
export function summarizeCapacityPipeline(envelopes,observedAt=new Date().toISOString()){
 if(!Array.isArray(envelopes)||envelopes.length!==5||envelopes.some(v=>!v||v.error||!Object.hasOwn(v,'result')))fail('EXACT_READ_ONLY_PIPELINE_RESPONSE_REQUIRED');
 const time=envelopes[0].result;if(!Array.isArray(time)||time.length!==2||time.some(v=>typeof v!=='string'||!/^\d+$/.test(v))||!int(Number(time[0]))||!int(Number(time[1]))||Number(time[1])>=1000000)fail('REDIS_CLOCK_UNCONFIRMED');
 const now=Number(time[0])*1000+Math.floor(Number(time[1])/1000);if(!int(now))fail('REDIS_CLOCK_UNCONFIRMED');
 const b=json(envelopes[1].result,262144,'EXISTING_CONTINUOUS_360K_LEDGER_REQUIRED');
 if(b.version!==2||b.configuration!==config||!int(b.last)||b.last>now)fail('EXISTING_CONTINUOUS_360K_LEDGER_REQUIRED');
 const buckets=array(b.buckets),held=array(b.held);if(buckets.length>32||held.length>128)fail('BOUNDED_CONTINUOUS_LEDGER_REQUIRED');
 const oldest=Math.floor((now-31*86400000)/86400000),today=Math.floor(now/86400000),used={public:0,authenticated:0,recovery:0,background:0};let previous=-1,transfer=0,expiredBuckets=0;
 for(const row of buckets){if(!row||!int(row.day)||row.day<=previous||row.day>today||!int(row.bytes)||!row.used||Object.keys(caps).some(k=>!int(row.used[k])))fail('VALID_ROLLING_BUCKETS_REQUIRED');previous=row.day;if(row.day>=oldest){transfer+=row.bytes;for(const k of Object.keys(caps))used[k]+=row.used[k];}else expiredBuckets++;}
 const seen=new Set();let heldTransfer=0,heldRecovery=0,heldBackground=0;
 for(const h of held){if(!h||!/^[-a-f0-9]{36}$/.test(h.operationId??'')||seen.has(h.operationId)||!/^[a-f0-9]{64}$/.test(h.principalHash??'')||!int(h.recoveryCommands)||!int(h.backgroundCommands)||!int(h.transferBytes))fail('VALID_NONEXPIRING_PENDING_HOLDS_REQUIRED');seen.add(h.operationId);heldRecovery+=h.recoveryCommands;heldBackground+=h.backgroundCommands;heldTransfer+=h.transferBytes;}
 used.recovery+=heldRecovery;used.background+=heldBackground;transfer+=heldTransfer;
 if(!int(transfer)||transfer>8000000000||Object.keys(caps).some(k=>!int(used[k])||used[k]>caps[k]))fail('CAPACITY_LEDGER_EXCEEDS_APPROVED_CAPS');
 const storageRaw=envelopes[2].result,storage=json(storageRaw,2000000,'EXISTING_INITIALIZED_STORAGE_LEDGER_REQUIRED');
 if(storage.version!==1||storage.scope!==family||storage.initialized!==true||!storage.entries||Array.isArray(storage.entries)||typeof storage.entries!=='object')fail('EXISTING_INITIALIZED_STORAGE_LEDGER_REQUIRED');
 let nativeBytes=0,reservedBytes=0;for(const [key,v] of Object.entries(storage.entries)){if(!/^[a-f0-9]{64}$/.test(key)||!v||!int(v.bytes)||!int(v.reserved))fail('VALID_AGGREGATE_STORAGE_ENTRIES_REQUIRED');nativeBytes+=v.bytes;reservedBytes+=v.reserved;}
 const storageUsed=nativeBytes+reservedBytes+Buffer.byteLength(storageRaw)+10000000;if(!int(storageUsed)||storageUsed>200000000)fail('STORAGE_LEDGER_EXCEEDS_GLOBAL_CAP');
 let workspaceIndexPresent=envelopes[3].result!==null,workspaceIndexInitialized=false,workspaceDue=null,marketIndexPresent=envelopes[4].result!==null,marketDue=null,operatorAttention=null;
 if(workspaceIndexPresent){const w=json(envelopes[3].result,512,'BOUNDED_WORKSPACE_INDEX_REQUIRED');if(w.version!==1||typeof w.initialized!=='boolean'||!/^[-a-f0-9]{36}$/.test(w.registryRevision??'')||w.nextExpiryAt!==null&&!int(w.nextExpiryAt))fail('BOUNDED_WORKSPACE_INDEX_REQUIRED');workspaceIndexInitialized=w.initialized;workspaceDue=w.nextExpiryAt!==null&&w.nextExpiryAt<=now;}
 if(marketIndexPresent){const m=json(envelopes[4].result,512,'BOUNDED_MARKET_INDEX_REQUIRED');if(m.version!==1||typeof m.reconciliationDue!=='boolean'||typeof m.deliveryDue!=='boolean'||m.nextExpiryAt!==null&&(typeof m.nextExpiryAt!=='string'||!Number.isFinite(Date.parse(m.nextExpiryAt)))||m.operatorAttention!==undefined&&typeof m.operatorAttention!=='boolean')fail('BOUNDED_MARKET_INDEX_REQUIRED');marketDue=m.reconciliationDue||m.deliveryDue||m.nextExpiryAt!==null&&Date.parse(m.nextExpiryAt)<=now;operatorAttention=!!m.operatorAttention;}
 const remaining=Object.fromEntries(Object.keys(caps).map(k=>[k,caps[k]-used[k]]));
 // Conservative full new-buyer flow plus durable 12k/4k holds and hourly idle.
 // The 4.671 GB transfer peak is a logical reservation, never billed traffic.
 const acceptanceRequired={public:3044,authenticated:1932,recovery:17376,background:18916,transferBytes:4671596288,storageHeadroomBytes:1048576};
 const transferRemaining=8000000000-transfer,storageRemaining=200000000-storageUsed;
 const sufficient=held.length===0&&Object.keys(caps).every(k=>remaining[k]>=acceptanceRequired[k])&&transferRemaining>=acceptanceRequired.transferBytes&&storageRemaining>=acceptanceRequired.storageHeadroomBytes;
 return {version:1,status:'PASS_READ_ONLY_PRODUCTION_CAPACITY',observedAt,redisObservedAt:new Date(now).toISOString(),planHash:plan,reviewHash:review,sourceDigests:sources,configurationId:config,limits:caps,usedReservations:used,remainingReservations:remaining,transferReservedBytes:transfer,transferRemainingBytes:transferRemaining,transferLimitBytes:8000000000,pendingHeldOperations:held.length,heldTransferBytes:heldTransfer,heldRecoveryCommands:heldRecovery,heldBackgroundCommands:heldBackground,expiredBucketsExcludedReadOnly:expiredBuckets,storageNativeBytes:nativeBytes,storageReservedBytes:reservedBytes,storageLedgerBytes:Buffer.byteLength(storageRaw),storageTechnicalBytes:10000000,storageLimitBytes:200000000,storageRemainingBytes:storageRemaining,guardianIndices:{workspaceIndexPresent,workspaceIndexInitialized,workspaceDue,marketIndexPresent,marketDue,operatorAttention,missingIndexIsNotNoWork:!workspaceIndexInitialized||!marketIndexPresent},acceptanceRequiredReservations:acceptanceRequired,conservativeAcceptanceMarginAvailable:sufficient,providerReadinessValidated:false,paidFlowValidated:false,readOnlySnapshotNotCapacityReservation:true,evidenceType:'logical-conservative-reservation-not-physical-transfer-or-provider-invoice',restRequests:1,redisCommands:5,redisWrites:0,ttlOperations:0,scanOperations:0,evalOperations:0,newOrders:0,newPayments:0,providerExecutions:0,credentialValuesReturned:0,ownerIdsReturned:0,operationIdsReturned:0};
}
async function boundedFile(root,path){const info=await lstat(resolve(root,path));if(!info.isFile()||info.isSymbolicLink()||info.size>1000000)fail('PLAIN_BOUNDED_PUBLIC_RECEIPT_REQUIRED');return readFile(resolve(root,path));}
async function responseBytes(response){const reader=response.body?.getReader();if(!reader)fail('PIPELINE_RESPONSE_UNCONFIRMED');let count=0;const chunks=[];try{for(;;){const v=await reader.read();if(v.done)break;count+=v.value.byteLength;if(count>3000000){await reader.cancel();fail('PIPELINE_RESPONSE_BOUND');}chunks.push(v.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}
export async function readProductionCapacity(privateAccess,{root=process.cwd(),fetcher=globalThis.fetch}={}){
 if(privateAccess?.url!==origin||typeof privateAccess.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(privateAccess.token))fail('PRIVATE_ORIGINAL_REDIS_ACCESS_REQUIRED');
 const receipts={};for(const kind of ['bazaar','provider'])receipts[kind]=JSON.parse(await boundedFile(root,'docs/evidence/on-demand-v3-production-'+kind+'-deployment-2026-10-11.json'));validateCapacityReadReceipts(receipts);
 try{await lstat(resolve(root,PRODUCTION_CAPACITY_READ_PATH));fail('EXISTING_READ_EVIDENCE_NO_AUTOMATIC_RETRY');}catch(e){if(e.code!=='ENOENT')throw e;}
 let response;try{response=await fetcher(origin+'/pipeline',{method:'POST',headers:{Authorization:'Bearer '+privateAccess.token,'Content-Type':'application/json'},body:JSON.stringify(PRODUCTION_CAPACITY_READ_COMMANDS),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}finally{privateAccess.token='';}
 if(!response.ok)fail('READ_ONLY_PIPELINE_UNCONFIRMED');const raw=await responseBytes(response),report=summarizeCapacityPipeline(JSON.parse(raw));
 report.receipts=Object.fromEntries(Object.keys(receipts).map(k=>[k,{deploymentId:receipts[k].deploymentId,sourceDigest:receipts[k].sourceDigest}]));
 const f=await open(resolve(root,PRODUCTION_CAPACITY_READ_PATH),'wx',0o600);try{await f.writeFile(JSON.stringify(report,null,2)+'\n');await f.sync();}finally{await f.close();}return {...report,evidence:PRODUCTION_CAPACITY_READ_PATH};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const [action='check',...args]=process.argv.slice(2);if(action==='check'&&!args.length)console.log(JSON.stringify(capacityReadPlan()));else{if(action!=='read'||args.length!==2||args[0]!=='--approved-helper-sha256'||args[1]!==sha(await readFile(process.argv[1])))fail('EXACT_REVIEWED_READ_HELPER_REQUIRED');let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>8192)fail('BOUNDED_PRIVATE_STDIN_REQUIRED');}const packet=JSON.parse(raw);raw='';console.log(JSON.stringify(await readProductionCapacity(packet)));}}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED_PRODUCTION_CAPACITY_READ',code:/^[A-Z0-9_]{3,100}$/.test(e.message??'')?e.message:'PRODUCTION_CAPACITY_READ_UNCONFIRMED',redisWrites:0,newPayments:0,secretValuesReturned:0}));process.exitCode=1;}
