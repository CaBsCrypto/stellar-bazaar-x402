import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertClaimDiagnostic} from './recovery-example-native-claim-local-v2.mjs';
const diagnostic=JSON.parse(await readFile(new URL('../docs/evidence/recovery-example-local-v2b-readonly-diagnostic-2026-10-13.json',import.meta.url))),prior=JSON.parse(await readFile(new URL('../docs/evidence/recovery-example-native-local-measurement-new-v2-2026-10-13.json',import.meta.url))),source=await readFile(new URL('./recovery-example-native-claim-local-v2.mjs',import.meta.url),'utf8');
const family=diagnostic.familyFingerprint;let checks=0;
// Exact real public antecedents are pinned by the driver without learning the
// private family, actors, Redis access or journal encryption key.
assert.doesNotThrow(()=>assertClaimDiagnostic(diagnostic,prior,family));checks++;
assert.throws(()=>assertClaimDiagnostic(diagnostic,prior,'f'.repeat(64)),/EXACT_UNEXECUTED_LOCAL_V2_CLAIM_DIAGNOSTIC_REQUIRED/);checks++;
for(const patch of [{status:'not-confirmed'},{redisWrites:1},{redisEvalRequests:1}]){assert.throws(()=>assertClaimDiagnostic({...diagnostic,...patch},prior,family));checks++;}
for(const path of [['market','phase','executing'],['market','attemptPresent',true],['worker','phase','provider-started'],['runtime','present',true]]){const row=structuredClone(diagnostic);row.diagnostics[path[0]][path[1]]=path[2];assert.throws(()=>assertClaimDiagnostic(row,prior,family));checks++;}
for(const forbidden of ['authorizeEntry(','.settle(','.verify(','.transaction(','.initializeSellerStorage(','createRecoveryExampleTickHandler(','createRecoveryExampleRuntimeHandler(','nativeMarket.orders.POST(','Keypair.fromRaw']){assert.equal(source.includes(forbidden),false,forbidden);checks++;}
assert.ok(source.includes("['initialize','notifications/initialized','claim_market_order']"));checks++;
assert.ok(source.includes("['GET','EVAL'].includes(name)"));checks++;
assert.ok(source.includes('serializeRequests:true'));checks++;
assert.ok(source.includes('unsupportedCommandMetadata:unsupported'));checks++;
assert.ok(source.includes('counts.unsupportedCommand=true;globalThis.__exampleNativeUnsupported?.(request.body);'));checks++;
assert.ok(source.includes('nativeResponseFailureDiagnostic(response,{tool})'));checks++;
console.log(JSON.stringify({status:'PASS_LOCAL_V2_CLAIM_ONLY_PREPARATION',checks,sourceSha256:createHash('sha256').update(source).digest('hex'),networkRequests:0,redisCommands:0,privateProfilesRead:0,signatures:0,providerExecutions:0}));
