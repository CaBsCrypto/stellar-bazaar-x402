// Pure transformations only. No network, credentials, uploads, or activation.
import {v2WafHash as hash,v2WafCanonical as canonical,v2ProjectWafProtections as protections,v2WafRuleValue as ruleValue} from './prepare-on-demand-production-v3-waf.mjs';
const fail=()=>{throw Error('EXACT_RESTRICTED_RECOVERY_ACCEPTANCE_WAF_REQUIRED');};
const host=id=>'stellar-bazaar-x402-'+id+'-cabscryptocontacto-6028s-projects.vercel.app';
const CURRENT=host('bs3j2fq8c'),CANONICAL='bazaar.browns.studio',ROLLBACK=host('aj9fplm1u');
const LEGACY=['83ubwydy4','6jy9wrgte','kygcawajl'].map(host);
const QUARANTINE='rule_bazaar_v2_verified_hosts_only_bazaar_dtwy7E',PUBLIC='rule_bazaar_acceptance_egress_only_iPEa7V';
export const PAYMENT_RECOVERY_WAF_BASELINE_HASH='66f5ce1c26e4269df595ab23f0d0eb394d6eac2eff2468994f979d428c1fe6f3';
function validatePlan(p){
 if(!p||p.version!==1||p.status!=='PREPARED_NOT_APPLIED'||!['sourceDigest','sourceManifestSha256','buildSha256'].every(k=>/^[a-f0-9]{64}$/.test(p[k]??''))||p.currentDeploymentId!=='dpl_6N8TLwUSssWffGGC1PW4qFRVrmwk'||p.providerDeploymentId!=='dpl_59zNf8MCvktnzTgci3eppUriS2Un'||p.baselineWafHash!==PAYMENT_RECOVERY_WAF_BASELINE_HASH||p.generalPurchasesEnabled!==false||p.originalOperationUnchanged!==true||p.quotaReset!==false||p.maximumDeployments!==1||p.maximumPromotions!==1||p.newPayments!==0||p.overrides?.BAZAAR_ENABLE_MARKET_PURCHASES!=='true'||p.overrides?.BAZAAR_TEXT_SELLER_RECOVERY_SLOT_OPERATION_ID!=='31c97193-be74-4b9d-b0a3-f3890b0a41e8'||p.overrides?.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES!=='8500000000'||Object.keys(p.overrides).length!==3||canonical(p.guardianDefinition)!=='[{"path":"/api/market/guardian/tick","schedule":"0 * * * *"}]')fail();
}
function baselineRules(baseline){
 if(hash(protections(baseline,'bazaar'))!==PAYMENT_RECOVERY_WAF_BASELINE_HASH||baseline.rules?.length!==2)fail();
 const q=baseline.rules.find(r=>r.id===QUARANTINE),pub=baseline.rules.find(r=>r.id===PUBLIC),condition=q?.conditionGroup?.[0]?.conditions?.[0];
 if(!q?.active||q.action?.mitigate?.action!=='deny'||q.conditionGroup.length!==1||q.conditionGroup[0].conditions.length!==1||condition?.type!=='host'||condition.op!=='inc'||condition.neg!==true||canonical(condition.value)!==canonical([CANONICAL,CURRENT,ROLLBACK])||!pub?.active||pub.action?.mitigate?.action!=='deny'||pub.conditionGroup.length!==22)fail();
 return {q,pub};
}
export function preparePaymentRecoveryWafTemplate(baseline,p){
 validatePlan(p);baselineRules(baseline);
 const template={version:1,status:'PREPARED_NOT_APPLIED',sourceDigest:p.sourceDigest,sourceManifestSha256:p.sourceManifestSha256,buildSha256:p.buildSha256,baselineWafHash:PAYMENT_RECOVERY_WAF_BASELINE_HASH,currentDeploymentId:p.currentDeploymentId,providerDeploymentId:p.providerDeploymentId,phases:[{name:'private',allowedHostsBefore:3,allowedHostsAfter:4,publicRuleChanged:false,newHostnamePrivateToExistingOperatorIp:true},{name:'handover',allowedHostsBefore:4,allowedHostsAfter:3,currentImmutableHostnameBlocked:true,canonicalTargetStillCurrent:true,publicRuleChanged:false},{name:'final',publicConditionGroups:22,publicHostOccurrencesReplaced:4,oldPublicHost:CURRENT,newPublicHost:'same verified READY host',otherProtectionsPreserved:true}],maximumDraftPatches:3,maximumActivations:3,maximumDeployments:1,maximumPromotions:1,generalPurchasesEnabled:false,newPayments:0,guardianDefinition:p.guardianDefinition,drainRequiredBeforeAnyFinancialAcceptance:true,oldMaximumDurationMustBeObserved:true};
 return {...template,templateHash:hash(template)};
}
export function buildPaymentRecoveryAcceptanceWaf(baseline,p,stage,phase){
 const template=preparePaymentRecoveryWafTemplate(baseline,p);
 if(!['private','handover','final'].includes(phase)||stage?.sourceDigest!==p.sourceDigest||stage.sourceManifestSha256!==p.sourceManifestSha256||stage.projectId!=='prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3'||stage.target!=='production'||stage.readyState!=='READY'||!/^dpl_[A-Za-z0-9]+$/.test(stage.deploymentId??'')||[p.currentDeploymentId,p.providerDeploymentId,'dpl_64rLaDth7zfynXSnvfZagL6zgXxP'].includes(stage.deploymentId)||stage.canonicalAssigned!==false)fail();
 let url;try{url=new URL(stage.url);}catch{fail();}
 if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.port||url.search||url.hash||!/^stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app$/.test(url.hostname)||[CURRENT,ROLLBACK,...LEGACY].includes(url.hostname))fail();
 const privateWaf=structuredClone(baseline);
 privateWaf.rules.find(r=>r.id===QUARANTINE).conditionGroup[0].conditions[0].value.push(url.hostname);
 const handover=structuredClone(privateWaf);
 handover.rules.find(r=>r.id===QUARANTINE).conditionGroup[0].conditions[0].value=handover.rules.find(r=>r.id===QUARANTINE).conditionGroup[0].conditions[0].value.filter(h=>h!==CURRENT);
 const final=structuredClone(handover);let count=0;
 for(const group of final.rules.find(r=>r.id===PUBLIC).conditionGroup)for(const c of group.conditions)if(c.type==='host'&&Array.isArray(c.value))c.value=c.value.map(h=>{if(h!==CURRENT)return h;count++;return url.hostname;});
 if(count!==4||canonical(privateWaf.rules.find(r=>r.id===PUBLIC))!==canonical(baseline.rules.find(r=>r.id===PUBLIC))||canonical(handover.rules.find(r=>r.id===PUBLIC))!==canonical(baseline.rules.find(r=>r.id===PUBLIC)))fail();
 const undo=structuredClone(final);undo.rules.find(r=>r.id===QUARANTINE).conditionGroup[0].conditions[0].value=structuredClone(baseline.rules.find(r=>r.id===QUARANTINE).conditionGroup[0].conditions[0].value);
 for(const group of undo.rules.find(r=>r.id===PUBLIC).conditionGroup)for(const c of group.conditions)if(c.type==='host'&&Array.isArray(c.value))c.value=c.value.map(h=>h===url.hostname?CURRENT:h);
 if(canonical(undo)!==canonical(baseline))fail();
 const before=phase==='private'?baseline:phase==='handover'?privateWaf:handover,expected=phase==='private'?privateWaf:phase==='handover'?handover:final,ruleId=phase==='final'?PUBLIC:QUARANTINE;
 return {template,plan:{version:1,phase,templateHash:template.templateHash,sourceDigest:p.sourceDigest,deploymentId:stage.deploymentId,hostname:url.hostname,baselineHash:hash(protections(before,'bazaar')),expectedHash:hash(protections(expected,'bazaar')),publicConditionGroups:22,maximumDraftPatches:1,maximumActivations:1,newPayments:0},expected,body:{action:'rules.update',id:ruleId,value:ruleValue(expected.rules.find(r=>r.id===ruleId))}};
}
