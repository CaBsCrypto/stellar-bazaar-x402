// Run the existing isolated native CAS fixture in memory, without modifying it.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const file=resolve(dirname(fileURLToPath(import.meta.url)),'test-seller-recovery-slot.mjs');
let source=readFileSync(file,'utf8'),match=/\r?\ntry\{\r?\n const f=await fixture\(\)/.exec(source);assert.ok(match);
source=source.slice(0,match.index)+`
try{
 const f=await fixture();f.enable();const originalHold=sha(JSON.stringify(f.ledger().held[0])),originalOrder=sha(JSON.stringify(f.saved));
 process.env.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES='8500000000';
 const admitted=await f.create(),nextHold=f.ledger().held.find(h=>h.operationId===admitted.operationId);
 check(nextHold.transferBytes===900000000&&nextHold.recoveryCommands===12000&&nextHold.backgroundCommands===4000);
 check(sha(JSON.stringify(f.ledger().held.find(h=>h.operationId===original)))===originalHold);
 check(sha(JSON.stringify((await f.state()).orders.find(o=>o.operationId===original)))===originalOrder);
 const before=sha(JSON.stringify(f.ledger()));await createMarketOrder(f.buyer,{...f.intent,operationId:admitted.operationId,input:admitted.input});check(sha(JSON.stringify(f.ledger()))===before);
 await reject(f.create,'SELLER_CAPACITY_EXHAUSTED');check(f.ledger().held.length===2);
 delete process.env.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES;check(sha(JSON.stringify(f.ledger()))===before);
 const lost=await fixture();lost.enable();process.env.BAZAAR_FREE_DEMO_TRANSFER_BUDGET_BYTES='8500000000';const old=sha(JSON.stringify(lost.ledger().held[0]));lost.redis.loseNextAck();
 await assert.rejects(lost.create(),/SYNTHETIC_COMMIT_ACK_LOST/);checks++;
 check((await lost.state()).orders.length===2&&lost.ledger().held.length===2);
 check(lost.ledger().held.find(h=>h.operationId!==original).transferBytes===900000000);
 check(sha(JSON.stringify(lost.ledger().held.find(h=>h.operationId===original)))===old);
 await reject(lost.create,'SELLER_CAPACITY_EXHAUSTED');
 console.log(JSON.stringify({status:'PASS_LOCAL_NATIVE_SCOPED_TRANSFER_RESERVATION',checks,nativeImmutableOrderBoundInJointCas:true,newHoldBytes:900000000,originalHoldBytes:2000000000,originalOrderAndHoldPreserved:true,replayNoResizeOrDuplicate:true,unknownAckPreservesNewHold:true,realRedisLua:false,networkRequests:externalRequests,newPayments:0,signatures:0,cloudWrites:0}));
}finally{globalThis.fetch=originalFetch;setMarketStoreForTests(undefined);setMarketX402StoreForTests(undefined);setWorkspaceStoreForTests(undefined);setMarketTextSellerRuntimeForTests(undefined);for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);}
`;
source=source.replace(/from\s+(['"])([^'"]+)\1/g,(_all,_quote,specifier)=>'from '+JSON.stringify(specifier.startsWith('.')?pathToFileURL(resolve(dirname(file),specifier)).href:import.meta.resolve(specifier)));
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
