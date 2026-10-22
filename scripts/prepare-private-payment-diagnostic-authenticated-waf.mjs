// Pure replacement of one already admitted private diagnostic hostname.
// No API, credentials, IP output, public exceptions or production promotion.
import {PRIVATE_DIAGNOSTIC_WAF_POLICY as BASE,validatePrivateDiagnosticReady} from './prepare-private-payment-diagnostic-waf.mjs';
import {v2WafHash as hash,v2WafCanonical as canonical,v2ProjectWafProtections as protections,v2WafRuleValue} from './prepare-on-demand-production-v3-waf.mjs';
const fail=code=>{throw Error(code);};
export const AUTHENTICATED_DIAGNOSTIC_WAF_POLICY=Object.freeze({
 baselineHash:'4d47b83da9460b5d59f1d39e6c3ffea7ce9111f1a72dbf0267cabf47990d4f2d',
 ruleId:BASE.ruleId,publicRuleId:BASE.publicRuleId,projectId:BASE.projectId,
 sourceDigest:'d558ae14b168fa99d10c37b9045c434b400f0c7b8abec1371248578bebe5705d',
 manifestSha256:'21bfd9f24f4e75bdd1ab31ac8df073e25c15e822d27165de83af42093e6eeb4e',
 parentSourceDigest:'842030bdaa7395668595c450fc3194adbbc403e46da81b0907acd69fc74d688e',
 parentManifestSha256:'296e9c6a48cbcaba4b3ab17fb795b6a1252436966e574009a73f7ba0098bd169',
 replacedHostname:'stellar-bazaar-x402-jftwtn3u9-cabscryptocontacto-6028s-projects.vercel.app',
 previousPrivateDeploymentId:'dpl_E122D5tPnuyrNbN9uMQc7kcrp6X7',
 olderPrivateHostname:'stellar-bazaar-x402-fyq6zyzn6-cabscryptocontacto-6028s-projects.vercel.app',
 neverAdmittedHostname:'stellar-bazaar-x402-mzl70tfzh-cabscryptocontacto-6028s-projects.vercel.app',
 originalDeploymentId:BASE.originalDeploymentId,providerDeploymentId:BASE.providerDeploymentId
});
const C=AUTHENTICATED_DIAGNOSTIC_WAF_POLICY;
export function validateAuthenticatedWafApproval(approval){
 if(!approval||Object.keys(approval).sort().join(',')!=='diagnosticPlanHash,reviewSha256'||['diagnosticPlanHash','reviewSha256'].some(k=>!/^[a-f0-9]{64}$/.test(approval[k]??'')))fail('EXACT_REVIEWED_AUTHENTICATED_DIAGNOSTIC_PINS_REQUIRED');
 return Object.freeze({...approval});
}
export function validatePrivateDiagnosticAuthenticatedReady(ready,approval){
 const a=validateAuthenticatedWafApproval(approval),hostname=validatePrivateDiagnosticReady(ready,{...BASE,...a,sourceDigest:C.sourceDigest,manifestSha256:C.manifestSha256});
 if(hostname===C.replacedHostname||hostname===C.olderPrivateHostname||hostname===C.neverAdmittedHostname||ready.deploymentId===C.previousPrivateDeploymentId||ready.baselineWafHash!==C.baselineHash||ready.privateWafUnchanged!==true||ready.noSystemBypasses!==true)fail('EXACT_NEW_AUTHENTICATED_DIAGNOSTIC_HOST_REQUIRED');
 return hostname;
}
export function buildPrivatePaymentDiagnosticAuthenticatedWaf(baseline,ready,approval){
 const a=validateAuthenticatedWafApproval(approval),hostname=validatePrivateDiagnosticAuthenticatedReady(ready,a);
 if(hash(protections(baseline,'bazaar'))!==C.baselineHash||baseline.rules.length!==2)fail('EXACT_ACTIVE_PROXY_PRIVATE_WAF_BASELINE_REQUIRED');
 const source=baseline.rules.find(r=>r.id===C.ruleId),publicRule=baseline.rules.find(r=>r.id===C.publicRuleId),condition=source?.conditionGroup?.[0]?.conditions?.[0];
 if(source?.active!==true||source.action?.mitigate?.action!=='deny'||source.conditionGroup.length!==1||source.conditionGroup[0].conditions.length!==1||condition.type!=='host'||condition.op!=='inc'||condition.neg!==true||!Array.isArray(condition.value)||condition.value.length!==5||new Set(condition.value).size!==5||condition.value.filter(h=>h===C.replacedHostname).length!==1||condition.value.includes(hostname)||condition.value.includes(C.neverAdmittedHostname)||publicRule?.active!==true||publicRule.action?.mitigate?.action!=='deny'||publicRule.conditionGroup.length!==22||canonical(publicRule).includes(hostname))fail('EXACT_FIVE_HOST_PRIVATE_QUARANTINE_REQUIRED');
 const index=condition.value.indexOf(C.replacedHostname),expected=structuredClone(baseline),q=expected.rules.find(r=>r.id===C.ruleId);
 q.conditionGroup[0].conditions[0].value[index]=hostname;
 const restored=structuredClone(expected);restored.rules.find(r=>r.id===C.ruleId).conditionGroup[0].conditions[0].value[index]=C.replacedHostname;
 if(canonical(protections(restored,'bazaar'))!==canonical(protections(baseline,'bazaar'))||canonical(expected.rules.find(r=>r.id===C.publicRuleId))!==canonical(publicRule))fail('ONLY_ONE_PRIVATE_HOST_REPLACEMENT_REQUIRED');
 const base={version:1,kind:'bazaar',mode:'replace-one-private-diagnostic-host',...a,sourceDigest:C.sourceDigest,manifestSha256:C.manifestSha256,parentSourceDigest:C.parentSourceDigest,parentManifestSha256:C.parentManifestSha256,deploymentId:ready.deploymentId,url:ready.url,hostname,replacedHostname:C.replacedHostname,replacedHostIndex:index,quarantineHosts:5,projectId:C.projectId,originalCanonicalDeploymentId:C.originalDeploymentId,providerDeploymentId:C.providerDeploymentId,baselineHash:C.baselineHash,expectedHash:hash(protections(expected,'bazaar')),ruleId:C.ruleId,readyReceiptHash:hash(ready),publicConditionGroups:22,operatorIpOnly:true,noPublicException:true,maximumDraftPatches:1,maximumActivations:1};
 return {plan:{...base,planHash:hash(base)},expected,body:{action:'rules.update',id:C.ruleId,value:v2WafRuleValue(q)}};
}
