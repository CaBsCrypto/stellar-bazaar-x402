import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {EXAMPLE_PREVIEW as P,sha,BUDGET_PROVIDER_SOURCE,BUDGET_PROVIDER_IO_PROFILE,validateBudgetPreviewTarget,assertBudget2FrozenRuntimeProfile} from './recovery-example-budget2-preview-lib.mjs';
import {recoveryExamplePreviewOverrides} from '../.vercel/recovery-example-budget2-preview-deploy.mjs';
import {nativeSetupRedisResponse} from '../.vercel/recovery-example-budget2-preview-setup.mjs';
import {observeNewPreviewHold} from './recovery-example-budget2-preview-hold-read.mjs';
import {examplePreviewWafPlan} from '../.vercel/recovery-example-budget2-preview-waf.mjs';
const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
check('new exact aliases',()=>{assert.equal(P.bazaarAlias,'stellar-bazaar-x402-example-budget2.vercel.app');assert.equal(P.providerAlias,'ai-video-scriptwriter-example-budget2.vercel.app');assert.equal(P.journal,'.vercel/recovery-example-budget2-preview-profile.dpapi');});
const target={version:1,status:'FROZEN_REVIEWED_EXAMPLE_BUDGET2_PREVIEW_TARGET',sourceDigest:'a'.repeat(64),sourceManifest:'docs/evidence/synthetic-source.json',sourceManifestSha256:'b'.repeat(64),buildReceipt:'docs/evidence/synthetic-build.json',buildReceiptSha256:'c'.repeat(64),budgetVersion:'example-text-wire/v2',previousPreviewProfileSha256:'d'.repeat(64),providerSourceDigest:BUDGET_PROVIDER_SOURCE,providerManifest:'docs/evidence/recovery-example-provider-v5-source-2026-10-13.json',providerManifestSha256:sha(await readFile('docs/evidence/recovery-example-provider-v5-source-2026-10-13.json')),providerBuildReceipt:'docs/evidence/recovery-example-provider-v5-build-2026-10-13.json',providerBuildReceiptSha256:sha(await readFile('docs/evidence/recovery-example-provider-v5-build-2026-10-13.json')),providerIoProfile:BUDGET_PROVIDER_IO_PROFILE};
check('v2 exact public target',()=>assert.equal(validateBudgetPreviewTarget(target),target));
check('v1 marker never accepted as new v2 target',()=>assert.throws(()=>validateBudgetPreviewTarget({...target,budgetVersion:'example-text-wire/v1'})));
check('old target status never reused',()=>assert.throws(()=>validateBudgetPreviewTarget({...target,status:'FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_TARGET'})));
for(const change of [{providerSourceDigest:'e'.repeat(64)},{secret:'never-output'},{providerIoProfile:'other'}])check('reject foreign target '+Object.keys(change)[0],()=>assert.throws(()=>validateBudgetPreviewTarget({...target,...change})));
const profile={phase:'native-ready',family:'pilot-'+'f'.repeat(32),candidateSources:{bazaar:target.sourceDigest,provider:BUDGET_PROVIDER_SOURCE},providerIoProfile:BUDGET_PROVIDER_IO_PROFILE,budgetVersion:target.budgetVersion,workerToken:'w'.repeat(43),workerConfiguration:{card:{}},workerBinding:'a'.repeat(64),workerPrefix:'bazaar-seller:preview-'+'f'.repeat(32),runtimePrefix:'bazaar-seller:preview-'+'e'.repeat(32),storeKey:'s'.repeat(43),scopedToken:'synthetic-scoped-worker',scopedNativeToken:'synthetic-scoped-native',bazaarProtection:'synthetic-protected-bazaar',providerProtection:'synthetic-protected-provider',controlRecord:'synthetic-public-control-record',operator:'o'.repeat(43),reviewSecret:'r'.repeat(43),seller:{receipt:{ownerId:'ow_'+'a'.repeat(32)}},buyer:{receipt:{ownerId:'ow_'+'b'.repeat(32)}},card:{id:'bazaar-recovery-example-text-v1'},cardHash:'c'.repeat(64)};
const provider=recoveryExamplePreviewOverrides('provider',profile),bazaar=recoveryExamplePreviewOverrides('bazaar',profile);
check('new profile enabled only final deployment',()=>assert.equal(bazaar.BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE,'example-text-wire/v2'));
check('fresh Preview command config equals Production 360k',()=>assert.deepEqual(JSON.parse(bazaar.BAZAAR_FREE_DEMO_COMMAND_BUDGET_JSON),{public:115000,authenticated:90000,recovery:105000,background:50000}));
check('seller agent and buyer are scoped separately',()=>{assert.equal(provider.BAZAAR_HOSTED_SELLER_REDIS_REST_TOKEN,profile.scopedToken);assert.equal(bazaar.BAZAAR_WORKSPACE_REDIS_REST_TOKEN,profile.scopedNativeToken);assert.deepEqual(JSON.parse(bazaar.BAZAAR_MARKET_BUYER_ALLOWLIST_JSON),[profile.buyer.receipt.ownerId]);});
check('still one buyer/closed registration/no files',()=>assert.equal(bazaar.BAZAAR_WORKSPACE_CREATION_PAUSED,'true'));
check('reject v1 profile on new deploy',()=>assert.throws(()=>recoveryExamplePreviewOverrides('provider',{...profile,budgetVersion:'example-text-wire/v1'})));
const setup=await readFile('.vercel/recovery-example-budget2-preview-setup.mjs','utf8'),nativeSetup=setup.slice(setup.indexOf('function environment(j,packet)'),setup.indexOf('export {environment'));
check('native setup keeps optimized flag off until binding exists',()=>{assert.equal(nativeSetup.includes('BAZAAR_EXAMPLE_TEXT_BUDGET_PROFILE'),false);assert.equal(nativeSetup.includes('BAZAAR_EXAMPLE_TEXT_SELLER_CONFIG_JSON'),false);});
check('native proxy respects SDK base64 JSON strings',()=>assert.equal(nativeSetupRedisResponse('{"schema":1}',{'upstash-encoding':'base64'}).result,Buffer.from('{"schema":1}').toString('base64')));
check('SDK raw OK preserved',()=>assert.equal(nativeSetupRedisResponse('OK',{'upstash-encoding':'base64'}).result,'OK'));
let privateReads=0,requests=0;
await assert.rejects(observeNewPreviewHold('unknown','a'.repeat(64),{readJournal:async()=>{privateReads++;throw Error('MUST_NOT_READ');},fetcher:async()=>{requests++;throw Error('MUST_NOT_FETCH');}}),/EXACT_READ_STAGE/);checks.push('final hold reader rejects invalid stage before profile or GET');assert.equal(privateReads,0);assert.equal(requests,0);
const oldTarget=JSON.parse(await readFile('.vercel/recovery-example-budget-preview-target.json'));
await assert.rejects(assertBudget2FrozenRuntimeProfile(JSON.parse(await readFile(oldTarget.sourceManifest))),/FROZEN_V2_RUNTIME/);checks.push('cannot relabel old v1 frozen source as v2');
const baseline=JSON.parse(await readFile('.vercel/recovery-example-budget-preview-provider-waf-baseline.json'));
const waf=examplePreviewWafPlan(baseline.providerWaf,'provider');check('exact second Preview exception only',()=>{assert.equal(waf.host,P.providerAlias);assert.equal(waf.stage,'provider');assert(waf.controls>1000);});
const sources=['scripts/recovery-example-budget2-preview-lib.mjs','scripts/prepare-recovery-example-budget2-preview-target.mjs','scripts/recovery-example-budget2-preview-hold-read.mjs',
  '.vercel/recovery-example-budget2-preview-setup.mjs','.vercel/recovery-example-budget2-preview-deploy.mjs','.vercel/recovery-example-budget2-preview-acceptance.mjs','.vercel/recovery-example-budget2-preview-storage.mjs','.vercel/recovery-example-budget2-preview-qr.mjs','.vercel/recovery-example-budget2-preview-waf.mjs'];
for(const path of sources){const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});check('syntax '+path,()=>assert.equal(result.status,0,result.stderr));}
const lib=await readFile(sources[0],'utf8');check('last accepted v1 cipher preserved by hash',()=>{assert(lib.includes("readFile('.vercel/recovery-example-budget-preview-profile.dpapi')"));assert(!lib.includes("readFile('.vercel/recovery-example-preview-profile.dpapi')"));});
const sdk=JSON.parse(await readFile('docs/evidence/recovery-example-budget2-preview-v5-marker-acceptance-controller-local-2026-10-13.json'));
const currentAcceptanceHash=sha(await readFile('.vercel/recovery-example-budget2-preview-acceptance.mjs'));
check('actual SDK fixture bound to current new controller',()=>{assert.equal(sdk.checks,54);assert.equal(sdk.moduleSha256,currentAcceptanceHash);assert.equal(sdk.externalRequests,0);});
const evidence={version:1,status:'PASS_PREPARED_BUDGET_V2_PREVIEW_CONTROLLER_GUARDS',checks:checks.length,checksPerformed:checks,actualSdkFixtureChecks:54,
  files:Object.fromEntries(await Promise.all([...sources,'.vercel/recovery-example-budget2-preview-private.ps1'].map(async p=>[p,sha(await readFile(p))]))),
  sourceAndInitialReservationPinsPending:false,commandBudgetMatchesProduction:true,priorCipherNotReadOrChanged:true,
  cloudWrites:0,externalRequests:0,dpapiReads:0,newProfiles:0,newCredentials:0,newOrders:0,payments:0,productionPublished:false};
const path='docs/evidence/recovery-example-budget2-preview-controller-final-guards-local-2026-10-13.json';await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:evidence.status,checks:evidence.checks,actualSdkFixtureChecks:54,sourceAndInitialReservationPinsPending:false,externalRequests:0}));
