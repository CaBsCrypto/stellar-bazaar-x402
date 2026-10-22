import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureGuardianCleanupCatalog} from './recovery-example-guardian-cleanup-catalog.mjs';
const result=await captureGuardianCleanupCatalog();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
equal(result.rows.length,2);equal(result.networkRequests,0);equal(result.realRedisLua,false);equal(result.ledgerWrites,0);equal(result.financialSubmissions,0);
for(const [index,row]of result.rows.entries()){
 equal(row.maximumRedisCommands,index===0?17:14);equal(row.keyCount,index===0?6:5);equal(row.argCount,index===0?21:19);equal(row.budgetReleaseCount,index===0?1:0);
 equal(row.scriptSha256,createHash('sha256').update(result.localScriptFixtures[index].script).digest('hex'));equal(row.maximumResponseBytes,8192);
 // The no-release branch is the reviewed plain CAS. The batch-release branch
 // has its own exact hash and must be added to a guardian-only catalog.
 equal(row.matchedExampleCatalog,index!==0);
}
equal(JSON.stringify(result).includes('SYNTHETIC EXPIRED TEXT'),false);equal(JSON.stringify(result).includes('localScriptFixtures'),false);
console.log(JSON.stringify({...result,checks}));
