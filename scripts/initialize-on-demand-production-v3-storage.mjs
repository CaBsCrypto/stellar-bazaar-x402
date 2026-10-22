// Local production preparation. Importing never opens a profile or connection.
// The only admitted mutation seeds ONE missing storage ledger; native content,
// command ledgers, payment controls, indices and TTLs are never changed.
import {createHash} from 'node:crypto';
import {readFile,open,lstat} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';

export const PRODUCTION_STORAGE_FAMILY='0cd860b8cfc35fc459b4838fa9092007';
export const PRODUCTION_STORAGE_PATHS=Object.freeze({
 intent:'.vercel/on-demand-production-v3-storage-init-intent.json',
 drain:'.vercel/on-demand-production-v3-writer-drain-receipt.json',
 capacity:'.vercel/on-demand-production-v3-free-capacity-receipt.json',
 evidence:'docs/evidence/on-demand-production-v3-storage-inventory-2026-10-12.json',
 inventoryEvidence:'docs/evidence/on-demand-production-v3-storage-readonly-inventory-2026-10-12.json',
 proposal:'docs/release/continuous-on-demand-v3-production-proposal-2026-10-11.json',
 manifest:'docs/evidence/continuous-on-demand-v2-bazaar-production-source-2026-10-11.json',
 sourceProposal:'docs/release/continuous-on-demand-v2-source-proposal-2026-10-11.json',
});
const family='pilot-'+PRODUCTION_STORAGE_FAMILY,wp='bazaar-workspace:'+family,mp='bazaar-market:'+family,rp='bazaar-review:'+family;
const sourceDigest='034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52';
const sourceDirectory='.vercel/continuous-on-demand-v2-bazaar-production-source';
const oldDeploymentIds={bazaar:'dpl_GoDxiF8tYxB2bbHfs4BfGobia1T8',provider:'dpl_4hJwMXCu25MiRWtXFfQG8CKk3ify'};
const blockedProjectIds=['prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3','prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K'];
const exactV3Caps={public:115000,authenticated:90000,recovery:105000,background:50000};
const exactV3BudgetConfigurationId=createHash('sha256').update(JSON.stringify(exactV3Caps)).digest('hex');
const origins={bazaar:'https://bazaar.browns.studio',provider:'https://ai-video-scriptwriter.vercel.app'};
const maximum={reads:1200,observedBytes:40_000_000,milliseconds:120000,owners:200,services:200};
const sha=x=>createHash('sha256').update(x).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
const fail=code=>{throw Error(code);};
function own(root,path){const out=resolve(root,path),rel=relative(root,out);if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))fail('OWN_PREPARATION_PATH_REQUIRED');return out;}
async function plain(root,path){const out=own(root,path),info=await lstat(out);if(!info.isFile()||info.isSymbolicLink()||info.size>5_000_000)fail('PLAIN_BOUNDED_REVIEW_FILE_REQUIRED');return readFile(out);}
async function json(root,path){return JSON.parse(await plain(root,path));}
async function optional(root,path){try{return await json(root,path);}catch(e){if(e.code!=='ENOENT')throw e;return undefined;}}
async function exclusive(root,path,value){const f=await open(own(root,path),'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}}

export function validateProductionStorageLedger(raw,rows){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>2_000_000)fail('EXISTING_STORAGE_LEDGER_UNCONFIRMED');
 const ledger=JSON.parse(raw),known=new Set(rows.map(r=>sha(r.key)));
 if(ledger.version!==1||ledger.scope!==family||ledger.initialized!==true||!ledger.entries||Array.isArray(ledger.entries)||Object.keys(ledger).sort().join(',')!=='entries,initialized,scope,version'||Object.keys(ledger.entries).some(k=>!known.has(k)))fail('EXISTING_STORAGE_LEDGER_UNCONFIRMED');
 for(const r of rows){const e=ledger.entries[sha(r.key)],bytes=r.expectedRaw===null?0:Buffer.byteLength(r.expectedRaw);if(!e){if(bytes||r.reservedBytes)fail('EXISTING_STORAGE_LEDGER_UNCONFIRMED');continue;}if(Object.keys(e).sort().join(',')!=='bytes,reserved'||e.bytes!==bytes||!Number.isSafeInteger(e.reserved)||e.reserved<r.reservedBytes)fail('EXISTING_STORAGE_LEDGER_UNCONFIRMED');}
 const total=Object.values(ledger.entries).reduce((n,e)=>n+e.bytes+e.reserved,0);if(total+Buffer.byteLength(raw)+10_000_000>200_000_000)fail('EXISTING_STORAGE_CAPACITY_UNCONFIRMED');return true;
}

export async function productionStoragePlan(root=process.cwd()){
 root=resolve(root);const manifestRaw=await plain(root,PRODUCTION_STORAGE_PATHS.manifest),proposalRaw=await plain(root,PRODUCTION_STORAGE_PATHS.proposal),sourceProposalRaw=await plain(root,PRODUCTION_STORAGE_PATHS.sourceProposal);
 const manifest=JSON.parse(manifestRaw),proposal=JSON.parse(proposalRaw),sources=JSON.parse(sourceProposalRaw);
 if(manifest.kind!=='bazaar'||manifest.environment!=='production'||manifest.sourceDigest!==sourceDigest||manifest.sourceDirectory!==sourceDirectory||proposal.sourceProposalSha256!==sha(sourceProposalRaw)||proposal.status!=='PREPARED_NOT_APPLIED'||proposal.generalPurchasesEnabled!==false||proposal.newPayments!==0||proposal.productionPublished!==false||!sources.outputs?.some(s=>s.kind==='bazaar'&&s.environment==='production'&&s.sourceDigest===sourceDigest))fail('EXACT_FROZEN_PRODUCTION_REVIEW_REQUIRED');
 const nativePins=[];for(const path of ['lib/continuous-free-storage.ts','lib/continuous-free-budget.ts','lib/marketplace-capacity.ts','lib/marketplace-store.ts','lib/marketplace-x402-store.ts','lib/workspace-store.ts','lib/provider-self-listing.ts']){
  const frozen=manifest.files.find(v=>v.path===path),current=await plain(root,sourceDirectory+'/'+path);if(!frozen||frozen.bytes!==current.length||frozen.sha256!==sha(current))fail('FROZEN_NATIVE_VALIDATOR_BYTES_REQUIRED');nativePins.push({path,bytes:current.length,sha256:sha(current)});
 }
 const commandCaps=Object.fromEntries(['public','authenticated','recovery','background'].map(k=>[k,proposal.commandBudget?.[k]]));if(canonical(commandCaps)!==canonical(exactV3Caps))fail('EXACT_V3_PRODUCTION_360K_CAPS_REQUIRED');
 // Importing/checking the reviewed V3 controller is local-only and performs
 // neither profile reads nor network calls. It never imports these helpers.
 const controller=await import('../.vercel/on-demand-production-v3-control.mjs'),release=await controller.onDemandProductionV3Plan(root);
 if(release.plan.proposalHash!==sha(proposalRaw)||release.plan.sourcePins.bazaar.sourceDigest!==sourceDigest||canonical(JSON.parse(release.plan.environment.bazaar.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON))!==canonical(commandCaps))fail('MATCHING_REVIEWED_V3_RELEASE_CONTROLLER_REQUIRED');
 const plan={version:3,action:'initialize-original-production-storage-once',releaseController:'.vercel/on-demand-production-v3-control.mjs',releasePlanHash:release.plan.planHash,sourceDirectory,sourceDigest,sourceManifestSha256:sha(manifestRaw),reviewHash:sha(proposalRaw),sourceProposalHash:sha(sourceProposalRaw),namespaceFingerprint:sha(mp),commandCaps,priorConsumptionConservativeFloor:74808,maximumFreshPriorCommands:86500,initializationCommandReserve:3500,oldDeploymentIds,origins,blockedProjectIds,writerDrainPolicy:{allDeploymentEnvironmentsBlocked:true,allIpsBlockedWithoutExceptions:true,minimumDrainedSeconds:60,oldCronDefinitions:{bazaar:[],provider:[]}},maximumReads:maximum.reads,maximumObservedBytes:maximum.observedBytes,maximumSeconds:maximum.milliseconds/1000,maximumGlobalBytes:200_000_000,technicalReserveBytes:20_000_000,providerStorageCeilingBytes:10_000_000,nativePins,paths:PRODUCTION_STORAGE_PATHS,writerDrainRequiredForMutation:true,twoCompleteIdenticalInventoriesRequired:true,mutatedKeysMaximum:1,unknownKeysScanned:0,deleteOperations:0,ttlOperations:0,paymentOrContentChanges:0,commandLedgerReset:false,credentialsCreated:false,cloudWrites:0,productionPublished:false,cronActivated:false,payments:0};
 return {...plan,planHash:sha(canonical(plan))};
}

export function validateProductionStorageReadiness(plan,approval,drain,capacity,now=Date.now()){
 if(approval?.approvedPlanHash!==plan.planHash||approval.approvedReviewHash!==plan.reviewHash||!hex(approval.drainReceiptSha256)||!hex(approval.capacityReceiptSha256))fail('NEW_JOINT_STORAGE_REVIEW_REQUIRED');
 if(!drain||drain.version!==1||drain.status!=='CONFIRMED_OLD_PRODUCTION_WRITERS_DRAINED'||drain.namespaceFamily!==PRODUCTION_STORAGE_FAMILY||canonical(drain.oldDeploymentIds)!==canonical(oldDeploymentIds)||canonical(drain.origins)!==canonical(origins)||!['allMethodsAllRoutesBlocked','canonicalAndImmutableDeploymentHostsBlocked','pendingInvocationsDrained','schedulesAbsent','writesPausedUntilGuardedSourceActive'].every(k=>drain[k]===true)||!hex(drain.firewallConfigurationFingerprint)||!Number.isFinite(Date.parse(drain.observedAt))||!Number.isFinite(Date.parse(drain.expiresAt))||Date.parse(drain.observedAt)>now||now-Date.parse(drain.observedAt)>900000||Date.parse(drain.expiresAt)<=now)fail('FRESH_ALL_ROUTE_WRITER_DRAIN_REQUIRED');
 if(drain.allDeploymentEnvironmentsBlocked!==true||drain.allIpsBlockedWithoutExceptions!==true||!Array.isArray(drain.blockedProjectIds)||canonical(drain.blockedProjectIds.slice().sort())!==canonical(blockedProjectIds.slice().sort())||canonical(drain.oldCronDefinitions)!==canonical({bazaar:[],provider:[]})||!Number.isFinite(Date.parse(drain.blockedAt))||Date.parse(drain.observedAt)-Date.parse(drain.blockedAt)<60000||!Number.isSafeInteger(drain.drainedForSeconds)||drain.drainedForSeconds<60||drain.drainedForSeconds>Math.floor((Date.parse(drain.observedAt)-Date.parse(drain.blockedAt))/1000)||!drain.drainRuleFingerprints||Object.keys(drain.drainRuleFingerprints).sort().join(',')!=='bazaar,provider'||!hex(drain.drainRuleFingerprints.bazaar)||!hex(drain.drainRuleFingerprints.provider)||Date.parse(drain.expiresAt)>Date.parse(drain.observedAt)+900000)fail('ALL_PROJECT_ENVIRONMENTS_AND_IPS_60S_DRAIN_REQUIRED');
 const caps=capacity?.commandCaps,total=caps&&Object.values(caps).reduce((n,v)=>n+v,0);
 if(!capacity||capacity.version!==1||capacity.status!=='CONFIRMED_FREE_CAPACITY_FOR_PRODUCTION'||capacity.upstashPlan!=='Free'||capacity.monthlyCommandLimit!==500000||capacity.sharedAndDeniedMargin!==50000||!Number.isSafeInteger(capacity.commandsUsed)||capacity.commandsUsed<74808||!Number.isSafeInteger(capacity.commandsUsedObserved)||capacity.commandsUsedObserved<0||capacity.commandsUsedObserved>capacity.commandsUsed||canonical(capacity.priorConsumptionEvidence)!==canonical({historicalHighest:47000,previewCommandReservations:27808,conservativeFloor:74808})||!caps||Object.keys(caps).sort().join(',')!=='authenticated,background,public,recovery'||canonical(caps)!==canonical(plan.commandCaps)||Object.values(caps).some(n=>!Number.isSafeInteger(n)||n<1)||total>360000||capacity.applicationCommandBudget!==total||capacity.commandsUsed+total+capacity.sharedAndDeniedMargin+plan.initializationCommandReserve>500000||!Number.isFinite(Date.parse(capacity.observedAt))||Date.parse(capacity.observedAt)>now||now-Date.parse(capacity.observedAt)>600000)fail('FRESH_CONSERVATIVE_V3_FREE_CAPACITY_REQUIRED');
 return true;
}

async function nativeValidators(root,plan){
 const base=pathToFileURL(resolve(root,plan.sourceDirectory)+sep).href,hook=registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND'||!context.parentURL?.startsWith(base)||!specifier.startsWith('.')||/\.[a-z]+$/i.test(specifier)||!new URL(specifier,context.parentURL).href.startsWith(base))throw e;return next(specifier+'.ts',context);}}});
 try{const [storage,market,workspace,review,types]=await Promise.all(['continuous-free-storage','marketplace-capacity','workspace-store','provider-self-listing','workspace-types'].map(name=>import(new URL('lib/'+name+'.ts',base).href)));return {...storage,...market,...workspace,...review,...types};}finally{hook.deregister();}
}

// Exported dependency boundary enables offline protocol tests. The supplied
// Redis adapter cannot turn an inventory-only action into a mutation.
export async function productionStorageInventory(redis,{action='inventory',initialize,validateNative,now=()=>Date.now()}={}){
 if(!['inventory','initialize','recover'].includes(action))fail('EXACT_STORAGE_ACTION_REQUIRED');
 const deadline=now()+maximum.milliseconds,rows=[],seen=new Set();let reads=0,observedBytes=0;
 const allowed=key=>[wp+':',mp+':',rp+':'].some(p=>key.startsWith(p))&&key.length<=512;
 async function get(key){if(!allowed(key)||++reads>maximum.reads||now()>deadline)fail('PRODUCTION_INVENTORY_BOUND');const raw=await redis.get(key);if(raw!==null&&typeof raw!=='string')fail('STRING_NATIVE_INVENTORY_REQUIRED');observedBytes+=raw===null?0:Buffer.byteLength(raw);if(observedBytes>maximum.observedBytes)fail('PRODUCTION_INVENTORY_BOUND');return raw;}
 async function row(key,reservedBytes=0){if(seen.has(key))fail('DUPLICATE_NATIVE_INVENTORY_KEY');seen.add(key);const raw=await get(key);rows.push({key,expectedRaw:raw,nextRaw:raw,reservedBytes});return raw;}
 const registryKey=wp+`:{${family}}:registry`,registryRaw=await row(registryKey);
 if(registryRaw===null)fail('ORIGINAL_PRODUCTION_REGISTRY_REQUIRED');
 const registry=JSON.parse(registryRaw);
 if(!Array.isArray(registry.workspaces)||registry.workspaces.length>maximum.owners||new Set(registry.workspaces.map(w=>w.ownerId)).size!==registry.workspaces.length)fail('BOUNDED_PRODUCTION_REGISTRY_REQUIRED');
 const marker=await row(wp+`:{${family}}:initialized`);if(marker!=='workspace-v1')fail('ORIGINAL_WORKSPACE_MARKER_REQUIRED');
 await row(wp+`:{${family}}:maintenance`);
 for(const workspace of registry.workspaces){if(!/^ow_[a-f0-9]{32}$/.test(workspace.ownerId))fail('NATIVE_OWNER_REQUIRED');const document=await row(wp+`:{${family}}:owner:${workspace.ownerId}`);if(typeof document!=='string'||Buffer.byteLength(document)!==workspace.documentBytes||Buffer.byteLength(document)>131072)fail('ORIGINAL_OWNER_DOCUMENT_REQUIRED');await row(wp+`:{${family}}:market-permissions:${workspace.ownerId}`);}
 const marketRaw=await row(mp+':state'),settlementRaw=await row(mp+':x402-settlements:state'),reservationRaw=await row(mp+':capacity-reservations:v1');
 const market=marketRaw?JSON.parse(marketRaw).state:{services:[],orders:[]};
 if(!Array.isArray(market.services)||market.services.length>maximum.services||market.services.some(s=>!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.card?.id))||new Set(market.services.map(s=>s.card.id)).size!==market.services.length)fail('BOUNDED_PRODUCTION_MARKET_REQUIRED');
 await row(mp+':maintenance-index:v1');const reviewRaw=await row(rp+':state');
 const catalogKey=mp+':catalog:index';if(++reads>maximum.reads||now()>deadline)fail('PRODUCTION_INVENTORY_BOUND');const ids=await redis.smembers(catalogKey);if(!Array.isArray(ids)||ids.length>maximum.services||new Set(ids).size!==ids.length||ids.some(id=>!market.services.some(s=>s.card.id===id)))fail('KNOWN_CATALOGUE_INVENTORY_REQUIRED');
 // Also read absent/withdrawn cards using permanent service IDs; SMEMBERS alone
 // would miss an orphan mirror left by an interrupted old catalogue write.
 for(const service of market.services)await row(mp+':catalog:card:'+service.card.id);
 if(await row(wp+':technical-reservation:v1',10_000_000)!==null)fail('TECHNICAL_RESERVATION_KEY_MUST_REMAIN_VIRTUAL');
 if(!validateNative)fail('NATIVE_VALIDATOR_REQUIRED');
 const projection=await validateNative({rows,registry,registryRaw,marker,marketRaw,settlementRaw,reservationRaw,reviewRaw});
 if(!projection||!Number.isSafeInteger(projection.marketRemaining)||!Number.isSafeInteger(projection.settlementRemaining)||projection.marketRemaining<0||projection.settlementRemaining<0)fail('NATIVE_CAPACITY_PROJECTION_REQUIRED');
 rows.find(r=>r.key===mp+':state').reservedBytes=projection.marketRemaining;
 rows.find(r=>r.key===mp+':x402-settlements:state').reservedBytes=projection.settlementRemaining;
 // The capacity sidecar can grow on the first guarded new-runtime commit.
 rows.find(r=>r.key===mp+':capacity-reservations:v1').reservedBytes=Math.max(0,65536-(reservationRaw===null?0:Buffer.byteLength(reservationRaw)));
 const budgetKey=wp+`:{${family}}:continuous-free-budget:v1`,budgetPrior=await get(budgetKey);
 if(budgetPrior!==null){const existing=JSON.parse(budgetPrior);if(Buffer.byteLength(budgetPrior)>262144||existing.version!==2||existing.configuration!==exactV3BudgetConfigurationId||!Array.isArray(existing.buckets)||!Array.isArray(existing.held))fail('EXISTING_COMMAND_LEDGER_INCOMPATIBLE_NO_RESET');}
 const storageKey=wp+`:{${family}}:continuous-free-storage:v1`,prior=await get(storageKey);
 const inventoryHash=sha(canonical(rows.map(r=>({key:sha(r.key),bytes:r.expectedRaw===null?0:Buffer.byteLength(r.expectedRaw),contentHash:r.expectedRaw===null?null:sha(r.expectedRaw),reservedBytes:r.reservedBytes}))));
 // A complete second pass plus the initialization EVAL guard handles both
 // changing snapshots and an acknowledged inventory followed by a race.
 for(const r of rows)if(await get(r.key)!==r.expectedRaw)fail('PRODUCTION_INVENTORY_CHANGED_NO_WRITE');
 if(++reads>maximum.reads||now()>deadline||canonical((await redis.smembers(catalogKey)).slice().sort())!==canonical(ids.slice().sort()))fail('PRODUCTION_CATALOGUE_CHANGED_NO_WRITE');
 if(await get(storageKey)!==prior)fail('PRODUCTION_LEDGER_CHANGED_NO_WRITE');
 if(await get(budgetKey)!==budgetPrior)fail('PRODUCTION_COMMAND_LEDGER_CHANGED_NO_WRITE');
 let initialized=false,recoveredReadOnly=false;
 if(prior!==null){
  validateProductionStorageLedger(prior,rows);recoveredReadOnly=true;
 }else if(action==='recover')fail('INITIALIZATION_UNCONFIRMED_NO_AUTOMATIC_RETRY');
 else if(action==='initialize'){
  // Legacy nonterminal operations need an explicit command-credit migration.
  // We preserve them and stop rather than silently erase their pending state.
  if(projection.pendingOperations!==0)fail('LEGACY_PENDING_OPERATION_BUDGET_REVIEW_REQUIRED');
  if(!initialize)fail('EXPLICIT_NATIVE_INITIALIZER_REQUIRED');await initialize(redis,wp,rows);initialized=true;
  const confirmed=await get(storageKey);validateProductionStorageLedger(confirmed,rows);
 }
 return {version:3,status:action==='inventory'?'PASS_READ_ONLY_PRODUCTION_STORAGE_INVENTORY':'PASS_PRODUCTION_STORAGE_INITIALIZED',observedAt:new Date(now()).toISOString(),namespaceFingerprint:sha(mp),workspaceCount:registry.workspaces.length,nativeKeysInventoried:rows.length,nativeBytesRead:observedBytes,inventoryFingerprint:inventoryHash,reads,maximumBytes:200_000_000,technicalReserveBytes:20_000_000,providerStorageCeilingBytes:10_000_000,futureMarketReservedBytes:projection.marketRemaining,futureSettlementReservedBytes:projection.settlementRemaining,pendingOperations:projection.pendingOperations,budgetConfigurationId:exactV3BudgetConfigurationId,budgetLedgerState:budgetPrior===null?'absent':'matching-v3-preserved',initialized,recoveredReadOnly,mutatedKeys:initialized?1:0,unknownKeysScanned:0,ttlOperations:0,contentOrPaymentControlsChanged:false,commandLedgerReset:false,oldWriterDrainStillRequiredUntilNewRuntimeActive:true,productionPublished:false,cronActivated:false,payments:0,secretValuesReturned:0,ownerIdsReturned:0};
}

export async function validateCapturedNative(v,native){
 const snapshots=new Map(v.rows.map(r=>[r.key,r.expectedRaw]));
 const noWrites=new native.WorkspaceError('READ_ONLY_OWNER_VALIDATION_COMPLETE');
 const local={get:async key=>snapshots.get(key)??null,eval:async(script,keys)=>{if(script===native.READ_WORKSPACE_LUA||script===native.READ_MARKET_PERMISSION_LUA)return keys.map(k=>snapshots.get(k)??'');throw noWrites;}};
 const store=native.createRedisWorkspaceStore(local,wp,()=>({ownerIds:[],hashes:[]}));await store.activeOwnerIds(v.registry.workspaces.map(w=>w.ownerId));
 for(const owner of v.registry.workspaces){
  // Native validation runs against captured RAM only. This dry-run rejects the
  // commit after validating even revoked documents; no network EVAL is called.
  try{await store.pruneExpiredContent(owner.ownerId,Date.now());}catch(e){if(e!==noWrites)throw e;}
  const permissionRaw=snapshots.get(wp+`:{${family}}:market-permissions:${owner.ownerId}`);
  if(!owner.revoked){await store.readMarketPermissionSnapshot({ownerId:owner.ownerId,workspaceId:owner.workspaceId,agentId:owner.agentId,generation:owner.generation,role:'human'});}else if(permissionRaw!==null){const p=JSON.parse(permissionRaw);if(Buffer.byteLength(permissionRaw)>4096||p.version!==1||p.ownerId!==owner.ownerId||p.agentId!==owner.agentId||!Number.isSafeInteger(p.generation)||p.generation>owner.generation)fail('REVOKED_PERMISSION_BINDING_UNCONFIRMED');}
 }
 if(v.reviewRaw!==null){const e=JSON.parse(v.reviewRaw);if(Buffer.byteLength(v.reviewRaw)>1048576||e.version!==1||!(/^[a-f0-9-]{36}$/.test(e.revision))||Object.keys(e).sort().join(',')!=='revision,state,version')fail('NATIVE_REVIEW_ENVELOPE_REQUIRED');native.validateReviewState(e.state);}
 const previous=process.env.BAZAAR_FREE_DEMO_MODE;process.env.BAZAAR_FREE_DEMO_MODE='continuous';
 try{const p=native.projectCapacity(v.marketRaw,v.settlementRaw,v.reservationRaw),market=v.marketRaw?JSON.parse(v.marketRaw).state:{orders:[]};return {...p,pendingOperations:market.orders.filter(o=>!['delivered','delivery-failed'].includes(o.phase)).length};}finally{previous===undefined?delete process.env.BAZAAR_FREE_DEMO_MODE:process.env.BAZAAR_FREE_DEMO_MODE=previous;}
}

async function privatePacket(){let size=0,chunks=[];for await(const b of process.stdin){size+=b.length;if(size>65536)fail('PRIVATE_INPUT_BOUND');chunks.push(b);}const bytes=Buffer.concat(chunks);try{const value=JSON.parse(bytes.toString());if(Object.keys(value).sort().join(',')!=='token,url'||value.url!=='https://smooth-dory-323957.upstash.io'||typeof value.token!=='string'||!/^[\x21-\x7e]{20,4096}$/.test(value.token))fail('EXACT_EXISTING_PRIMARY_PROFILE_REQUIRED');return value;}finally{bytes.fill(0);chunks.forEach(b=>b.fill(0));}}

export async function productionStorageControl(action='check',approval={},root=process.cwd(),deps={}){
 root=resolve(root);const plan=await (deps.plan??productionStoragePlan)(root);
 if(action==='check')return {status:'PREPARED_PRODUCTION_STORAGE_NOT_APPLIED',...plan,privateProfilesRead:0,networkRequests:0};
 if(!['inventory','initialize','recover'].includes(action)||process.env.VERCEL)fail('EXPLICIT_LOCAL_PRODUCTION_STORAGE_ACTION_REQUIRED');
 if(approval.approvedPlanHash!==plan.planHash||approval.approvedReviewHash!==plan.reviewHash)fail('EXACT_REVIEWED_STORAGE_HELPER_REQUIRED');
 if(action!=='inventory'){
  const drainRaw=await plain(root,PRODUCTION_STORAGE_PATHS.drain),capacityRaw=await plain(root,PRODUCTION_STORAGE_PATHS.capacity);
  if(sha(drainRaw)!==approval.drainReceiptSha256||sha(capacityRaw)!==approval.capacityReceiptSha256)fail('EXACT_DRAIN_AND_CAPACITY_RECEIPTS_REQUIRED');
  validateProductionStorageReadiness(plan,approval,JSON.parse(drainRaw),JSON.parse(capacityRaw));
 }
 const native=await (deps.native??nativeValidators)(root,plan),redis=deps.redis??new (await import('@upstash/redis')).Redis({...await privatePacket(),automaticDeserialization:false,retry:false,enableAutoPipelining:false});
 if(action==='initialize'){
  if(await optional(root,PRODUCTION_STORAGE_PATHS.intent))fail('EXISTING_INIT_INTENT_REQUIRES_READ_ONLY_RECOVERY');
  await exclusive(root,PRODUCTION_STORAGE_PATHS.intent,{version:1,planHash:plan.planHash,reviewHash:plan.reviewHash,drainReceiptSha256:approval.drainReceiptSha256,capacityReceiptSha256:approval.capacityReceiptSha256,at:new Date().toISOString(),maximumWrites:1});
 }else if(action==='recover'){const intent=await json(root,PRODUCTION_STORAGE_PATHS.intent);if(intent.planHash!==plan.planHash||intent.reviewHash!==plan.reviewHash)fail('EXACT_ORIGINAL_INIT_INTENT_REQUIRED');}
 const report=await productionStorageInventory(redis,{action,initialize:native.initializeContinuousStorageLedger,validateNative:v=>validateCapturedNative(v,native)});
 const result={...report,planHash:plan.planHash,reviewHash:plan.reviewHash,sourceDigest:plan.sourceDigest};
 const path=action==='inventory'?PRODUCTION_STORAGE_PATHS.inventoryEvidence:PRODUCTION_STORAGE_PATHS.evidence,old=await optional(root,path);
 if(old){if(action!=='recover'||old.inventoryFingerprint!==report.inventoryFingerprint||old.planHash!==plan.planHash)fail('EXISTING_EVIDENCE_REQUIRES_OPERATOR_REVIEW');}else await exclusive(root,path,result);
 return result;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{
 const [action='check',flag1,approvedPlanHash,flag2,approvedReviewHash,flag3,drainReceiptSha256,flag4,capacityReceiptSha256]=process.argv.slice(2);
 if(action==='check'){if(process.argv.length!==3)fail('CHECK_HAS_NO_PRIVATE_ARGUMENTS');}
 else if(!['inventory','initialize','recover'].includes(action)||flag1!=='--approved-plan'||flag2!=='--approved-review'||!hex(approvedPlanHash)||!hex(approvedReviewHash)||(action==='inventory'?process.argv.length!==7:process.argv.length!==11||flag3!=='--drain-receipt'||flag4!=='--capacity-receipt'||!hex(drainReceiptSha256)||!hex(capacityReceiptSha256)))fail('EXACT_REVIEWED_STORAGE_ARGUMENTS_REQUIRED');
 console.log(JSON.stringify(await productionStorageControl(action,{approvedPlanHash,approvedReviewHash,drainReceiptSha256,capacityReceiptSha256})));
}catch(e){console.log(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(e.code??e.message??'')?e.code??e.message:'PRODUCTION_STORAGE_UNCONFIRMED',mutationUnconfirmed:true,retryPolicy:'Read existing original intent and ledger; never reseed automatically',productionPublished:false,cronActivated:false,payments:0,secretValuesReturned:0,ownerIdsReturned:0}));process.exitCode=1;}}
