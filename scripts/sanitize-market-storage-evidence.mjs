import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

// Read the private operational report, never either credential file. Only
// fixed status codes, approved check labels and counters can enter evidence.
try{
const input=JSON.parse(readFileSync(resolve('.vercel/market-storage-validation.json'),'utf8'));
assert.equal(input.version,1);assert.equal(input.hosted,false);
assert.equal(input.scope,'local handlers with isolated actual backends');
assert.match(input.date,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
assert.match(input.candidate??'',/^[a-f0-9]{40}$/);
assert.ok(['pass-direct-only','pass','not-run'].includes(input.r2));
assert.ok(['pass','not-run'].includes(input.redis));
const fixedChecks=new Set([
 'two real persisted public workspace accounts','unpaid order cannot upload',
 'buyer cannot prepare seller files','real Redis reserves manifest',
 'manifest recovered after reconstructed stores','interrupted upload remains explicitly absent',
 'R2 direct interrupted upload explicitly absent','R2 rejects corrupt checksum',
 'R2 rejects altered signed MIME','R2 rejects altered signed length',
 'delivery response loss recovers same order','seller cannot obtain buyer file URLs',
 'anonymous file access rejected','buyer human receives private access',
 'actual short signed GET expires','expired buyer access denied',
 'real backends archive and delete first pass','archived control has no file names/results',
 'actual repeated deletion releases reservation',
]);
const assetCheck=/^(R2 private upload|actual HEAD confirms|actual GET bytes|actual Range 206|unsigned object denied|R2 direct upload|R2 conditional overwrite denied|R2 direct actual HEAD|R2 direct GET bytes|R2 direct Range 206|R2 direct unsigned object denied) (image|video|captions)$/;
const checks=(input.checks??[]).filter(check=>typeof check==='string'&&(fixedChecks.has(check)||assetCheck.test(check)));
assert.equal(checks.length,input.checks?.length,'UNKNOWN_CHECK_LABEL');
const objects=input.syntheticObjects,keys=input.syntheticRedisKeys;
assert.ok(Number.isInteger(objects)&&objects>=0&&objects<=10);
assert.ok(Number.isInteger(keys)&&keys>=0&&keys<=20);
const evidence={
 version:1,date:input.date,candidateBaseCommit:input.candidate,candidateWorkingTree:'uncommitted sources at invocation',
 scope:'isolated local process; actual storage backends only where marked',
 r2:input.r2,redis:input.redis,hosted:false,actualTransactions:0,providerExecutions:0,
 payment:'local dependency fixture only; no payment in direct-storage mode',
 checks,cleanup:{r2:input.cleanup?.r2===true,redis:keys?input.cleanup?.redis===true:'not-applicable'},
 syntheticObjects:objects,syntheticRedisKeys:keys,complete:input.ok===true,
 pending:['hosted preview HTTP/MCP and browser flow','authorized real Testnet payment and provider execution','seven-day wall-clock and lifecycle verification',...(input.redis==='not-run'?['real Redis account, order and retention acceptance']:[])],
};
const path=resolve('docs/evidence/market-storage-isolated/storage-backend-validation.json');
mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({sanitized:true,checks:checks.length,r2:evidence.r2,redis:evidence.redis,complete:evidence.complete}));
}catch{console.error(JSON.stringify({sanitized:false,code:'INVALID_VALIDATION_REPORT'}));process.exitCode=1;}
