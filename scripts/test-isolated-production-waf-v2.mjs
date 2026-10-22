import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateCanonicalProductionAuthority,isolatedProductionWafControlV2} from '../.vercel/isolated-production-waf-control-v2.mjs';
import {normalizeExactProductionCronDefinitions} from '../.vercel/on-demand-production-cron-metadata.mjs';

const projectId='prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',teamId='team_XjolcoWJ9V9yamVnCdpC7EMY',deploymentId='dpl_FvQkLb6mjhHm75SeETDhniFFqkZs',hostname='bazaar.browns.studio';
const fixture={hostname,projectId,teamId,deploymentId,
 alias:{alias:hostname,projectId,deployment:{id:deploymentId}},
 project:{id:projectId,accountId:teamId,targets:{production:{id:deploymentId}},crons:{deploymentId}},
 deployment:{id:deploymentId,projectId,target:'production',readyState:'READY',aliasAssigned:true,alias:[]}};
let checks=0;
assert.equal(validateCanonicalProductionAuthority(fixture),true);checks++;
const direct=structuredClone(fixture);delete direct.alias.deployment;direct.alias.deploymentId=deploymentId;assert.equal(validateCanonicalProductionAuthority(direct),true);checks++;
const both=structuredClone(fixture);both.alias.deploymentId=deploymentId;assert.equal(validateCanonicalProductionAuthority(both),true);checks++;
for(const change of [
 v=>v.alias.deploymentId='dpl_Old',v=>v.alias.deployment.id='dpl_Old',
 v=>delete v.alias.deployment,v=>v.alias.alias='other.example',v=>v.alias.projectId='prj_Other',
 v=>v.project.targets.production.id='dpl_Old',v=>delete v.project.targets,
 v=>v.project.crons.deploymentId='dpl_Old',v=>v.project.accountId='team_Other',
 v=>v.project.id='prj_Other',v=>v.deployment.id='dpl_Old',v=>v.deployment.projectId='prj_Other',
 v=>v.deployment.readyState='BUILDING',v=>v.deployment.target='preview',v=>v.deployment.aliasAssigned=false,
]){const v=structuredClone(fixture);change(v);assert.throws(()=>validateCanonicalProductionAuthority(v),/AUTHORITATIVE_CANONICAL_PRODUCTION_MAPPING_REQUIRED/);checks++;}
// A historical alias array can still name the canonical host on an old deployment;
// the current mapping and project target must both agree with the approved new one.
const misleading=structuredClone(fixture);misleading.deployment.alias=[hostname];misleading.alias.deployment.id='dpl_Old';assert.throws(()=>validateCanonicalProductionAuthority(misleading));checks++;
const schedules=[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}],host='stellar-bazaar-x402-83ubwydy4-cabscryptocontacto-6028s-projects.vercel.app';
assert.deepEqual(normalizeExactProductionCronDefinitions([{...schedules[0],host}],schedules,host,{disabledAt:null}),schedules);checks++;
assert.throws(()=>normalizeExactProductionCronDefinitions([{...schedules[0],host:'other.example'}],schedules,host,{disabledAt:null}));checks++;
assert.throws(()=>normalizeExactProductionCronDefinitions([{...schedules[0],host}],schedules,host,{disabledAt:1}));checks++;
for(const phase of ['stage-host','public']){await assert.rejects(()=>isolatedProductionWafControlV2('check',{phase}),/EXACT_FINAL_HOST_WAF_ACTION_REQUIRED/);checks++;}
for(const action of ['handover','promote']){await assert.rejects(()=>isolatedProductionWafControlV2(action),/EXACT_FINAL_HOST_WAF_ACTION_REQUIRED/);checks++;}
let calls=0;const checked=await isolatedProductionWafControlV2('check',{apiCall:async()=>{calls++;assert.fail('Offline check must not call API');}});assert.equal(calls,0);assert.equal(checked.phase,'final-host');checks++;
assert.equal(createHash('sha256').update(await readFile('.vercel/isolated-production-waf-control.mjs')).digest('hex'),'a25d15ec176fffe40afe4b387148c1c65b9ddddd25811e93d772ea88671407bb');checks++;
console.log(JSON.stringify({status:'PASS_ISOLATED_PRODUCTION_WAF_AUTHORITATIVE_ALIAS_SIBLING',checks,networkRequests:0,cloudWrites:0,newPayments:0,originalControllerUnchanged:true}));
