// Offline synthetic-only test. No real private journal, DPAPI or network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expectedProductionAcceptance as E,createAcceptanceBindingFromOnboarding} from '../.vercel/continuous-production-acceptance-binding.mjs';
import {SEALED_ADMISSION_POLICY as C,inspectExistingSealedAdmission,sealedAdmissionControl} from '../.vercel/facilitator-repaired-restricted-sealed-admission.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const canon=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canon(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canon(v[k]))])):v);
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const baseReceipt=JSON.parse(await readFile(new URL('../.vercel/continuous-production-bazaar-environment-receipt.json',import.meta.url)));
const baseLatest=JSON.parse(await readFile(new URL('../.vercel/on-demand-v3-production-bazaar-environment-receipt.json',import.meta.url)));
const baseUpdate=JSON.parse(await readFile(new URL('../docs/evidence/facilitator-testnet-access-repair-secret-update-2026-10-12.json',import.meta.url)));
const timestamp='2026-10-12T18:00:00.000Z';
function fixture(){
 const owner='ow_'+'1'.repeat(32),operator='a'.repeat(43),binding=createAcceptanceBindingFromOnboarding({version:1,type:'bazaar-text-production-onboarding-validation',phase:'validated',origin:E.origin,serviceId:E.serviceId,intentId:E.onboardingIntentId,deploymentId:E.bazaarDeploymentId,sequence:3,packet:{creationId:E.creationId,origin:E.origin},source:{candidate:E.candidate,bazaarSourceDigest:E.bazaarSourceDigest,providerSourceDigest:E.providerSourceDigest,manifestSha256:E.manifestSha256},receipt:{creationId:E.creationId,ownerId:owner,agentId:'agent_'+'2'.repeat(32),workspaceId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',generation:1,revoked:false}},{preparedAt:timestamp,bindingId:'11111111-2222-4333-8444-555555555555'});
 const policy={...C,accountFingerprint:sha(owner),bindingSha256:sha(canon(binding))};
 const receipt={...structuredClone(baseReceipt),bindingSha256:policy.bindingSha256,operatorHash:sha(operator)},activationRecord={type:'bazaar-text-service-production-activation',bazaarOrigin:C.origin,namespaceFamily:C.namespaceFamily,operatorAccess:operator,operatorHash:sha(operator)};
 return {value:{binding,activationRecord,receipt,latestReceipt:structuredClone(baseLatest),update:structuredClone(baseUpdate),observedAt:timestamp},policy,owner,operator};
}
const f=fixture(),before=structuredClone(f.value),proof=inspectExistingSealedAdmission(f.value,{policy:f.policy});
equal(f.value,before);equal(proof.status,'PASS_EXISTING_SEALED_ONE_ACCOUNT_PURCHASE_BINDING');equal(proof.accountCountBound,1);equal(proof.allowlistAbsentOrEmpty,false);equal(proof.runtimeMembershipProven,false);equal(proof.productionSecretReferenceUnchanged,true);equal(proof.accountFingerprint,f.policy.accountFingerprint);equal(proof.bindingSha256,f.policy.bindingSha256);
for(const k of ['networkRequests','newCredentials','environmentWrites','newPayments','signatures','settlements','ownerIdsInOutput','credentialValuesInOutput'])equal(proof[k],0);
equal(JSON.stringify(proof).includes(f.owner),false);equal(JSON.stringify(proof).includes(f.operator),false);equal(JSON.stringify(proof).includes(f.value.receipt.operatorHash),false);
for(const mutate of [v=>v.binding.ownerIds=[],v=>v.binding.ownerIds.push('ow_'+'3'.repeat(32)),v=>v.receipt.bindingSha256='f'.repeat(64),v=>v.activationRecord.operatorAccess='b'.repeat(43),v=>v.activationRecord.namespaceFamily='foreign',v=>v.activationRecord.bazaarOrigin='https://foreign.invalid',v=>v.receipt.releaseSecretReferences.find(r=>r.key==='BAZAAR_MARKET_BUYER_ALLOWLIST_JSON').id='FOREIGN',v=>v.latestReceipt.environmentReferences.find(r=>r.key==='BAZAAR_MARKET_BUYER_ALLOWLIST_JSON').updatedAt++,v=>v.update.environmentWrites=2,v=>v.update.afterEnvironmentMetadataSha256='f'.repeat(64),v=>v.observedAt='invalid']){const x=fixture();mutate(x.value);assert.throws(()=>inspectExistingSealedAdmission(x.value,{policy:x.policy}));checks++;}
let reads=0,writes=0,ctx;const x=fixture();
const deps={policy:x.policy,authority:async()=>({receipt:x.value.receipt,latestReceipt:x.value.latestReceipt,update:x.value.update}),readBinding:async()=>{reads++;return structuredClone(x.value.binding);},readActivation:async()=>{reads++;ctx={record:structuredClone(x.value.activationRecord),profile:{},acl:{}};return ctx;},snapshot:async()=>({synthetic:'unchanged'}),now:()=>Date.parse(timestamp),writeExclusive:async value=>{writes++;equal(value.runtimeMembershipProven,false);}};
const checked=await sealedAdmissionControl('check',undefined,deps);equal(checked.dpapiReads,0);equal(reads,0);equal(writes,0);
const result=await sealedAdmissionControl('read',undefined,deps);equal(reads,2);equal(writes,1);equal(result.privateFilesUnchanged,true);equal(ctx.record,null);equal(ctx.profile,null);equal(ctx.acl,null);
const bad=fixture();let failedWrites=0,snapshots=0;
await assert.rejects(()=>sealedAdmissionControl('read',undefined,{...deps,policy:bad.policy,authority:async()=>({receipt:bad.value.receipt,latestReceipt:bad.value.latestReceipt,update:bad.value.update}),readBinding:async()=>structuredClone(bad.value.binding),readActivation:async()=>({record:structuredClone(bad.value.activationRecord)}),snapshot:async()=>({synthetic:++snapshots}),writeExclusive:async()=>{failedWrites++;}}),/PRIVATE_ADMISSION_FILES_CHANGED_DURING_READ/);checks++;equal(failedWrites,0);
const code=await readFile(new URL('../.vercel/facilitator-repaired-restricted-sealed-admission.mjs',import.meta.url),'utf8');equal(code.includes('.loadActivation('),false);equal(code.includes('.append('),false);equal(code.includes('.createRuntime('),false);equal(code.includes('fetch('),false);
console.log(JSON.stringify({status:'PASS_OFFLINE_SEALED_ADMISSION_WITNESS',checks,networkRequests:0,actualDpapiReads:0,realPrivateJournalWrites:0,newCredentials:0,environmentWrites:0,newPayments:0,helperSha256:sha(code)}));
