import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unsignedChallengeTypedBounds} from './recovery-example-unsigned-challenge-typed-bounds.mjs';
const report=unsignedChallengeTypedBounds();let assertions=0;const eq=(a,b)=>{assert.deepEqual(a,b);assertions++;};
eq(report.paths.firstChallenge.rest,21);eq(report.paths.firstChallenge.commands,75);eq(report.paths.existingChallenge.rest,12);eq(report.paths.existingChallenge.commands,45);eq(report.paths.knownConfirmedOrderRepair.rest,22);assert.ok(report.maximumCombinedBytes<36*1048576);assertions++;eq(report.maximumCommandUpperBound,81);eq(report.financialHandlerInvocations,0);eq(report.networkRequests,0);eq(report.payments,0);
const x402=await readFile(new URL('../lib/marketplace-x402.ts',import.meta.url),'utf8'),unsigned=x402.slice(x402.indexOf('if(!signature){'),x402.indexOf('const proof=parseProof(signature'));
assert.ok(unsigned.includes("record.phase==='confirmed'"));assertions++;assert.ok(unsigned.includes('finalizePaid(deps,o,record)'));assertions++;assert.ok(unsigned.includes("record.phase!=='challenged'"));assertions++;for(const forbidden of ['facilitator','deps.rpc','parseProof','settle(','verify(','sign(']){assert.ok(!unsigned.includes(forbidden));assertions++;}
const finalize=x402.slice(x402.indexOf('async function finalizePaid('),x402.indexOf('function paidResponse('));assert.ok(finalize.includes("if(record.phase!=='confirmed'){"));assertions++;assert.ok(finalize.indexOf("if(record.phase!=='confirmed'){")<finalize.indexOf('deps.rpc.transaction'));assertions++;
const signed=x402.slice(x402.indexOf('const proof=parseProof(signature'));assert.ok(signed.includes('deps.facilitator.verify'));assertions++;assert.ok(signed.includes('deps.facilitator.settle'));assertions++;
const ingress=await readFile(new URL('../lib/workspace-http.ts',import.meta.url),'utf8');assert.ok(ingress.includes('demoIngress(request)'));assertions++;
console.log(JSON.stringify({...report,status:'PASS_UNSIGNED_X402_CHALLENGE_TYPED_REGRESSION',assertions}));
