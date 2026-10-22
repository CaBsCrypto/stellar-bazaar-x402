import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildContinuousProductionWafRule,continuousProductionWafReview,matchesWafGroups,baselineConfigurationSha256} from './prepare-continuous-production-waf-proposal.mjs';

const snapshot=JSON.parse(await readFile(new URL('../docs/evidence/continuous-waf-baseline-2026-10-11.json',import.meta.url),'utf8'));
const sourceRule=snapshot.sourceRule,hostname='stellar-bazaar-x402-synthetic-cabscryptocontacto-6028s-projects.vercel.app';
const result=buildContinuousProductionWafRule({sourceRule,configurationSha256:baselineConfigurationSha256,finalDeploymentHostname:hostname});
assert.equal(result.rule.id,sourceRule.id);assert.deepEqual(result.rule.action,sourceRule.action);assert.equal(result.rule.active,true);
assert.deepEqual(sourceRule,snapshot.sourceRule,'Pure builder must not alter the evidence object');
assert.equal(result.conditionGroups,22);assert.equal(result.remoteApplied,false);
const uuid='00000000-0000-4000-8000-000000000001';
const paths=['/','/demo','/catalogo','/open','/hub','/history','/publish','/api/mcp','/resources/guion-demo','/resources/guion-demo/qr.svg','/api/workspaces','/api/market/catalog','/api/market/services','/api/market/orders',`/api/market/orders/${uuid}/x402`,'/api/market/capacity','/api/market/guardian/tick','/api/market/guardian/tick/extra','/api/market/guardian','/market-review','/api/market/review','/api/market/control','/market-operations','/api/market/operations-budget','/examples/native-text-service-card.json','/examples/native-text-service-card.json/extra','/BUYER_AGENT_KIT.md','/BUYER_AGENT_KIT.md/extra','/downloads/bazaar-native-text-provider-kit.tgz','/downloads/bazaar-native-text-provider-kit.tgz/extra','/downloads/bazaar-native-text-provider-kit.manifest.json','/downloads/bazaar-native-text-provider-kit.manifest.json/extra','/BUYER.md','/SELLER_AGENT_KIT.md','/admin','/api/admin/magic-link','/api/x402/demo-pay','/unknown','/_next/static/chunks/demo.js'];
const previewHosts=sourceRule.conditionGroup[0].conditions.find(c=>c.type==='host'&&c.op==='inc').value;
const hosts=['bazaar.browns.studio',hostname,'stellar-bazaar-x402-foreign-cabscryptocontacto-6028s-projects.vercel.app','foreign.invalid',...previewHosts];
let cases=0;
for(const host of hosts)for(const environment of ['production','preview','development'])for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of paths)for(const ip_address of ['PRIVATE_LOCAL_IP','SYNTHETIC_EXTERNAL_IP']){
 const request={host,environment,method,path,ip_address};
 const expected=matchesWafGroups(sourceRule.conditionGroup,request)&&!matchesWafGroups(result.exactExceptions,request);
 assert.equal(matchesWafGroups(result.rule.conditionGroup,request),expected,JSON.stringify({host,environment,method,path,privateIp:ip_address==='PRIVATE_LOCAL_IP'}));cases++;
}
let inputRejections=0;
for(const finalDeploymentHostname of [undefined,'','*.vercel.app','foreign.vercel.app','https://'+hostname,hostname+'/api/mcp','stellar-bazaar-x402-cabscryptocontacto-6028s-projects.vercel.app']){assert.throws(()=>buildContinuousProductionWafRule({sourceRule,configurationSha256:baselineConfigurationSha256,finalDeploymentHostname}),/EXACT_READY_PRODUCTION_HOSTNAME_REQUIRED/);inputRejections++;}
assert.throws(()=>buildContinuousProductionWafRule({sourceRule,configurationSha256:'f'.repeat(64),finalDeploymentHostname:hostname}),/REVIEWED_WAF_BASELINE_REQUIRED/);inputRejections++;
const changed=structuredClone(sourceRule);changed.conditionGroup.pop();assert.throws(()=>buildContinuousProductionWafRule({sourceRule:changed,configurationSha256:baselineConfigurationSha256,finalDeploymentHostname:hostname}),/REVIEWED_WAF_BASELINE_REQUIRED/);inputRejections++;
const proposal=continuousProductionWafReview(snapshot);assert.equal(proposal.status,'PREPARED_NOT_APPLIED');assert.equal(proposal.actualRequestBody,null);assert.equal(proposal.readyProductionDeploymentHostname,null);assert.equal(proposal.approved,false);assert.equal(proposal.remoteApplied,false);
for(const path of proposal.privatePaths)for(const method of ['GET','HEAD','POST'])assert.equal(matchesWafGroups(result.rule.conditionGroup,{host:'bazaar.browns.studio',environment:'production',method,path,ip_address:'SYNTHETIC_EXTERNAL_IP'}),true);
console.log(JSON.stringify({status:'PASS',truthTableCases:cases,inputRejections,proposedConditionGroups:result.conditionGroups,baselineRuleUnchanged:true,exactExceptionsOnly:true,privateOperatorPathsRetained:true,networkRequests:0,remoteApplied:false,vercelSchemaAcceptance:false,readyProductionHostnameBound:false}));
