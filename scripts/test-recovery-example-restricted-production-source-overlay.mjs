import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {inspectRestrictedProductionSource,sha,RESTRICTED_EXAMPLE_PRODUCTION as P} from './recovery-example-restricted-production-package.mjs';
const target=JSON.parse(await readFile('.vercel/recovery-example-budget-preview-target.json'));
const descriptor={version:1,purpose:'bazaar-recovery-example-restricted-production-source/v1',sourceManifest:target.sourceManifest,sourceManifestSha256:target.sourceManifestSha256,sourceDigest:target.sourceDigest,buildReceipt:target.buildReceipt,buildReceiptSha256:target.buildReceiptSha256};
const {plan,buffers}=await inspectRestrictedProductionSource(process.cwd(),descriptor);
assert.notEqual(plan.sourceDigest,target.sourceDigest);
assert.equal(plan.fileCount,347);
assert.equal(plan.changes.length,1);
assert.equal(plan.changes[0].path,'vercel.json');
assert.deepEqual(JSON.parse(buffers.get('vercel.json')).crons,P.guardianDefinition);
assert.equal(plan.productionPublished,false);assert.equal(plan.cronActivated,false);assert.equal(plan.productionBuildRequired,true);
assert.equal(plan.previewValidationCarriedOnlyAsAntecedent,true);
const baseManifest=JSON.parse(await readFile(target.sourceManifest));let compared=0;
for(const file of baseManifest.files)if(file.path!=='vercel.json'){assert.equal(sha(buffers.get(file.path)),file.sha256);compared++;}
const evidence={version:1,status:'PASS_READ_ONLY_CRON_OVERLAY_ON_ACCEPTED_PREVIEW_ANTECEDENT',helperSha256:sha(await readFile('scripts/recovery-example-restricted-production-package.mjs')),
  baseSourceDigest:target.sourceDigest,proposedHourlyOverlaySourceDigest:plan.sourceDigest,sourceFileCount:plan.fileCount,identicalNonConfigurationFiles:compared,onlyChangedFile:'vercel.json',guardianDefinition:P.guardianDefinition,
  frozenProductionSourceCreated:false,finalGlobalControlCandidateValidated:false,productionBuildRequired:true,networkRequests:0,cloudWrites:0,dpapiReads:0,productionPublished:false,cronActivated:false,payments:0};
const path='docs/evidence/recovery-example-restricted-production-source-overlay-local-2026-10-13.json';await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...evidence,evidence:path}));
