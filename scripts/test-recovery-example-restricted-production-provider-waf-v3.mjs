import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {sha} from './recovery-example-restricted-production-package.mjs';
import {restrictedExampleProviderWafPlanV3} from './recovery-example-restricted-production-provider-waf-v3.mjs';
const snapshot=JSON.parse(await readFile('.vercel/recovery-example-budget2-preview-provider-waf-baseline.json'));
const baseline=snapshot.providerWaf;
const configuration={operatorIp:'192.0.2.123',stagedHostname:'ai-video-scriptwriter-example123.vercel.app'};
const plan=restrictedExampleProviderWafPlanV3(baseline,configuration);let checks=0;
const check=fn=>{fn();checks++;};
const rejects=fn=>check(()=>assert.throws(fn));
check(()=>{assert.equal(plan.conditionGroups,12);assert(plan.oldCases>500);assert(plan.newCases>500);assert.equal(plan.priorGuionPolicyPreserved,true);assert.equal(plan.cloudWrites,0);assert.equal(plan.ssoproofStillRequired,true);assert.equal(plan.deploymentProtectionChanged,false);});
check(()=>assert.deepEqual(plan.publicPaths.map(p=>[p.method,p.path]),[['GET','/.well-known/stellar-bazaar-provider.txt'],['GET','/health'],['GET','/v1/bazaar-recovery-example/availability'],['POST','/v1/bazaar-recovery-example'],['POST','/api/bazaar/example/tick']]));
check(()=>assert.equal(plan.edits.length,1));
check(()=>assert.equal(plan.profile,'example-text-wire/v3'));
check(()=>assert.equal(plan.healthEvidence,'Static liveness only; authenticated runtime storage and readiness remain separate gates.'));
const priorV2=await readFile('scripts/recovery-example-restricted-production-provider-waf.mjs');check(()=>assert.equal(sha(priorV2),'94af8efa649ecf048c099da503fa5c85cef9cd08b7cde6bdcc3d091b124795cb'));
check(()=>{const known=snapshot.providerWaf;assert.equal(known.projectKey,'prj_cHsv0UIK31fRuLBXkW5RXkz4eU9K#active');assert.equal(snapshot.status,'CURRENT_ACTIVE_WAF_BASELINE_NO_DRAFT_REUSED');});
check(()=>assert.deepEqual(baseline,snapshot.providerWaf));
rejects(()=>restrictedExampleProviderWafPlanV3(baseline,{...configuration,operatorIp:'*'}));
rejects(()=>restrictedExampleProviderWafPlanV3(baseline,{...configuration,stagedHostname:'ai-video-scriptwriter.vercel.app'}));
rejects(()=>restrictedExampleProviderWafPlanV3({...baseline,ownerId:'other'},configuration));
rejects(()=>restrictedExampleProviderWafPlanV3({...baseline,projectKey:baseline.projectKey.replace('#active','#draft')},configuration));
const altered=structuredClone(baseline);altered.rules[0].conditionGroup.push({conditions:[{type:'path',op:'re',value:'^'}]});
rejects(()=>restrictedExampleProviderWafPlanV3(altered,configuration));
const unrelated=structuredClone(baseline);unrelated.rules.push({id:'rule_unrelated_guard',name:'keep exact',description:'retained guard',active:true,conditionGroup:[{conditions:[{type:'path',op:'eq',value:'/unrelated-original'}]}],action:{mitigate:{action:'deny'}}});
check(()=>{const got=restrictedExampleProviderWafPlanV3(unrelated,configuration);assert.deepEqual(got.expected.rules.find(r=>r.id==='rule_unrelated_guard'),unrelated.rules.at(-1));});
const conflict=structuredClone(baseline);conflict.rules.push({id:'rule_new_host_conflict',name:'deny every route',description:'cannot weaken',active:true,conditionGroup:[{conditions:[{type:'path',op:'re',value:'^'}]}],action:{mitigate:{action:'deny'}}});
rejects(()=>restrictedExampleProviderWafPlanV3(conflict,configuration));
const evidence={version:1,status:'PASS_PURE_RESTRICTED_PRODUCTION_PROVIDER_WAF_V3',checks,oldHostMatrixCases:plan.oldCases,newHostMatrixCases:plan.newCases,
  sourceSha256:sha(await readFile('scripts/recovery-example-restricted-production-provider-waf-v3.mjs')),
  baselinePublicFingerprint:plan.baselineHash,exactPublicMethodsAndPaths:plan.publicPaths,priorGuionPolicyPreserved:true,
  testScope:'Offline predicate matrix from root-prepared active provider baseline before the accepted budget2 Preview, with restore receipt checked separately; fresh Production readback and Deployment Protection access remain required.',
  cloudWrites:0,networkRequests:0,dpapiReads:0,operatorIpInOutput:false,secretValuesReturned:0,productionPublished:false,cronActivated:false,payments:0};
const path='docs/evidence/recovery-example-restricted-production-provider-waf-v3-local-2026-10-13.json';
await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...evidence,evidence:path}));
