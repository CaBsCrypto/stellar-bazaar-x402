import {createHash,randomUUID} from 'node:crypto';
import {assertNewId} from './store.mjs';
import {TREASURY,PROFILE} from '../policy-router/fee-split-policy-v1.mjs';
import {SPLIT_COST_BOUND,SPLIT_STAGE_BOUNDS} from './cost-bound.mjs';
import {createSplitStageAccounting,makeStageRecord,parseStageRecord,stageAccountingKey,STAGE_ACCOUNTING_VERSION,STAGE_RECIPE_DIGEST,STAGE_ACCOUNTING_VERSION_V2,stageProfile,consumeAcceptedStageReceipt} from './stage-accounting.mjs';
export {SPLIT_COST_BOUND} from './cost-bound.mjs';
import {lifecycleCertificateKey,validateLifecycleCertificate,lifecycleCertificateGuardPrelude,validateTerminalTransition,terminalBudgetPrelude} from './lifecycle-budget-v2.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const owner=/^ow_[a-f0-9]{32}$/;
export const SPLIT_WINDOW_MS=31*86400000;
/** Conservative offline envelope, NOT a provider usage measurement. A fresh
 * native checkpoint must bind this digest and the deployed source before use.
 * Full lifecycle, recovery and maintenance are prepaid; no unproven refunds. */
export const SPLIT_COST_DIGEST=sha(JSON.stringify(SPLIT_COST_BOUND));
export function splitServiceCardHash({serviceId,sourceServiceId,sourceCardHash,provider}){return sha(JSON.stringify({version:'bazaar.split-service/v1',profile:PROFILE,serviceId,sourceServiceId,sourceCardHash,provider,treasury:TREASURY,feeBps:150,grossAtomic:'100000',netAtomic:'98500'}));}
export function splitLedgerKey(prefix){need(/^bazaar-market:pilot-[a-f0-9]{32}$/.test(prefix),'NATIVE_SPLIT_NAMESPACE_INVALID');return prefix+':split:v1:admission';}
export function parseSplitLedger(raw){
 if(raw===null||raw===undefined)return {version:1,revision:null,sellers:[],operations:[]};
 need(typeof raw==='string'&&Buffer.byteLength(raw)<=262144,'NATIVE_SPLIT_LEDGER_INVALID');
 let v;try{v=JSON.parse(raw);}catch{throw Error('NATIVE_SPLIT_LEDGER_INVALID');}
 need(v?.version===1&&typeof v.revision==='string'&&Array.isArray(v.sellers)&&v.sellers.length<=32&&Array.isArray(v.operations)&&v.operations.length<=128,'NATIVE_SPLIT_LEDGER_INVALID');
 const ids=new Set(),services=new Set();
 for(const s of v.sellers){need(owner.test(s.ownerId)&&owner.test(s.treasuryOwnerId)&&s.ownerId!==s.treasuryOwnerId&&Number.isSafeInteger(s.generation)&&s.generation>0&&typeof s.agentId==='string'&&typeof s.workspaceId==='string'&&typeof s.serviceId==='string'&&s.serviceId.length<=100&&/^[a-f0-9]{64}$/.test(s.cardHash)&&/^[a-f0-9]{64}$/.test(s.sourceCardHash)&&typeof s.sourceServiceId==='string'&&s.treasury===TREASURY&&s.feeBps===150&&s.grossAtomic==='100000'&&s.netAtomic==='98500'&&Number.isSafeInteger(s.acceptedAt)&&Number.isSafeInteger(s.leaseExpiresAt)&&s.leaseExpiresAt>=s.acceptedAt&&s.leaseExpiresAt-s.acceptedAt<=360000&&!services.has(s.serviceId),'NATIVE_SPLIT_LEDGER_INVALID');services.add(s.serviceId);}
 for(const o of v.operations){assertNewId(o.operationId);need(!ids.has(o.operationId)&&owner.test(o.buyerOwnerId)&&owner.test(o.sellerOwnerId)&&typeof o.sourceCardHash==='string'&&typeof o.sourceServiceId==='string'&&typeof o.serviceId==='string'&&Number.isSafeInteger(o.createdAt)&&o.createdAt>=0&&['awaiting-payment','payment-submitting','payment-uncertain','paid','delivered','delivery-failed'].includes(o.phase),'NATIVE_SPLIT_LEDGER_INVALID');ids.add(o.operationId);}
 return v;
}
function guards(...all){const map=new Map();for(const g of all){need(g&&Array.isArray(g.keys)&&g.keys.length===g.values?.length,'NATIVE_SPLIT_SNAPSHOT_REQUIRED');g.keys.forEach((k,i)=>{need(typeof k==='string'&&k.length<=256&&(g.values[i]===null||typeof g.values[i]==='string'&&Buffer.byteLength(g.values[i])<=1048576),'NATIVE_SPLIT_SNAPSHOT_REQUIRED');need(!map.has(k)||map.get(k)===g.values[i],'NATIVE_SPLIT_SNAPSHOT_CHANGED');map.set(k,g.values[i]);});}need(map.size>0&&map.size<=8,'NATIVE_SPLIT_SNAPSHOT_CAPACITY');return {keys:[...map.keys()],values:[...map.values()]};}
function principal(p,write=false){need(p&&owner.test(p.ownerId)&&(write?p.role==='agent':['human','agent'].includes(p.role))&&Number.isSafeInteger(p.generation)&&p.generation>0&&typeof p.workspaceId==='string'&&typeof p.agentId==='string','NATIVE_SPLIT_IDENTITY_REQUIRED');}
function active(o){return o.phase!=='delivered';} // A failed delivery is still a paid obligation; no automatic release.
export function legacyAdmissionProjection(raw,buyerOwnerId,sellerOwnerId,now){
 const v=parseSplitLedger(raw);need(Number.isSafeInteger(now)&&now>=0,'NATIVE_SPLIT_CLOCK_INVALID');
 return v.operations.filter(o=>o.buyerOwnerId===buyerOwnerId||o.sellerOwnerId===sellerOwnerId&&active(o)).map(o=>({version:1,operationId:o.operationId,buyerOwnerId:o.buyerOwnerId,sellerOwnerId:o.sellerOwnerId,createdAt:new Date(o.createdAt).toISOString(),cardHash:o.sourceCardHash,serviceId:o.sourceServiceId,phase:o.phase,sellerReservation:{day:new Date(o.createdAt).toISOString().slice(0,10),expiresAt:'9999-12-31T23:59:59.999Z',committed:true}}));
}
/** No network factory or global state. The deployed wrapper supplies native
 * workspace/market/repository snapshots, the same metered Redis client and the
 * actual continuous-budget Lua. Offline tests exercise the identical script. */
export function createNativeSplitAdmission({redis,marketPrefix,workspacePrefix,workspaceSnapshot,marketSnapshot,repositorySnapshot,checkpointSnapshot,treasurySnapshot,sourceDigest,budgetConfiguration,budgetFunctions,storagePlan,now=Date.now,accountingVersion=STAGE_ACCOUNTING_VERSION}={}){
 const selected=stageProfile(accountingVersion);
 const ledgerKey=splitLedgerKey(marketPrefix);
 need(redis&&typeof redis.get==='function'&&typeof redis.eval==='function'&&typeof workspaceSnapshot==='function'&&typeof marketSnapshot==='function'&&typeof repositorySnapshot==='function'&&typeof checkpointSnapshot==='function'&&typeof storagePlan==='function'&&typeof budgetConfiguration==='function'&&typeof budgetFunctions==='string'&&budgetFunctions.includes('local function budget_prepare'),'NATIVE_SPLIT_ADAPTER_REQUIRED');
 const budgetKey=workspacePrefix+':{'+workspacePrefix.split(':')[1]+'}:continuous-free-budget:v1';
 const namespace='bazaar:split:v1:pilot:'+marketPrefix.slice('bazaar-market:pilot-'.length);const accountingStores=new Map();
 const accounting=(version=selected.version)=>{stageProfile(version);if(!accountingStores.has(version))accountingStores.set(version,createSplitStageAccounting({redis,namespace,budgetKey,budgetConfiguration,budgetFunctions,workspaceSnapshot,storagePlan,sourceDigest,now,version}));return accountingStores.get(version);};
 const stageAccounting=Object.freeze({claim:input=>accounting().claim(input),lookup:input=>accounting().lookup(input),inspectTail:input=>accounting().inspectTail(input),assertDispatchTail:input=>accounting().assertDispatchTail(input),financialReady:false});
 async function identity(p){principal(p);const snapshot=await workspaceSnapshot(p);need(snapshot.identity.ownerId===p.ownerId&&snapshot.identity.generation===p.generation&&snapshot.identity.agentId===p.agentId,'NATIVE_SPLIT_IDENTITY_CHANGED');return snapshot;}
 async function ledger(){const raw=await redis.get(ledgerKey);return {raw:raw??null,value:parseSplitLedger(raw)};}
 async function financialCheckpoint(){
  need(/^[a-f0-9]{64}$/.test(sourceDigest??''),'NATIVE_SPLIT_SOURCE_UNBOUND');const cp=await checkpointSnapshot();const at=now();
  need(cp&&Number.isSafeInteger(cp.observedAt)&&cp.observedAt<=at&&at-cp.observedAt<=300000&&Number.isSafeInteger(cp.expiresAt)&&cp.expiresAt>at&&cp.expiresAt-cp.observedAt<=300000,'NATIVE_SPLIT_CHECKPOINT_STALE');
  need(cp.evidence===`bazaar-split-v1:${sourceDigest}:${SPLIT_COST_DIGEST}`,'NATIVE_SPLIT_COST_UNBOUND');
  need(['redisCommands','outboundBytes','inboundBytes'].every(k=>Number.isSafeInteger(cp.remaining?.[k])&&cp.remaining[k]>=0),'NATIVE_SPLIT_CHECKPOINT_INVALID');
  const certificate=cp.costCertificate;need(certificate?.version==='bazaar.split-cost-certificate/v1'&&certificate.mode==='conservative-unmeasured'&&certificate.sourceDigest===sourceDigest&&certificate.costDigest===SPLIT_COST_DIGEST&&Array.isArray(certificate.stages)&&certificate.stages.length===SPLIT_STAGE_BOUNDS.length,'NATIVE_SPLIT_COST_CERTIFICATE_REQUIRED');
  for(const expected of SPLIT_STAGE_BOUNDS){const rows=certificate.stages.filter(s=>s.action===expected.action);need(rows.length===1&&Object.entries(expected).every(([k,v])=>rows[0][k]===v)&&/^[a-f0-9]{64}$/.test(rows[0].evidenceDigest??''),'NATIVE_SPLIT_COST_CERTIFICATE_INVALID');}
  need(cp.remaining.redisCommands>=SPLIT_COST_BOUND.recoveryCommands+SPLIT_COST_BOUND.backgroundCommands&&cp.remaining.outboundBytes>=SPLIT_COST_BOUND.transferBytes+SPLIT_COST_BOUND.safetyBytes&&cp.remaining.inboundBytes>=SPLIT_COST_BOUND.transferBytes+SPLIT_COST_BOUND.safetyBytes,'NATIVE_SPLIT_PHYSICAL_BUDGET_INSUFFICIENT');
  need(typeof treasurySnapshot==='function','NATIVE_SPLIT_TREASURY_BINDING_REQUIRED');const actual=await treasurySnapshot();const treasury=actual?.treasury;
  need(actual?.binding?.ownerId===treasury?.ownerId&&treasury?.ownerId&&owner.test(treasury.ownerId)&&treasury.account===TREASURY&&treasury.ownerRecoveryAcknowledgedAt<=at&&Number.isSafeInteger(treasury.ownerRecoveryAcknowledgedAt)&&treasury.ownerRecoveryAcknowledgedAt>0&&treasury.receiptEligible===true,'TREASURY_RECEIPT_ELIGIBILITY_UNVERIFIED');return {...cp,treasury,guard:guards(cp.guard,actual.guard)};
 }
 async function snapshots(p,next,financial){const id=await identity(p),m=await marketSnapshot();if(financial)need(m.state?.paused!==true,'NATIVE_SPLIT_MARKET_PAUSED');let cp;if(financial)cp=await financialCheckpoint();
  return {id,m,cp,g:guards(id.guard,m.guard,...(cp?[cp.guard]:[]))};}
 async function resolveService(serviceId){const l=await ledger(),s=l.value.sellers.find(s=>s.serviceId===serviceId);need(s&&s.leaseExpiresAt>now(),'NATIVE_SPLIT_CAPACITY_UNAVAILABLE');return {...s,active:true,netAccepted:true,provider:s.provider};}
 async function authorize({principal:p,action,order,request}){if(order)assertNewId(order.operationId);await identity(p);let stageReceipt;
  if(order?.accountingProfile===STAGE_ACCOUNTING_VERSION||order?.accountingProfile===STAGE_ACCOUNTING_VERSION_V2){const stageAction=action==='read-delivery'?'delivery-read':action==='delivery'?'delivery-write':action;stageReceipt=consumeAcceptedStageReceipt(request,{principal:p,operationId:order.operationId,action:stageAction,order,sourceDigest,now});if(action==='settle')await stageAccounting.assertDispatchTail({principal:p,request,operationId:order.operationId,claimId:stageReceipt.claimId});}
  if(['create','challenge','settle'].includes(action))await financialCheckpoint();return {authorized:true,ownerId:p.ownerId,generation:p.generation,expiresAtMs:now()+5000,...(stageReceipt?{stageReceipt}:{})};}
 async function prepareWrite({previous,next,principal:p}){
  assertNewId(next.operationId);need([next.buyerOwnerId,next.sellerOwnerId,next.treasuryOwnerId].every(v=>owner.test(v))&&new Set([next.buyerOwnerId,next.sellerOwnerId,next.treasuryOwnerId]).size===3,'NATIVE_SPLIT_DISTINCT_OWNERS_REQUIRED');principal(p,true);const creating=!previous,financial=creating||next.phase==='payment-submitting',s=await snapshots(p,next,financial),l=await ledger();
  const who=next.buyerOwnerId===p.ownerId?'buyer':next.sellerOwnerId===p.ownerId?'seller':null;need(who&&(creating||next.phase==='payment-submitting'?who==='buyer':next.phase==='delivered'||next.phase==='delivery-failed'?who==='seller':true),'NATIVE_SPLIT_OWNER_REQUIRED');if(financial)need(s.id.identity.wallet?.wallet===next.policy.payer,'NATIVE_SPLIT_PAYER_NOT_BOUND');
  const value=structuredClone(l.value),seller=value.sellers.find(v=>v.serviceId===next.serviceId&&v.ownerId===next.sellerOwnerId),existing=value.operations.find(v=>v.operationId===next.operationId);
  let g=s.g,expiresAt=now()+5000,sellerProof;
  if(financial){need(seller&&seller.leaseExpiresAt>now()+60000&&seller.treasuryOwnerId===next.treasuryOwnerId&&seller.cardHash===next.policy.serviceCardHash&&seller.provider===next.policy.provider&&seller.grossAtomic===next.policy.grossAtomic&&seller.netAtomic===next.policy.sellerNetAtomic&&seller.feeBps===next.policy.feeBps,'SELLER_ACCEPTANCE_REQUIRED');
   const sellerIdentity=await identity({role:'agent',ownerId:seller.ownerId,generation:seller.generation,agentId:seller.agentId,workspaceId:seller.workspaceId});sellerProof=sellerIdentity.identity;g=guards(g,sellerIdentity.guard);expiresAt=Math.min(expiresAt,seller.leaseExpiresAt-60000,s.cp.expiresAt,next.policy.expiresAt*1000);
  }
  if(creating){need(!existing&&value.operations.length<128,'NATIVE_SPLIT_CAPACITY_EXHAUSTED');need(next.treasuryOwnerId===s.cp.treasury.ownerId,'NATIVE_SPLIT_TREASURY_OWNER_MISMATCH');
   const [buyer,pending]=await Promise.all([repositorySnapshot(next.buyerOwnerId,'buyer'),repositorySnapshot(next.sellerOwnerId,'seller-pending')]);need(!buyer.nextCursor&&!pending.nextCursor,'NATIVE_SPLIT_LEGACY_SNAPSHOT_INCOMPLETE');g=guards(g,buyer.guard,pending.guard);
   const old=[...(s.m.state.orders??[]),...(s.m.state.archived??[]),...buyer.records,...pending.records],unique=[...new Map(old.map(v=>[v.operationId,v])).values()];
   const cutoff=now()-SPLIT_WINDOW_MS;
   need(!unique.some(v=>v.operationId===next.operationId),'NATIVE_SPLIT_OPERATION_COLLISION');
   const times=unique.filter(v=>v.buyerOwnerId===next.buyerOwnerId).map(v=>Date.parse(v.archivedAt??v.createdAt));need(times.every(t=>Number.isSafeInteger(t)&&t<=now()),'NATIVE_SPLIT_QUOTA_UNAVAILABLE');
   need(!times.some(t=>t>=cutoff)&&!value.operations.some(v=>v.buyerOwnerId===next.buyerOwnerId&&v.createdAt>=cutoff),'BUYER_ORDER_LIMIT');
   // No exception for the original uncertain seat. It continues to occupy its
   // original capacity; split admission may not reclaim or infer its outcome.
   const oldPending=unique.filter(v=>v.sellerOwnerId===next.sellerOwnerId&&(v.phase?v.phase!=='delivered':v.paymentPhase==='uncertain'||v.sellerReservationPending));
   need(oldPending.length+value.operations.filter(v=>v.sellerOwnerId===next.sellerOwnerId&&active(v)).length<1,'NATIVE_SPLIT_CAPACITY_EXHAUSTED');
   const day=new Date(now()).toISOString().slice(0,10),oldDaily=unique.filter(v=>v.sellerOwnerId===next.sellerOwnerId&&v.createdAt?.slice(0,10)===day).length,splitDaily=value.operations.filter(v=>v.sellerOwnerId===next.sellerOwnerId&&new Date(v.createdAt).toISOString().slice(0,10)===day).length;
   need(oldDaily+splitDaily<50,'NATIVE_SPLIT_DAILY_CAPACITY_EXHAUSTED');
   value.operations.push({operationId:next.operationId,buyerOwnerId:next.buyerOwnerId,sellerOwnerId:next.sellerOwnerId,serviceId:next.serviceId,sourceServiceId:seller.sourceServiceId,sourceCardHash:seller.sourceCardHash,createdAt:next.createdAt,phase:next.phase});
  }else{need(existing&&existing.buyerOwnerId===next.buyerOwnerId&&existing.sellerOwnerId===next.sellerOwnerId&&existing.phase===previous.phase,'NATIVE_SPLIT_RESERVATION_MISMATCH');existing.phase=next.phase;}
  value.revision=randomUUID();const raw=JSON.stringify(value);need(Buffer.byteLength(raw)<=262144,'NATIVE_SPLIT_LEDGER_FULL');
  // Native snapshot guards are read-only. Budget, allocation and order are
  // proposed together and written only after ALL guards/capacity checks pass.
  const allocationKey=marketPrefix+':split:v1:allocation:'+next.operationId,ledgerAllocationKey=marketPrefix+':split:v1:ledger-allocation';
  const [allocationRaw,ledgerAllocationRaw]=await Promise.all([redis.get(allocationKey),redis.get(ledgerAllocationKey)]);
  const allocation=JSON.stringify({version:1,operationId:next.operationId,bytes:SPLIT_COST_BOUND.storageBytesPerOrder}),ledgerAllocation=JSON.stringify({version:1,bytes:SPLIT_COST_BOUND.ledgerReservedBytes});
  need(creating?allocationRaw===null||allocationRaw===undefined:allocationRaw===allocation,'NATIVE_SPLIT_ALLOCATION_CHANGED');need(ledgerAllocationRaw===null||ledgerAllocationRaw===undefined||ledgerAllocationRaw===ledgerAllocation,'NATIVE_SPLIT_ALLOCATION_CHANGED');
  const accountingKey=stageAccountingKey(namespace,next.operationId),accountingOld=await redis.get(accountingKey);let accountingNext=accountingOld??null;
  if(creating){need(accountingOld===null||accountingOld===undefined,'SPLIT_STAGE_RECORD_COLLISION');next.accountingProfile=selected.version;need(Buffer.byteLength(JSON.stringify(next))<=65536,'SPLIT_RECORD_BOUND');accountingNext=JSON.stringify(makeStageRecord({order:next,buyerPrincipal:s.id.identity,sellerPrincipal:sellerProof,sourceDigest,namespace,version:selected.version}));}
  else if(next.accountingProfile===STAGE_ACCOUNTING_VERSION||next.accountingProfile===STAGE_ACCOUNTING_VERSION_V2)parseStageRecord(accountingOld,{operationId:next.operationId,sourceDigest,policyHash:next.policyHash,namespace,version:next.accountingProfile});
  else need(accountingOld===null||accountingOld===undefined,'SPLIT_STAGE_OLD_PROFILE_CONFLICT');
  const closing=next.accountingProfile===STAGE_ACCOUNTING_VERSION_V2&&next.phase==='delivered';
  const needsLifecycleCertificate=next.accountingProfile===STAGE_ACCOUNTING_VERSION_V2&&(creating||closing);
  const lifecycleKey=needsLifecycleCertificate?lifecycleCertificateKey(marketPrefix,sourceDigest):null;
  const lifecycleRaw=needsLifecycleCertificate?await redis.get(lifecycleKey):null;
  if(needsLifecycleCertificate)validateLifecycleCertificate(lifecycleRaw,{sourceDigest,recipeDigest:stageProfile(STAGE_ACCOUNTING_VERSION_V2).digest,now:now()});
  const terminal=closing?validateTerminalTransition({previous,next,namespace,sourceDigest,recipeDigest:stageProfile(STAGE_ACCOUNTING_VERSION_V2).digest,stageRaw:accountingOld}):null;
  const storage=await storagePlan([{key:allocationKey,expectedRaw:allocationRaw??null,nextRaw:allocation,reservedBytes:SPLIT_COST_BOUND.storageBytesPerOrder},{key:ledgerAllocationKey,expectedRaw:ledgerAllocationRaw??null,nextRaw:ledgerAllocation,reservedBytes:SPLIT_COST_BOUND.ledgerReservedBytes},...(creating||closing?[{key:accountingKey,expectedRaw:creating?null:accountingOld,nextRaw:accountingNext,reservedBytes:65536-Buffer.byteLength(accountingNext)}]:[])]);need(storage&&storage.keys?.length===1&&storage.args?.length===2&&typeof storage.appendScript==='function'&&typeof storage.writeScript==='function','NATIVE_SPLIT_STORAGE_UNAVAILABLE');
  const configuration=budgetConfiguration();need(configuration&&configuration.transferBytes<=9950000000,'NATIVE_SPLIT_BUDGET_UNAVAILABLE');
  const accountingProfile=stageProfile(next.accountingProfile??STAGE_ACCOUNTING_VERSION);
  return {...g,expiresAtMs:expiresAt,async commit(base){
   const offset=base.keys.length,ai=base.args.length;
   const keys=[...base.keys,ledgerKey,budgetKey,allocationKey,ledgerAllocationKey,accountingKey,...(needsLifecycleCertificate?[lifecycleKey]:[]),...storage.keys];
   const storageKeyOffset=offset+6+(needsLifecycleCertificate?1:0),storageArgOffset=ai+11+(needsLifecycleCertificate?1:0);
   const certificateGuard=needsLifecycleCertificate?lifecycleCertificateGuardPrelude({marketPrefix,sourceDigest,recipeDigest:accountingProfile.digest,checkpointRawExpression:'ARGV['+(ai+11)+']',checkpointKeyIndex:offset+6}):'';
   const terminalPrelude=closing?terminalBudgetPrelude({transition:terminal,budgetVariable:'budgetNext',accountingVariable:'accountingNext',oldRawExpression:'ARGV[3]',nextRawExpression:'ARGV[4]',stageRawExpression:'accountingOld',checkpointRawExpression:'ARGV['+(ai+11)+']',checkpointKeyIndex:offset+6,configExpression:'cjson.decode(ARGV['+(ai+3)+'])'}):'';
   const args=[...base.args,l.raw??'missing',raw,JSON.stringify(configuration),JSON.stringify({operationId:next.operationId,principalHash:sha(next.buyerOwnerId),action:'reserve',...SPLIT_COST_BOUND,globalAllowanceBytes:SPLIT_COST_BOUND.safetyBytes,publicTransferFloorBytes:SPLIT_COST_BOUND.safetyBytes}),allocationRaw??'missing',allocation,ledgerAllocationRaw??'missing',ledgerAllocation,accountingOld??'missing',accountingNext??'missing',...(needsLifecycleCertificate?[lifecycleRaw]:[]),...storage.args];
   const prelude=`\n${budgetFunctions}\nlocal financeOld=redis.call('GET',KEYS[${offset+1}])\nif ARGV[${ai+1}]=='missing' then if financeOld then return -40 end elseif financeOld~=ARGV[${ai+1}] then return -40 end\nfor n=${offset+1},#KEYS do local t=redis.call('TYPE',KEYS[n]);if type(t)=='table' then t=t.ok end;if t~='none' and t~='string' then return -41 end end\nlocal allocationOld=redis.call('GET',KEYS[${offset+3}]);local allocationExpected=ARGV[${ai+5}]\nif allocationExpected=='missing' then if allocationOld then return -40 end elseif allocationOld~=allocationExpected then return -40 end\nlocal ledgerAllocationOld=redis.call('GET',KEYS[${offset+4}]);local ledgerAllocationExpected=ARGV[${ai+7}]\nif ledgerAllocationExpected=='missing' then if ledgerAllocationOld then return -40 end elseif ledgerAllocationOld~=ledgerAllocationExpected then return -40 end\nlocal accountingOld=redis.call('GET',KEYS[${offset+5}]);local accountingExpected=ARGV[${ai+9}]\nif accountingExpected=='missing' then if accountingOld then return -40 end elseif accountingOld~=accountingExpected then return -40 end\nlocal budgetRaw=redis.call('GET',KEYS[${offset+2}]);if not budgetRaw then return -42 end\nlocal budgetNext=budgetRaw\nlocal accountingNext=ARGV[${ai+10}]\n${certificateGuard}\n${creating?`local config=cjson.decode(ARGV[${ai+3}]);local request=cjson.decode(ARGV[${ai+4}]);local current=cjson.decode(budgetRaw)\nfor _,held in ipairs(current.held or {}) do if held.operationId==ARGV[6] then return -43 end end\nlocal proposed,status=budget_prepare(budgetRaw,config,request);if status~=1 then return -44 end;for _,held in ipairs(proposed.held or {})do if held.operationId==ARGV[6] then held.stageAccountingVersion='${accountingProfile.version}';held.stageRecipeDigest='${accountingProfile.digest}';held.stageSourceDigest='${sourceDigest}' end end;budgetNext=cjson.encode(proposed)`:`local current=cjson.decode(budgetRaw);local found=false;for _,held in ipairs(current.held or {}) do if held.operationId==ARGV[6] and held.principalHash=='${sha(next.buyerOwnerId)}' then found=true end end;if not found then return -43 end`}
${terminalPrelude}
${closing?`local patch=cjson.decode(ARGV[${storageArgOffset+1}]);local found=false;for _,entry in ipairs(patch)do if entry.key=='${sha(accountingKey)}' then if entry.expected~=#accountingOld then return -45 end;entry.bytes=#accountingNext;entry.reserved=65536-#accountingNext;found=true end end;if not found then return -45 end;ARGV[${storageArgOffset+1}]=cjson.encode(patch)`:''}
${storage.appendScript(storageKeyOffset,storageArgOffset)}
`;
   // V1 never releases automatically. Only certified V2 terminal transitions
   // may resize their own hold; historical holds and buckets stay untouched.
   // Full prepaid lifecycle hold remains conservative until a separate, proven
   // reconciliation/usage accounting policy is implemented and reviewed.
   const write=`\nredis.call('SET',KEYS[${offset+1}],ARGV[${ai+2}])\nredis.call('SET',KEYS[${offset+2}],budgetNext)\nredis.call('SET',KEYS[${offset+3}],ARGV[${ai+6}])\nredis.call('SET',KEYS[${offset+4}],ARGV[${ai+8}])\n${creating||closing?`redis.call('SET',KEYS[${offset+5}],accountingNext)`:''}\n${storage.writeScript(storageKeyOffset)}`;
   const markers=['-- SPLIT_GUARDS_END_INDEX','-- SPLIT_NATIVE_PRECOMPUTE','-- SPLIT_NATIVE_WRITE'];
   for(const marker of markers)need(base.script.split(marker).length===2,'NATIVE_SPLIT_SCRIPT_MARKER_INVALID');
   need(base.script.indexOf(markers[1])<base.script.indexOf("redis.call('SET',KEYS[1],ARGV[4])")&&base.script.indexOf(markers[2])>base.script.indexOf("redis.call('SET',KEYS[1],ARGV[4])"),'NATIVE_SPLIT_SCRIPT_MARKER_INVALID');
   const script=base.script.replace(markers[0],`splitGuardEnd=${offset}`).replace(markers[1],()=>prelude).replace(markers[2],()=>write);return {keys,args,script};
  }};
 }
 async function reportSeller(p,input){
  principal(p,true);need(input&&Object.keys(input).sort().join(',')==='cardHash,netAtomic,reportId,serviceId,sourceCardHash,sourceServiceId,treasuryOwnerId'&&/^[a-f0-9-]{36}$/.test(input.reportId)&&input.netAtomic==='98500'&&owner.test(input.treasuryOwnerId)&&input.treasuryOwnerId!==p.ownerId&&/^[a-f0-9]{64}$/.test(input.cardHash),'SELLER_ACCEPTANCE_REQUIRED');
  const id=await identity(p),m=await marketSnapshot(),service=m.state.services.find(s=>s.ownerId===p.ownerId&&s.card.id===input.sourceServiceId&&s.cardHash===input.sourceCardHash&&!s.withdrawn);need(service&&m.state.paused!==true,'NATIVE_SPLIT_SOURCE_SERVICE_UNAVAILABLE');
  need(input.cardHash===splitServiceCardHash({...input,provider:service.card.payment.destination}),'NATIVE_SPLIT_CARD_HASH_INVALID');
  const intent=sha(JSON.stringify(Object.fromEntries(Object.keys(input).sort().map(k=>[k,input[k]]))));
  const l=await ledger(),prior=l.value.sellers.find(s=>s.serviceId===input.serviceId);if(prior?.reportId===input.reportId){need(prior.generation===p.generation&&prior.acceptanceDigest===intent,'NATIVE_SPLIT_SELLER_REPORT_CONFLICT');return prior;}
  need(!prior||prior.ownerId===p.ownerId,'NATIVE_SPLIT_SELLER_OWNER_MISMATCH');const value=structuredClone(l.value),at=now();const seller={...input,acceptanceDigest:intent,ownerId:p.ownerId,generation:p.generation,workspaceId:p.workspaceId,agentId:p.agentId,provider:service.card.payment.destination,treasury:TREASURY,feeBps:150,grossAtomic:'100000',acceptedAt:at,leaseExpiresAt:at+360000};value.sellers=value.sellers.filter(s=>s.serviceId!==input.serviceId);value.sellers.push(seller);value.revision=randomUUID();parseSplitLedger(JSON.stringify(value));
  // Seller setup is separately operator-reviewed; never silently initializes
  // physical accounting or bypasses the native storage ledger.
  const allocationKey=marketPrefix+':split:v1:ledger-allocation',allocationRaw=await redis.get(allocationKey),allocation=JSON.stringify({version:1,bytes:SPLIT_COST_BOUND.ledgerReservedBytes});need(allocationRaw===null||allocationRaw===undefined||allocationRaw===allocation,'NATIVE_SPLIT_ALLOCATION_CHANGED');
  const storage=await storagePlan([{key:allocationKey,expectedRaw:allocationRaw??null,nextRaw:allocation,reservedBytes:SPLIT_COST_BOUND.ledgerReservedBytes}]);need(storage&&storage.keys?.length===1&&storage.args?.length===2&&typeof storage.appendScript==='function'&&typeof storage.writeScript==='function','NATIVE_SPLIT_STORAGE_UNAVAILABLE');const g=guards(id.guard,m.guard),keys=[ledgerKey,allocationKey,...storage.keys,...g.keys],args=[l.raw??'missing',JSON.stringify(value),allocationRaw??'missing',allocation,...storage.args,JSON.stringify(g.values),String(at+5000)];
  const script=`local old=redis.call('GET',KEYS[1]);if ARGV[1]=='missing' then if old then return 0 end elseif old~=ARGV[1] then return 0 end\nlocal clock=redis.call('TIME');if tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)>=tonumber(ARGV[8]) then return -2 end\nlocal guards=cjson.decode(ARGV[7]);for i=4,#KEYS do local old=redis.call('GET',KEYS[i]);local expected=guards[i-3];if expected==cjson.null then if old then return 0 end elseif old~=expected then return 0 end end\nfor i=1,3 do local t=redis.call('TYPE',KEYS[i]);if type(t)=='table' then t=t.ok end;if t~='none' and t~='string' then return -2 end end\nlocal allocationOld=redis.call('GET',KEYS[2]);if ARGV[3]=='missing' then if allocationOld then return 0 end elseif allocationOld~=ARGV[3] then return 0 end\n${storage.appendScript(3,5)}\nredis.call('SET',KEYS[1],ARGV[2]);redis.call('SET',KEYS[2],ARGV[4]);${storage.writeScript(3)}return 1`;
  let result;try{result=await redis.eval(script,keys,args);}catch{throw Error('NATIVE_SPLIT_SELLER_REPORT_UNCONFIRMED');}need(result===1,'NATIVE_SPLIT_SELLER_REPORT_UNCONFIRMED');return seller;
 }
 async function inspectLifecycle({principal:p,operationId}){
  assertNewId(operationId);await identity(p);
  const orderRaw=await redis.get(namespace+':order:'+operationId);
  need(typeof orderRaw==='string'&&Buffer.byteLength(orderRaw)<=65536,'SPLIT_LIFECYCLE_ORDER');
  const order=JSON.parse(orderRaw);need(order.operationId===operationId&&[order.buyerOwnerId,order.sellerOwnerId,order.treasuryOwnerId].includes(p.ownerId),'SPLIT_LIFECYCLE_OWNER');
  if(order.accountingProfile!==STAGE_ACCOUNTING_VERSION_V2)return {status:'legacy',readOnly:true,mayExecute:false};
  const raw=await redis.get(stageAccountingKey(namespace,operationId));
  const record=parseStageRecord(raw,{operationId,sourceDigest,policyHash:order.policyHash,namespace,version:STAGE_ACCOUNTING_VERSION_V2});
  return {status:record.terminal?'retention':'active',operationId,phase:order.phase,closureDigest:record.terminal?.closureDigest??null,readOnly:true,mayExecute:false,completeFinancialBudgetCertified:false};
 }
 return Object.freeze({authorize,prepareWrite,resolveService,reportSeller,stageAccounting,inspectLifecycle,ledgerKey,costBound:SPLIT_COST_BOUND,costDigest:SPLIT_COST_DIGEST,profile:PROFILE});
}
