// Pure replacement of one already admitted private diagnostic hostname.
// No API, credentials, IP output, public exceptions or production promotion.
import {PRIVATE_DIAGNOSTIC_WAF_POLICY as BASE,validatePrivateDiagnosticReady} from './prepare-private-payment-diagnostic-waf.mjs';
import {v2WafHash as hash,v2WafCanonical as canonical,v2ProjectWafProtections as protections,v2WafRuleValue} from './prepare-on-demand-production-v3-waf.mjs';
const fail=code=>{throw Error(code);};
export const PROXY_DIAGNOSTIC_WAF_POLICY=Object.freeze({
 baselineHash:'f3d9e6167a65c7745692cb6efda941d230ab4d4fde4a22118bc89430bfe82a05',
 ruleId:BASE.ruleId,publicRuleId:BASE.publicRuleId,projectId:BASE.projectId,
 sourceDigest:'842030bdaa7395668595c450fc3194adbbc403e46da81b0907acd69fc74d688e',
 manifestSha256:'296e9c6a48cbcaba4b3ab17fb795b6a1252436966e574009a73f7ba0098bd169',
 parentSourceDigest:'1f7003e09c59590cd6f332704dd369efe0775ad4d39ebcb74ea2bcead8c1520a',
 parentManifestSha256:'e984025ee50cf970ded769a86cb6a98318ad6f2d090c2ea13f196f1e2e9c9948',
 replacedHostname:'stellar-bazaar-x402-fyq6zyzn6-cabscryptocontacto-6028s-projects.vercel.app',
 neverAdmittedHostname:'stellar-bazaar-x402-mzl70tfzh-cabscryptocontacto-6028s-projects.vercel.app',
 originalDeploymentId:BASE.originalDeploymentId,providerDeploymentId:BASE.providerDeploymentId
});
const C=PROXY_DIAGNOSTIC_WAF_POLICY;
export function validateProxyWafApproval(approval){
 if(!approval||Object.keys(approval).sort().join(',')!=='diagnosticPlanHash,reviewSha256'||['diagnosticPlanHash','reviewSha256'].some(k=>!/^[a-f0-9]{64}$/.test(approval[k]??'')))fail('EXACT_REVIEWED_PROXY_DIAGNOSTIC_PINS_REQUIRED');
 return Object.freeze({...approval});
}
export function validatePrivateDiagnosticProxyReady(ready,approval){
 const a=validateProxyWafApproval(approval),hostname=validatePrivateDiagnosticReady(ready,{...BASE,...a,sourceDigest:C.sourceDigest,manifestSha256:C.manifestSha256});
 if(hostname===C.replacedHostname||hostname===C.neverAdmittedHostname)fail('EXACT_NEW_PROXY_DIAGNOSTIC_HOST_REQUIRED');
 return hostname;
}
export function buildPrivatePaymentDiagnosticProxyWaf(baseline,ready,approval){
 const a=validateProxyWafApproval(approval),hostname=validatePrivateDiagnosticProxyReady(ready,a);
 if(hash(protections(baseline,'bazaar'))!==C.baselineHash||baseline.rules.length!==2)fail('EXACT_ACTIVE_ORIGIN_PRIVATE_WAF_BASELINE_REQUIRED');
 const source=baseline.rules.find(r=>r.id===C.ruleId),publicRule=baseline.rules.find(r=>r.id===C.publicRuleId),condition=source?.conditionGroup?.[0]?.conditions?.[0];
 if(source?.active!==true||source.action?.mitigate?.action!=='deny'||source.conditionGroup.length!==1||source.conditionGroup[0].conditions.length!==1||condition.type!=='host'||condition.op!=='inc'||condition.neg!==true||!Array.isArray(condition.value)||condition.value.length!==5||new Set(condition.value).size!==5||condition.value.filter(h=>h===C.replacedHostname).length!==1||condition.value.includes(hostname)||condition.value.includes(C.neverAdmittedHostname)||publicRule?.active!==true||publicRule.action?.mitigate?.action!=='deny'||publicRule.conditionGroup.length!==22||canonical(publicRule).includes(hostname))fail('EXACT_FIVE_HOST_PRIVATE_QUARANTINE_REQUIRED');
 const index=condition.value.indexOf(C.replacedHostname),expected=structuredClone(baseline),q=expected.rules.find(r=>r.id===C.ruleId);
 q.conditionGroup[0].conditions[0].value[index]=hostname;
 const restored=structuredClone(expected);restored.rules.find(r=>r.id===C.ruleId).conditionGroup[0].conditions[0].value[index]=C.replacedHostname;
 if(canonical(protections(restored,'bazaar'))!==canonical(protections(baseline,'bazaar'))||canonical(expected.rules.find(r=>r.id===C.publicRuleId))!==canonical(publicRule))fail('ONLY_ONE_PRIVATE_HOST_REPLACEMENT_REQUIRED');
 const base={version:1,kind:'bazaar',mode:'replace-one-private-diagnostic-host',...a,sourceDigest:C.sourceDigest,manifestSha256:C.manifestSha256,parentSourceDigest:C.parentSourceDigest,parentManifestSha256:C.parentManifestSha256,deploymentId:ready.deploymentId,url:ready.url,hostname,replacedHostname:C.replacedHostname,replacedHostIndex:index,quarantineHosts:5,projectId:C.projectId,originalCanonicalDeploymentId:C.originalDeploymentId,providerDeploymentId:C.providerDeploymentId,baselineHash:C.baselineHash,expectedHash:hash(protections(expected,'bazaar')),ruleId:C.ruleId,readyReceiptHash:hash(ready),publicConditionGroups:22,operatorIpOnly:true,noPublicException:true,maximumDraftPatches:1,maximumActivations:1};
 return {plan:{...base,planHash:hash(base)},expected,body:{action:'rules.update',id:C.ruleId,value:v2WafRuleValue(q)}};
}
