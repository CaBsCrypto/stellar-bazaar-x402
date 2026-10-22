// Prepare names and recipients only; no credentials, ACL, cloud or ledger IO.
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const sha=v=>createHash('sha256').update(v).digest('hex');
const runId=randomUUID(),workerHex=sha('worker:'+runId).slice(0,32),runtimeHex=sha('runtime:'+runId).slice(0,32);
const nativeFamily='pilot-0cd860b8cfc35fc459b4838fa9092007';
const workerPrefixes=['bazaar-seller:production-'+workerHex,'bazaar-seller:production-'+runtimeHex];
const plan={schema:'bazaar.example-production-scope-preparation/v4',status:'PREPARED_NAMES_ONLY_PENDING_JOINT_AUTHORIZATION',runId,creationId:randomUUID(),permissionId:randomUUID(),submissionId:randomUUID(),sourceDigests:{bazaar:'b6266def82f2962eae943c04a01f28f63f11c66279edb83da71c2709d91b875d',provider:'f87082dbb24b0f420cfecfc855b9a77c5995332623c5c9692d711eff30bdeee2'},localBootstrap:{recipient:'Reviewed local coordinator only; never transferred to provider',credential:'Existing local issuer; command guard fixes these five prefixes. This does not claim a five-prefix server ACL.',prefixes:[...['workspace','market','review'].map(r=>'bazaar-'+r+':'+nativeFamily),...workerPrefixes]},hostedWorker:{recipient:'Only reviewed staged example provider in existing Vercel provider project',prefixes:workerPrefixes,credential:'New distinct Upstash REST token; exact two-prefix ACL verified before staging',nativeAccountPrefixesForbidden:true},createdCredentials:0,createdAccounts:0,cloudRequests:0,productionChanges:0,payments:0};
const path='docs/release/recovery-example-budget4-production-scopes-2026-10-13.json';
await writeFile(path,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:plan.status,path,runId,localPrefixes:plan.localBootstrap.prefixes,workerPrefixes,createdCredentials:0,cloudRequests:0}));
