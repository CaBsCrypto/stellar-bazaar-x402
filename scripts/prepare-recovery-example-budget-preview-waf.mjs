// Derive a new controller locally. Never import/run the remote CLI entrypoint.
import {readFile,writeFile} from 'node:fs/promises';
let source=await readFile('.vercel/recovery-example-preview-waf.mjs','utf8');
source=source.replaceAll('recovery-example-preview-lib.mjs','recovery-example-budget-preview-lib.mjs').replaceAll('j.waf','j.budgetWaf').replaceAll("docs/evidence/recovery-example-'+stage+'-preview-waf-", "docs/evidence/recovery-example-budget-'+stage+'-preview-waf-");
source=source.replace("async function snapshot(){return JSON.parse(await readFile('.vercel/recovery-example-preview-baseline.json'));}","async function snapshot(stage){return JSON.parse(await readFile('.vercel/recovery-example-budget-preview-'+stage+'-waf-baseline.json'));}");
source=source.replace("const baseline=(await snapshot())[stage+'Waf'],plan=examplePreviewWafPlan(baseline,stage);","const baseline=(await snapshot(stage))[stage+'Waf'],plan=examplePreviewWafPlan(baseline,stage);");
source=source.replace("async function run(action,stage){",`export async function captureBudgetPreviewWafBaseline(stage){
 if(!['bazaar','provider'].includes(stage))fail('BUDGET_PREVIEW_EXACT_WAF_STAGE_REQUIRED');
 const query='?projectId='+P[stage+'Project']+'&teamId='+P.team;
 await exclusive('.vercel/recovery-example-budget-preview-'+stage+'-waf-before-intent.json',{version:1,status:'ONE_FRESH_CURRENT_WAF_BASELINE_NO_RETRY',stage,host:stage==='bazaar'?P.bazaarAlias:P.providerAlias,productionPublished:false});
 const listing=await api('/v1/security/firewall/config'+query);
 assertExampleEmptyWafDraft(listing,stage);const active=await fresh(stage);
 assertExampleFreshWaf(active,stage,protectionHash(listing.active,stage));const plan=examplePreviewWafPlan(active,stage);
 await exclusive('.vercel/recovery-example-budget-preview-'+stage+'-waf-baseline.json',{version:1,status:'CURRENT_ACTIVE_WAF_BASELINE_NO_DRAFT_REUSED',stage,[stage+'Waf']:active,baselineHash:plan.baselineHash,observedAt:new Date().toISOString()});
 const receipt={status:'PASS_FRESH_CURRENT_BUDGET_PREVIEW_WAF_BASELINE',stage,host:plan.host,baselineHash:plan.baselineHash,expectedHash:plan.expectedHash,controls:plan.controls,metadataReads:2,draftMutations:0,priorProtectionsPreserved:true};
 await publicReceipt('docs/evidence/recovery-example-budget-'+stage+'-preview-waf-before-2026-10-13.json',receipt);return receipt;
}
export async function runBudgetPreviewWaf(action,stage){
 if(action==='before')return captureBudgetPreviewWafBaseline(stage);`);
source=source.replace("publicReceipt,journalRead", "publicReceipt,exclusive,journalRead");
source=source.replace("j.budgetWaf[stage]={phase:'apply-started',baselineHash:plan.baselineHash,expectedHash:plan.expectedHash};await journalWrite(j);", "await exclusive('.vercel/recovery-example-budget-preview-'+stage+'-waf-create-intent.json',{version:1,status:'ONE_EXACT_NEW_PREVIEW_WAF_CREATE',stage,baselineHash:plan.baselineHash,expectedHash:plan.expectedHash,productionPublished:false});j.budgetWaf[stage]={phase:'apply-started',baselineHash:plan.baselineHash,expectedHash:plan.expectedHash};await journalWrite(j);");
source=source.replace("intent.phase='restore-started';await journalWrite(j);", "await exclusive('.vercel/recovery-example-budget-preview-'+stage+'-waf-restore-intent.json',{version:1,status:'ONE_EXACT_NEW_PREVIEW_WAF_RESTORE',stage,baselineHash:plan.baselineHash,expectedHash:plan.expectedHash,productionPublished:false});intent.phase='restore-started';await journalWrite(j);");
source=source.replace("-2026-10-12.json',result)","-2026-10-13.json',result)");
source=source.replace("['plan','apply','restore']", "['before','plan','apply','restore']").replace('await run(action,stage)','await runBudgetPreviewWaf(action,stage)');
await writeFile('.vercel/recovery-example-budget-preview-waf.mjs',source,{flag:'wx'});
console.log(JSON.stringify({status:'PREPARED_LOCAL_CURRENT_STATE_BUDGET_PREVIEW_WAF_CONTROLLER',externalRequests:0,cloudWrites:0,privateProfilesRead:0}));
