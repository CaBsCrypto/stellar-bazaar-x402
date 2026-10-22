import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {sha} from './recovery-example-restricted-production-package.mjs';
import {restrictedExampleProviderWafPlan} from './recovery-example-restricted-production-provider-waf.mjs';
const snapshot=JSON.parse(await readFile('.vercel/recovery-example-budget-preview-provider-waf-baseline.json'));
const baseline=snapshot.providerWaf;
const configuration={operatorIp:'192.0.2.123',stagedHostname:'ai-video-scriptwriter-example123.vercel.app'};
const plan=restrictedExampleProviderWafPlan(baseline,configuration);let checks=0;
const check=fn=>{fn();checks++;};
const rejects=fn=>check(()=>assert.throws(fn));
check(()=>{assert.equal(plan.conditionGroups,11);assert(plan.oldCases>500);assert(plan.newCases>500);assert.equal(plan.priorGuionPolicyPreserved,true);assert.equal(plan.cloudWrites,0);assert.equal(plan.ssoproofStillRequired,true);assert.equal(plan.deploymentProtectionChanged,false);});
check(()=>assert.deepEqual(plan.publicPaths.map(p=>[p.method,p.path]),[['GET','/.well-known/stellar-bazaar-provider.txt'],['GET','/v1/bazaar-recovery-example/availability'],['POST','/v1/bazaar-recovery-example'],['POST','/api/bazaar/example/tick']]));
check(()=>assert.equal(plan.edits.length,1));
check(()=>assert.deepEqual(baseline,snapshot.providerWaf));
rejects(()=>restrictedExampleProviderWafPlan(baseline,{...configuration,operatorIp:'*'}));
rejects(()=>restrictedExampleProviderWafPlan(baseline,{...configuration,stagedHostname:'ai-video-scriptwriter.vercel.app'}));
rejects(()=>restrictedExampleProviderWafPlan({...baseline,ownerId:'other'},configuration));
rejects(()=>restrictedExampleProviderWafPlan({...baseline,projectKey:baseline.projectKey.replace('#active','#draft')},configuration));
const altered=structuredClone(baseline);altered.rules[0].conditionGroup.push({conditions:[{type:'path',op:'re',value:'^'}]});
rejects(()=>restrictedExampleProviderWafPlan(altered,configuration));
const unrelated=structuredClone(baseline);unrelated.rules.push({id:'rule_unrelated_guard',name:'keep exact',description:'retained guard',active:true,conditionGroup:[{conditions:[{type:'path',op:'eq',value:'/unrelated-original'}]}],action:{mitigate:{action:'deny'}}});
check(()=>{const got=restrictedExampleProviderWafPlan(unrelated,configuration);assert.deepEqual(got.expected.rules.find(r=>r.id==='rule_unrelated_guard'),unrelated.rules.at(-1));});
const conflict=structuredClone(baseline);conflict.rules.push({id:'rule_new_host_conflict',name:'deny every route',description:'cannot weaken',active:true,conditionGroup:[{conditions:[{type:'path',op:'re',value:'^'}]}],action:{mitigate:{action:'deny'}}});
rejects(()=>restrictedExampleProviderWafPlan(conflict,configuration));
const evidence={version:1,status:'PASS_PURE_RESTRICTED_PRODUCTION_PROVIDER_WAF',checks,oldHostMatrixCases:plan.oldCases,newHostMatrixCases:plan.newCases,
  sourceSha256:sha(await readFile('scripts/recovery-example-restricted-production-provider-waf.mjs')),
  baselinePublicFingerprint:plan.baselineHash,exactPublicMethodsAndPaths:plan.publicPaths,priorGuionPolicyPreserved:true,
  testScope:'Offline predicate matrix from historical restored provider baseline; fresh Production readback and Deployment Protection access remain required.',
  cloudWrites:0,networkRequests:0,dpapiReads:0,operatorIpInOutput:false,secretValuesReturned:0,productionPublished:false,cronActivated:false,payments:0};
const path='docs/evidence/recovery-example-restricted-production-provider-waf-local-2026-10-13.json';
await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...evidence,evidence:path}));
