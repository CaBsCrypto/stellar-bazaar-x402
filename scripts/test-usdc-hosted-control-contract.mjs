import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// Replay public receipts through the actual pure parser in the effect driver.
// Do not import the driver: its entry point may decrypt or mutate external state.
const source=await readFile('scripts/usdc-sale-vercel.mjs','utf8');
const summary=source.match(/^function summaryDeployment\(value\)\{[^\n]+\}$/m)?.[0];
const digest=source.match(/^const digest=value=>[^\n]+;$/m)?.[0];
const parseCreate=source.match(/const deployment=summaryDeployment\([^;]+\);/)?.[0];
assert.ok(summary&&digest&&parseCreate,'CONTROL_PURE_PARSER_SEAM_MISSING');
const context=vm.createContext({createHash,Buffer});
vm.runInContext(summary+'\n'+digest,context);
for(const name of ['hosted-deploy-probe-create','hosted-deploy-initial-create','closed-preview-create']){
 const receipt=JSON.parse((await readFile('docs/evidence/sprint-marketplace/'+name+'.json','utf8')).replace(/^\uFEFF/,''));
 assert.equal(receipt.status,'ok');context.result=receipt;
 const parsed=vm.runInContext('(function(){'+parseCreate+'return deployment;})()',context);
 assert.equal(parsed.id,receipt.deployment.id);assert.equal(parsed.url,receipt.deployment.url);
 assert.equal(parsed.readyState,receipt.deployment.readyState);
 assert.equal(parsed.target,'preview');assert.equal(parsed.protectionEnabled,true);
}
context.bytes=Buffer.from('source bytes\nwith UTF-8: energía');
assert.equal(vm.runInContext('digest(bytes)',context),createHash('sha256').update(context.bytes).digest('hex'));
context.result={id:'dpl_public_fixture',url:'fixed-preview.vercel.app',readyState:'READY',target:null,meta:{usdcSourceSha:'a'.repeat(40),gitCommitSha:'b'.repeat(40),usdcPayloadFingerprint:'c'.repeat(64)}};
const api=vm.runInContext('summaryDeployment(result)',context);
assert.equal(api.sourceSha,'a'.repeat(40));assert.equal(api.gitCommitSha,'b'.repeat(40));
assert.equal(api.payloadFingerprint,'c'.repeat(64));assert.equal(api.url,'https://fixed-preview.vercel.app');
assert.equal(api.protectionEnabled,null);assert.equal(api.protectionObservation,'unknown');
console.log(JSON.stringify({status:'PASS',publicCliReceipts:3,rawSourceBytesHashed:true,networkRequests:0,secretReads:0}));
