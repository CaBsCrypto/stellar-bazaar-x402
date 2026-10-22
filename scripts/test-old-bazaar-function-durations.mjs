import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectOldFunctionDurations} from './summarize-old-bazaar-function-durations.mjs';
const m=JSON.parse(await readFile('docs/evidence/facilitator-repaired-restricted-old-function-duration-metadata-2026-10-12.json'));
const b=JSON.parse(await readFile('docs/evidence/facilitator-repaired-restricted-old-function-duration-builds-2026-10-12.json'));
const p=inspectOldFunctionDurations(m,b);assert.equal(p.maximumFunctionDurationSeconds,60);assert.equal(p.recommendedDrainSeconds,80);assert.equal(p.deployedOutputAliases,217);assert.equal(p.uniqueFunctions,5);assert.equal(p.limits.find(x=>x.path==='api/market/guardian/tick').timeoutSeconds,60);assert.equal(p.limits.find(x=>x.path==='_middleware').timeoutSeconds,15);assert.equal(p.financialAcceptanceValidated,false);
for(const mutate of [x=>delete x.builds[0].output[0].lambda.timeout,x=>x.builds[0].output[0].lambda.timeout='max',x=>x.builds[0].output[0].lambda.runtime='edge',x=>x.builds[0].output=x.builds[0].output.filter(e=>e.path!=='_middleware'),x=>x.endpoint='/v11/deployments/another/builds',x=>x.builds[0].output.push(structuredClone(x.builds[0].output[0])),x=>x.builds[0].output[0].lambda.timeout=300]){const v=structuredClone(b);mutate(v);assert.throws(()=>inspectOldFunctionDurations(m,v));}
assert.throws(()=>inspectOldFunctionDurations({...m,sourceDigest:'f'.repeat(64)},b));console.log(JSON.stringify({status:'PASS_OLD_DEPLOYED_FUNCTION_DURATION_FIXTURES',checks:15,networkRequests:0,cloudWrites:0}));
