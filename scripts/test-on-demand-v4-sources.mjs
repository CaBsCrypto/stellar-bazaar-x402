import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertV4CreationGuardPatch,inspectV4Sources,V4_PROVIDER_REFERENCE} from './prepare-on-demand-v4-sources.mjs';
const old=await readFile('.vercel/continuous-on-demand-v2-bazaar-production-source/lib/marketplace.ts'),patched=await readFile('lib/marketplace.ts');let checks=0;
assert.deepEqual(assertV4CreationGuardPatch(old,patched).changedPaths,['lib/marketplace.ts']);checks++;
assert.deepEqual(assertV4CreationGuardPatch(old,Buffer.from(patched.toString().replaceAll('\r\n','\n'))).changedPaths,['lib/marketplace.ts']);checks++;
for(const text of [old.toString(),patched.toString().replace('walletIdentity(p)','walletIdentity({...p,generation:99})'),patched.toString().replace('reserveSellerCapacity(s,order);',''),patched.toString().replace("amount:service.card.payment.amount","amount:'1'"),patched.toString()+'\nexport const unreviewed=true;']){assert.throws(()=>assertV4CreationGuardPatch(old,Buffer.from(text)));checks++;}
const result=await inspectV4Sources();assert.equal(result.plan.candidates.length,2);checks++;
for(const m of result.plan.candidates){assert.equal(m.files.length,342);assert.equal(m.changedSourceFiles,1);assert.equal(m.configurationChanged,undefined);assert.equal(m.environmentChanges,false);assert.equal(m.networkRequests,0);assert.equal(m.providerSourceUnchanged,V4_PROVIDER_REFERENCE.sourceDigest);assert.deepEqual(m.changes.map(v=>v.path),['lib/marketplace.ts']);assert.deepEqual(m.cronSchedules,m.environment==='preview'?[]:[{path:'/api/market/guardian/tick',schedule:'0 * * * *'}]);checks+=8;}
assert.equal(result.plan.providerReference.files,22);assert.deepEqual(result.plan.providerReference.cronSchedules,[]);checks+=2;
console.log(JSON.stringify({status:'PASS_LOCAL_V4_ONE_FILE_SOURCE_PLAN',checks,networkRequests:0,dpapiReads:0,cloudWrites:0,payments:0,oldSnapshotsModified:false,planDigest:result.plan.planDigest}));
