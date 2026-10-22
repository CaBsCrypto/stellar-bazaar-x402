import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const source=await readFile('.vercel/recovery-example-budget-preview-waf.mjs','utf8');let checks=0;
for(const fragment of ['recovery-example-budget-preview-lib.mjs','j.budgetWaf','waf-before-intent.json','waf-create-intent.json','waf-restore-intent.json','waf-baseline.json','captureBudgetPreviewWafBaseline','assertExampleEmptyWafDraft(listing,stage)','assertExampleFreshWaf(active,stage,protectionHash(listing.active,stage))']){assert.ok(source.includes(fragment));checks++;}
for(const forbidden of ["readFile('.vercel/recovery-example-preview-baseline.json')",'j.waf','recovery-example-'+"'+stage+'"+'-preview-waf-']){assert.equal(source.includes(forbidden),false);checks++;}
const oldBytes=await readFile('.vercel/recovery-example-preview-waf.mjs');
let fixture=await readFile('scripts/test-recovery-example-preview-waf-expanded.mjs','utf8');
fixture=fixture.replaceAll('../.vercel/recovery-example-preview-waf.mjs','../.vercel/recovery-example-budget-preview-waf.mjs').replaceAll("'./recovery-example-preview-lib.mjs'","'./recovery-example-budget-preview-lib.mjs'").replaceAll("'.vercel/recovery-example-preview-waf.mjs'","'.vercel/recovery-example-budget-preview-waf.mjs'").replaceAll('scripts/test-recovery-example-preview-waf-expanded.mjs','scripts/test-recovery-example-budget-preview-waf-expanded.mjs').replaceAll('recovery-example-preview-waf-expanded-local-2026-10-12.json','recovery-example-budget-preview-waf-expanded-local-2026-10-13.json');
await writeFile('scripts/test-recovery-example-budget-preview-waf-expanded.mjs',fixture,{flag:'wx'});
const run=spawnSync(process.execPath,['scripts/test-recovery-example-budget-preview-waf-expanded.mjs','--write-evidence'],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr||run.stdout);const predicates=JSON.parse(run.stdout);assert.equal(predicates.networkRequests,0);assert.equal(predicates.firewallMutations,0);assert.equal(sha(await readFile('.vercel/recovery-example-preview-waf.mjs')),sha(oldBytes));checks+=4;
const report={status:'PASS_LOCAL_NEW_PREVIEW_WAF_REBASE_CONTROLLER',checks,expandedPredicateChecks:predicates.checks,stageResults:predicates.stageResults,helperSha256:sha(source),sourceBaseline:'old configuration used only as local pure fixture; actual current active/listing must be read by root before application',newBaselineAndIntents:true,oldControllerPreserved:true,externalRequests:0,cloudWrites:0,privateProfilesRead:0,payments:0};
await writeFile('docs/evidence/recovery-example-budget-preview-waf-controller-local-2026-10-13.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,checks,expandedPredicateChecks:predicates.checks,helperSha256:report.helperSha256,externalRequests:0}));
