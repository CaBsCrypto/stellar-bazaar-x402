import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {issuer,solveFaucetPowParallel} from './provision-usdc-sale-wallets.mjs';

// Public protocol fixture only. This script never loads DPAPI or sends HTTP.
globalThis.fetch=()=>{throw Error('LOCAL_POW_MEASUREMENT_NO_NETWORK');};
const challenge={prefix:'sozu-faucet-v1',challengeId:'local-recovery-fixture-'+'a'.repeat(64),to:issuer,difficulty:24};
const limits={maxHashes:268435456,maxMs:90000,workers:4},prefix=challenge.prefix+':'+challenge.challengeId+':'+challenge.to+':';
const sourceHash=createHash('sha256').update(await readFile('scripts/provision-usdc-sale-wallets.mjs')).digest('hex'),started=Date.now();
const solution=await solveFaucetPowParallel(challenge,challenge.to,limits),activeExecutionMs=Date.now()-started;
const digest=createHash('sha256').update(prefix+solution.nonce).digest('hex');
assert.ok(digest.startsWith('000000'));assert.ok(activeExecutionMs<=limits.maxMs);assert.ok(Buffer.byteLength(prefix)>=100);
const report={status:'PASS_LOCAL_POW_DIFFICULTY_24',runtime:process.version,sourceHash,fixture:challenge,prefixBytes:Buffer.byteLength(prefix),limits,nonce:solution.nonce,hashes:solution.hashes,digest,activeExecutionMs,externalRequests:0,dpapiReads:0,seedsUsed:false,limitation:'One local fixture proves implementation and measured runtime; a fresh server challenge can still exhaust its explicit CPU allowance.'};
await writeFile('docs/evidence/sprint-marketplace/provider-faucet-pow-local.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
