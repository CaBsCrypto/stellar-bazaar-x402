import {createHash} from 'node:crypto';
import {assertNewId} from './store.mjs';
import {stageProfile,STAGE_ACCOUNTING_VERSION_V2,parseStageRecord} from './stage-accounting.mjs';
import {assertPolicy,hashPolicy,canonicalJson} from '../policy-router/fee-split-policy-v1.mjs';
import {makeSettledHistoryRecord} from '../conformance-history/history-record.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const need=(value,code)=>{if(!value)throw Error(code);};
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const owner=value=>typeof value==='string'&&/^ow_[a-f0-9]{32}$/.test(value);
const proofs=new WeakMap();
export const LIFECYCLE_BUDGET_VERSION='bazaar.split-lifecycle-budget/v2';
export const LIFECYCLE_CERTIFICATE_VERSION='bazaar.lifecycle-certificate/v2';
export const LIFECYCLE_RETENTION_FLOOR=Object.freeze({transferBytes:42991616,recoveryCommands:384,backgroundCommands:8192,storageRetentionBytes:3*1048576});
// This module is a local candidate. No real complete-pipeline/retention
// certificate has been issued, and a planning document cannot enable it.
export const LIFECYCLE_PROFILE=Object.freeze({version:LIFECYCLE_BUDGET_VERSION,stageVersion:STAGE_ACCOUNTING_VERSION_V2,newOrdersOnly:true,activationReady:false,fullBudgetCertified:false,financialReady:false});

export function lifecycleCertificateKey(marketPrefix,sourceDigest){
 need(typeof marketPrefix==='string'&&/^bazaar-market:pilot-[a-f0-9]{32}$/.test(marketPrefix)&&hex(sourceDigest),'SPLIT_LIFECYCLE_BINDING');
 return marketPrefix+':split:v1:lifecycle-certificate:'+sourceDigest;
}

function checkedTransition({previous,next,namespace,sourceDigest,recipeDigest,stageRaw}){
 const profile=stageProfile(STAGE_ACCOUNTING_VERSION_V2);
 need(hex(sourceDigest)&&recipeDigest===profile.digest&&typeof namespace==='string'&&/^bazaar:split:v1:pilot:[a-f0-9]{32}$/.test(namespace),'SPLIT_LIFECYCLE_BINDING');
 need(previous&&next&&previous.version==='bazaar.native-split-order/v1'&&next.version===previous.version,'SPLIT_LIFECYCLE_ORDER');
 const operationId=assertNewId(previous.operationId);
 need(next.operationId===operationId&&previous.accountingProfile===profile.version&&next.accountingProfile===profile.version,'SPLIT_LIFECYCLE_NEW_PROFILE_REQUIRED');
 // A paid receipt must already be in the exact native stored row. This helper
 // alone is not ledger-proof authority; native CAS and guards are mandatory.
 need((previous.phase==='paid'||previous.phase==='delivered')&&next.phase==='delivered','SPLIT_LIFECYCLE_DELIVERY_REQUIRED');
 assertPolicy(previous.policy);assertPolicy(next.policy);
 need(previous.policy.operationId===operationId&&next.policyHash===hashPolicy(next.policy)&&previous.policyHash===next.policyHash,'SPLIT_LIFECYCLE_POLICY');
 const immutable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['phase','revision','delivery'].includes(key)));
 need(canonicalJson(immutable(previous))===canonicalJson(immutable(next)),'SPLIT_LIFECYCLE_IMMUTABLE_CHANGED');
 const owners=[next.buyerOwnerId,next.sellerOwnerId,next.treasuryOwnerId];
 need(owners.every(owner)&&new Set(owners).size===3,'SPLIT_LIFECYCLE_OWNERS');
 need(typeof next.delivery?.text==='string'&&Buffer.byteLength(next.delivery.text)<=8192&&hex(next.delivery.sha256)&&sha(next.delivery.text)===next.delivery.sha256,'SPLIT_LIFECYCLE_DELIVERY_HASH');
 if(previous.phase==='delivered')need(canonicalJson(previous.delivery)===canonicalJson(next.delivery),'SPLIT_LIFECYCLE_REPLAY_CHANGED');
 need(hex(previous.receipt?.transactionHash)&&previous.transactionHash===previous.receipt.transactionHash&&next.transactionHash===previous.transactionHash,'SPLIT_LIFECYCLE_SETTLEMENT');
 for(const row of [previous,next])makeSettledHistoryRecord({policy:row.policy,verifiedReceipt:row.receipt,owners:row,phase:row.phase,createdAt:row.createdAt,delivery:row.delivery});
 const oldRaw=JSON.stringify(previous),nextRaw=JSON.stringify(next);
 need(Buffer.byteLength(oldRaw)<=65536&&Buffer.byteLength(nextRaw)<=65536,'SPLIT_LIFECYCLE_ORDER_BOUND');
 const stage=parseStageRecord(stageRaw,{operationId,sourceDigest,policyHash:next.policyHash,namespace,version:profile.version});
 need(stage.buyer.ownerId===next.buyerOwnerId&&stage.seller.ownerId===next.sellerOwnerId&&stage.treasuryOwnerId===next.treasuryOwnerId,'SPLIT_LIFECYCLE_STAGE_OWNERS');
 const remainingStages={};let transferBytes=0,recoveryCommands=0;
 for(const [action,entry]of Object.entries(profile.plan))if(entry.phases.includes('delivered')){
  const maxCalls=entry.maxCalls-(stage.used[action]??0);
  remainingStages[action]=Object.freeze({maxCalls,transferBytes:maxCalls*entry.transferBytes,recoveryCommands:maxCalls*entry.commands});
  transferBytes+=remainingStages[action].transferBytes;recoveryCommands+=remainingStages[action].recoveryCommands;
 }
 need([transferBytes,recoveryCommands].every(integer),'SPLIT_LIFECYCLE_REMAINING_BOUND');
 const identity={version:LIFECYCLE_BUDGET_VERSION,operationId,sourceDigest,recipeDigest,policyHash:next.policyHash,transactionHash:next.transactionHash,deliverySha256:next.delivery.sha256,buyerPrincipalHash:sha(next.buyerOwnerId)};
 const candidate=Object.freeze({...identity,closureDigest:sha(canonicalJson(identity)),remainingStages:Object.freeze(remainingStages),remainingStageTransferBytes:transferBytes,remainingStageRecoveryCommands:recoveryCommands,minimumRetention:Object.freeze({...LIFECYCLE_RETENTION_FLOOR,transferBytes:transferBytes+LIFECYCLE_RETENTION_FLOOR.transferBytes,recoveryCommands:recoveryCommands+LIFECYCLE_RETENTION_FLOOR.recoveryCommands}),candidateOnly:true,activationReady:false});
 return {candidate,oldRaw,nextRaw,stageRaw,namespace,owners,profile};
}

/** Diagnostic projection; never an authorization or a release request. */
export function terminalCandidate(input){return checkedTransition(input).candidate;}
/** Server-internal snapshot binding. Cloning/serializing this value loses it. */
export function validateTerminalTransition(input){
 const checked=checkedTransition(input),proof=Object.freeze({version:LIFECYCLE_BUDGET_VERSION,operationId:checked.candidate.operationId,candidate:checked.candidate});
 proofs.set(proof,checked);return proof;
}

const variable=value=>{need(typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(value),'SPLIT_LIFECYCLE_LUA_VARIABLE');return value;};
const expression=value=>{need(typeof value==='string'&&(/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)||/^ARGV\[[1-9][0-9]*\]$/.test(value)||/^cjson\.decode\(ARGV\[[1-9][0-9]*\]\)$/.test(value)),'SPLIT_LIFECYCLE_LUA_EXPRESSION');return value;};
const literal=value=>JSON.stringify(value);

/** Structural diagnostic only. Authority comes from the protected native key
 * and its exact raw CAS guard, never from passing this parsed object back. */
export function validateLifecycleCertificate(raw,{sourceDigest,recipeDigest,now=Date.now()}={}){
 need(typeof raw==='string'&&Buffer.byteLength(raw)<=8192&&hex(sourceDigest)&&recipeDigest===stageProfile(STAGE_ACCOUNTING_VERSION_V2).digest&&integer(now),'SPLIT_LIFECYCLE_CERTIFICATE');
 let cert;try{cert=JSON.parse(raw);}catch{throw Error('SPLIT_LIFECYCLE_CERTIFICATE');}
 const exact=(object,names)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join(',')===names.sort().join(',');
 need(exact(cert,['version','profile','sourceDigest','recipeDigest','certificateDigest','artifactPins','issuedAtMs','expiresAtMs','fullPipelineCertified','retention'])&&cert.version===LIFECYCLE_CERTIFICATE_VERSION&&cert.profile===STAGE_ACCOUNTING_VERSION_V2&&cert.sourceDigest===sourceDigest&&cert.recipeDigest===recipeDigest&&cert.fullPipelineCertified===true&&hex(cert.certificateDigest),'SPLIT_LIFECYCLE_CERTIFICATE');
 need(exact(cert.artifactPins,['costModuleSha256','retentionProofSha256','pipelineProofSha256'])&&Object.values(cert.artifactPins).every(hex),'SPLIT_LIFECYCLE_CERTIFICATE_ARTIFACTS');
 need(integer(cert.issuedAtMs)&&integer(cert.expiresAtMs)&&cert.issuedAtMs<=now&&cert.expiresAtMs>now&&cert.expiresAtMs>cert.issuedAtMs&&cert.expiresAtMs-cert.issuedAtMs<=300000,'SPLIT_LIFECYCLE_CERTIFICATE_STALE');
 need(exact(cert.retention,Object.keys(LIFECYCLE_RETENTION_FLOOR))&&Object.entries(cert.retention).every(([key,value])=>integer(value)&&value<=2000000000&&value>=LIFECYCLE_RETENTION_FLOOR[key]),'SPLIT_LIFECYCLE_CERTIFICATE_RETENTION');
 return Object.freeze(cert);
}

/** Reusable internal create/close guard; no writer, issuer or authority mint. */
export function lifecycleCertificateGuardPrelude({marketPrefix,sourceDigest,recipeDigest,checkpointRawExpression,checkpointKeyIndex}){
 need(recipeDigest===stageProfile(STAGE_ACCOUNTING_VERSION_V2).digest,'SPLIT_LIFECYCLE_BINDING');
 const key=lifecycleCertificateKey(marketPrefix,sourceDigest),checkpoint=expression(checkpointRawExpression);
 need(Number.isSafeInteger(checkpointKeyIndex)&&checkpointKeyIndex>=6&&checkpointKeyIndex<=64,'SPLIT_LIFECYCLE_CHECKPOINT_INDEX');
 return certificateGuard({key,sourceDigest,recipeDigest,checkpoint,checkpointKeyIndex});
}

function certificateGuard({key,sourceDigest,recipeDigest,checkpoint,checkpointKeyIndex}){
 return `
 local function life_int(v) return type(v)=='number' and v>=0 and v%1==0 and v<=9007199254740991 end
 local function life_hex(v) return type(v)=='string' and string.len(v)==64 and string.match(v,'^[a-f0-9]+$') and v~=${literal('0'.repeat(64))} end
 local function life_keys(t,names) if type(t)~='table' then return false end;local count=0;for k,_ in pairs(t)do if not names[k] then return false end;count=count+1 end;local want=0;for _,_ in pairs(names)do want=want+1 end;return count==want end
 if KEYS[${checkpointKeyIndex}]~=${literal(key)} then return -91 end
 local ct=redis.call('TYPE',KEYS[${checkpointKeyIndex}]);if type(ct)=='table' then ct=ct.ok end;if ct~='string' then return -91 end
 local certificateRaw=redis.call('GET',KEYS[${checkpointKeyIndex}]);if type(${checkpoint})~='string' or certificateRaw~=${checkpoint} or string.len(certificateRaw)>8192 then return -91 end
 local certOk,lifecycleCertificate=pcall(cjson.decode,certificateRaw)
 if not certOk or not life_keys(lifecycleCertificate,{version=true,profile=true,sourceDigest=true,recipeDigest=true,certificateDigest=true,artifactPins=true,issuedAtMs=true,expiresAtMs=true,fullPipelineCertified=true,retention=true}) then return -92 end
 if lifecycleCertificate.version~=${literal(LIFECYCLE_CERTIFICATE_VERSION)} or lifecycleCertificate.profile~=${literal(STAGE_ACCOUNTING_VERSION_V2)} or lifecycleCertificate.sourceDigest~=${literal(sourceDigest)} or lifecycleCertificate.recipeDigest~=${literal(recipeDigest)} or lifecycleCertificate.fullPipelineCertified~=true or not life_hex(lifecycleCertificate.certificateDigest) then return -92 end
 if not life_keys(lifecycleCertificate.artifactPins,{costModuleSha256=true,retentionProofSha256=true,pipelineProofSha256=true}) then return -92 end
 for _,v in pairs(lifecycleCertificate.artifactPins)do if not life_hex(v) then return -92 end end
 local clock=redis.call('TIME');local lifecycleCertificateNow=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
 if not life_int(lifecycleCertificate.issuedAtMs) or not life_int(lifecycleCertificate.expiresAtMs) or lifecycleCertificate.issuedAtMs>lifecycleCertificateNow or lifecycleCertificate.expiresAtMs<=lifecycleCertificateNow or lifecycleCertificate.expiresAtMs<=lifecycleCertificate.issuedAtMs or lifecycleCertificate.expiresAtMs-lifecycleCertificate.issuedAtMs>300000 then return -93 end
 if not life_keys(lifecycleCertificate.retention,{transferBytes=true,recoveryCommands=true,backgroundCommands=true,storageRetentionBytes=true}) then return -94 end
 for _,v in pairs(lifecycleCertificate.retention)do if not life_int(v) or v>2000000000 then return -94 end end
 if lifecycleCertificate.retention.transferBytes<${LIFECYCLE_RETENTION_FLOOR.transferBytes} or lifecycleCertificate.retention.recoveryCommands<${LIFECYCLE_RETENTION_FLOOR.recoveryCommands} or lifecycleCertificate.retention.backgroundCommands<${LIFECYCLE_RETENTION_FLOOR.backgroundCommands} or lifecycleCertificate.retention.storageRetentionBytes<${LIFECYCLE_RETENTION_FLOOR.storageRetentionBytes} then return -94 end
`;
}

/**
 * Embed after native order/stage/storage guards and BEFORE the first SET/ZADD.
 * It only computes the two existing locals; it never writes, expires or deletes.
 * The protected certificate row is an operator attestation, not cryptographic
 * proof. No HTTP/MCP writer or issuer is provided here. Missing real proof keeps
 * production creation/closure closed; synthetic certificates test composition.
 */
export function terminalBudgetPrelude({transition,budgetVariable='budgetNext',accountingVariable='accountingNext',oldRawExpression='ARGV[3]',nextRawExpression='ARGV[4]',stageRawExpression='accountingOld',checkpointRawExpression,checkpointKeyIndex,configExpression}){
 const proof=proofs.get(transition);need(proof,'SPLIT_LIFECYCLE_NATIVE_TRANSITION_REQUIRED');
 const b=variable(budgetVariable),a=variable(accountingVariable),old=expression(oldRawExpression),next=expression(nextRawExpression),stage=expression(stageRawExpression),checkpoint=expression(checkpointRawExpression),config=expression(configExpression);
 need(Number.isSafeInteger(checkpointKeyIndex)&&checkpointKeyIndex>=6&&checkpointKeyIndex<=64,'SPLIT_LIFECYCLE_CHECKPOINT_INDEX');
 const c=proof.candidate,market='bazaar-market:pilot-'+proof.namespace.slice('bazaar:split:v1:pilot:'.length),certificateKey=lifecycleCertificateKey(market,c.sourceDigest);
 const indexKeys=proof.owners.map(value=>proof.namespace+':owner:'+sha(value));
 return `\n-- bazaar-lifecycle-v2-precompute-only; no write before all checks
do
${certificateGuard({key:certificateKey,sourceDigest:c.sourceDigest,recipeDigest:c.recipeDigest,checkpoint,checkpointKeyIndex})}
 local cert=lifecycleCertificate;local now=lifecycleCertificateNow
 if KEYS[1]~=${literal(proof.namespace+':order:'+c.operationId)} or KEYS[2]~=${literal(indexKeys[0])} or KEYS[3]~=${literal(indexKeys[1])} or KEYS[4]~=${literal(indexKeys[2])} or KEYS[2]==KEYS[3] or KEYS[2]==KEYS[4] or KEYS[3]==KEYS[4] then return -90 end
 if ${old}~=${literal(proof.oldRaw)} or ${next}~=${literal(proof.nextRaw)} or ${stage}~=${literal(proof.stageRaw)} then return -90 end
 local orderOk,delivered=pcall(cjson.decode,${next});local stageOk,accounting=pcall(cjson.decode,${stage})
 if not orderOk or not stageOk or delivered.phase~='delivered' or delivered.accountingProfile~=${literal(STAGE_ACCOUNTING_VERSION_V2)} or accounting.version~=${literal(STAGE_ACCOUNTING_VERSION_V2)} or accounting.sourceDigest~=${literal(c.sourceDigest)} or accounting.recipeDigest~=${literal(c.recipeDigest)} or accounting.operationId~=${literal(c.operationId)} or accounting.policyHash~=${literal(c.policyHash)} or accounting.buyerPrincipalHash~=${literal(c.buyerPrincipalHash)} or delivered.transactionHash~=${literal(c.transactionHash)} or delivered.receipt.transactionHash~=delivered.transactionHash or delivered.delivery.sha256~=${literal(c.deliverySha256)} then return -95 end
 local budgetOk,current=pcall(cjson.decode,${b});if not budgetOk or type(current.held)~='table' then return -96 end
 local held=nil;for _,h in ipairs(current.held)do if h.operationId==${literal(c.operationId)} then if held then return -96 end;held=h end end
 if not held or held.principalHash~=${literal(c.buyerPrincipalHash)} or held.stageAccountingVersion~=${literal(STAGE_ACCOUNTING_VERSION_V2)} or held.stageRecipeDigest~=${literal(c.recipeDigest)} or held.stageSourceDigest~=${literal(c.sourceDigest)} then return -96 end
 local validated,status=budget_prepare(${b},${config},{action='reserve',operationId=${literal(c.operationId)},principalHash=${literal(c.buyerPrincipalHash)},recoveryCommands=0,backgroundCommands=0,transferBytes=0,globalAllowanceBytes=0})
 if not validated or status~=1 then return -96 end
 local remaining=cjson.decode(${literal(JSON.stringify(c.remainingStages))});local requiredBytes=cert.retention.transferBytes+${c.remainingStageTransferBytes};local requiredRecovery=cert.retention.recoveryCommands+${c.remainingStageRecoveryCommands};local requiredBackground=cert.retention.backgroundCommands
 if not life_int(requiredBytes) or not life_int(requiredRecovery) or held.transferBytes<requiredBytes or held.recoveryCommands<requiredRecovery or held.backgroundCommands<requiredBackground then return -97 end
 if accounting.terminal then
  local t=accounting.terminal
  if held.status~='retention' or t.version~=${literal(LIFECYCLE_BUDGET_VERSION)} or t.closureDigest~=${literal(c.closureDigest)} or t.operationId~=${literal(c.operationId)} or t.sourceDigest~=${literal(c.sourceDigest)} or t.recipeDigest~=${literal(c.recipeDigest)} or t.transactionHash~=${literal(c.transactionHash)} or t.deliverySha256~=${literal(c.deliverySha256)} or held.lifecycleClosureDigest~=t.closureDigest then return -98 end
  -- Idempotent replay preserves the exact remaining hold: later legitimate
  -- delivered reads may already have debited it. Never refund those debits.
  ${a}=${stage}
 else
  if held.status~=nil and held.status~='active' then return -98 end
  held.transferBytes=requiredBytes;held.recoveryCommands=requiredRecovery;held.backgroundCommands=requiredBackground;held.status='retention';held.lifecycleVersion=${literal(LIFECYCLE_BUDGET_VERSION)};held.lifecycleClosureDigest=${literal(c.closureDigest)}
  accounting.terminal={version=${literal(LIFECYCLE_BUDGET_VERSION)},operationId=${literal(c.operationId)},sourceDigest=${literal(c.sourceDigest)},recipeDigest=${literal(c.recipeDigest)},closureDigest=${literal(c.closureDigest)},certificateDigest=cert.certificateDigest,transactionHash=${literal(c.transactionHash)},deliverySha256=${literal(c.deliverySha256)},closedAtMs=now,remainingStages=remaining,retention=cert.retention,spentRefunded=false,storageReleasedBytes=0}
  ${b}=cjson.encode(current);${a}=cjson.encode(accounting)
 end
 if string.len(${b})>262144 or string.len(${a})>65536 then return -99 end
end\n`;
}
