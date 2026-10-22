// Offline derivative controllers for a second isolated Preview. No credentials,
// private journal reads, networking, database mutations or deployment occur.
import {readFile,writeFile,lstat,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const outputManifest='docs/evidence/recovery-example-budget-preview-helpers-2026-10-12.json';
const sourcePaths={lib:'scripts/recovery-example-preview-lib.mjs',setup:'.vercel/recovery-example-preview-setup.mjs',private:'.vercel/recovery-example-preview-private.ps1',deploy:'.vercel/recovery-example-preview-deploy.mjs',acceptance:'.vercel/recovery-example-preview-acceptance.mjs',storage:'.vercel/recovery-example-preview-storage.mjs'};
const targetPaths=Object.fromEntries(Object.entries(sourcePaths).map(([key,path])=>[key,path.replace('recovery-example-preview-','recovery-example-budget-preview-')]));
function replaceOnce(text,before,after){if(text.indexOf(before)<0||text.indexOf(before)!==text.lastIndexOf(before))throw Error('EXACT_OFFLINE_HELPER_INPUT_REQUIRED');return text.replace(before,after);}
function namespace(text){return text.replaceAll('bazaar-recovery-example-preview-v1','bazaar-recovery-example-budget-preview-v2').replaceAll('recovery-example-preview-','recovery-example-budget-preview-').replaceAll('stellar-bazaar-x402-example12.vercel.app','stellar-bazaar-x402-example-budget.vercel.app').replaceAll('ai-video-scriptwriter-example12.vercel.app','ai-video-scriptwriter-example-budget.vercel.app').replaceAll('bazaar_example_preview_','bazaar_example_budget_preview_').replaceAll('bazaar_example_accounts_preview_','bazaar_example_budget_accounts_preview_');}

const TARGET_READER=String.raw`
export const BUDGET_PREVIEW_TARGET_PATH='.vercel/recovery-example-budget-preview-target.json';
export async function readBudgetPreviewTarget(){
 const info=await lstat(BUDGET_PREVIEW_TARGET_PATH);
 if(!info.isFile()||info.isSymbolicLink()||info.size>32768)fail('BUDGET_PREVIEW_PUBLIC_TARGET_REQUIRED');
 const raw=await readFile(BUDGET_PREVIEW_TARGET_PATH),value=JSON.parse(raw);
 const fields=['version','status','sourceDigest','sourceManifest','sourceManifestSha256','buildReceipt','buildReceiptSha256','budgetVersion','previousPreviewProfileSha256'];
 if(Object.keys(value).sort().join(',')!==fields.sort().join(',')||value.version!==1||value.status!=='FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_TARGET'||
   !/^[a-f0-9]{64}$/.test(value.sourceDigest??'')||!/^docs\/evidence\/[a-z0-9-]+\.json$/.test(value.sourceManifest??'')||
   !/^[a-f0-9]{64}$/.test(value.sourceManifestSha256??'')||!/^docs\/evidence\/[a-z0-9-]+\.json$/.test(value.buildReceipt??'')||
   !/^[a-f0-9]{64}$/.test(value.buildReceiptSha256??'')||!/^example-[a-z0-9-]{1,64}$/.test(value.budgetVersion??'')||!/^([a-f0-9]{64})$/.test(value.previousPreviewProfileSha256??''))fail('BUDGET_PREVIEW_EXACT_PUBLIC_TARGET_REQUIRED');
 const manifestRaw=await readFile(value.sourceManifest),manifest=JSON.parse(manifestRaw),buildRaw=await readFile(value.buildReceipt),build=JSON.parse(buildRaw);
 if(sha(manifestRaw)!==value.sourceManifestSha256||manifest.sourceDigest!==value.sourceDigest||sha(buildRaw)!==value.buildReceiptSha256||build.sourceDigest!==value.sourceDigest||!String(build.status).startsWith('PASS'))fail('BUDGET_PREVIEW_FROZEN_BUILD_BINDING_REQUIRED');
 return {...value,targetSha256:sha(raw)};
}
export async function previousPreviewProfileUnchanged(expectedHash){
 if(!/^[a-f0-9]{64}$/.test(expectedHash??'')||sha(await readFile('.vercel/recovery-example-preview-profile.dpapi'))!==expectedHash)fail('PREVIOUS_EXAMPLE_PREVIEW_PROFILE_CHANGED');
 return true;
}
`;
function transformLib(text){
 text=namespace(text);
 text=replaceOnce(text,"export async function journalWrite(value,initial=false){",TARGET_READER+"\nexport async function journalWrite(value,initial=false){");
 text=replaceOnce(text,"if(value.workerPrefix!==", "if(!/^[a-f0-9]{64}$/.test(value.candidateSources?.bazaar??'')||value.candidateSources.provider!=='bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f'||typeof value.budgetVersion!=='string'||!value.budgetTargetSha256||value.workerPrefix!==");
 return text;
}
function transformSetup(text){
 text=namespace(text).replace('redisCommands,originalJournalUnchanged}', 'redisCommands,originalJournalUnchanged,readBudgetPreviewTarget,previousPreviewProfileUnchanged}');
 text=replaceOnce(text,"async function prepare(packet){", "async function prepare(packet){\n  const candidate=await readBudgetPreviewTarget();await previousPreviewProfileUnchanged(candidate.previousPreviewProfileSha256);");
 text=replaceOnce(text,"j.card=publication.card;j.cardHash=publication.cardHash;", "j.card=publication.card;j.cardHash=publication.cardHash;j.candidateSources={bazaar:candidate.sourceDigest,provider:'bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f'};j.budgetVersion=candidate.budgetVersion;j.budgetTargetSha256=candidate.targetSha256;j.previousPreviewProfileSha256=candidate.previousPreviewProfileSha256;");
 return text;
}
function transformDeploy(text){
 text=namespace(text).replace('envReferences,originalJournalUnchanged}', 'envReferences,originalJournalUnchanged,readBudgetPreviewTarget,previousPreviewProfileUnchanged}');
 text=replaceOnce(text,"const manifestPaths={bazaar:'docs/evidence/recovery-example-bazaar-source-2026-10-12.json',provider:'docs/evidence/recovery-example-provider-v2-source-2026-10-12.json'};", "const manifestPaths={provider:'docs/evidence/recovery-example-provider-v2-source-2026-10-12.json'};");
 text=replaceOnce(text,"const expected={bazaar:'8181954b49bcb0e9bbb5a75d65de60c14c5e50dece60d9cea6e7f3d2df16094e',provider:'bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f'};", "const expected={provider:'bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f'};\nasync function frozenBudgetTarget(){const value=await readBudgetPreviewTarget();manifestPaths.bazaar=value.sourceManifest;expected.bazaar=value.sourceDigest;return value;}");
 text=replaceOnce(text,"async function verifiedSource(stage){", "async function verifiedSource(stage){\n  const candidate=await frozenBudgetTarget();");
 text=replaceOnce(text,"const buildPath=stage==='bazaar'?'docs/evidence/recovery-example-bazaar-build-fixed-2026-10-12.json':'docs/evidence/recovery-example-provider-v2-build-2026-10-12.json';", "const buildPath=stage==='bazaar'?candidate.buildReceipt:'docs/evidence/recovery-example-provider-v2-build-2026-10-12.json';");
 text=replaceOnce(text,"async function create(stage){", "async function create(stage){\n  const candidate=await frozenBudgetTarget();await previousPreviewProfileUnchanged(candidate.previousPreviewProfileSha256);");
 text=replaceOnce(text,"const j=await journalRead();privateEnvironment(stage,j);await authority();", "const j=await journalRead();if(j.candidateSources?.bazaar!==candidate.sourceDigest||j.budgetVersion!==candidate.budgetVersion||j.budgetTargetSha256!==candidate.targetSha256)fail('BUDGET_PREVIEW_SAME_FROZEN_TARGET_REQUIRED');privateEnvironment(stage,j);await authority();");
 text=text.replaceAll("'.vercel/recovery-example-'+stage+'-deploy-source'", "'.vercel/recovery-example-budget-'+stage+'-deploy-source'").replaceAll("'docs/evidence/recovery-example-'+stage+'-preview-", "'docs/evidence/recovery-example-budget-'+stage+'-preview-");
 return text;
}
function transformAcceptance(text){
 text=namespace(text).replace('api,originalJournalUnchanged}', 'api,originalJournalUnchanged,readBudgetPreviewTarget,previousPreviewProfileUnchanged}');
 text=replaceOnce(text,"const source={bazaar:'8181954b49bcb0e9bbb5a75d65de60c14c5e50dece60d9cea6e7f3d2df16094e',provider:'bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f'};", "const providerSource='bc3a348d63002a3625ea6ac0fa97312ddc2753439dec40b9e9180eefff78ea9f';");
 text=replaceOnce(text,"export function exampleAcceptancePlan(j){", "export function exampleAcceptancePlan(j){\n const source=j?.candidateSources;if(!/^[a-f0-9]{64}$/.test(source?.bazaar??'')||source.provider!==providerSource||typeof j.budgetVersion!=='string'||!j.budgetTargetSha256)fail('BUDGET_PREVIEW_FIXED_CANDIDATE_REQUIRED');");
 text=replaceOnce(text,"const publicPlan={version:1,", "const publicPlan={version:2,budgetVersion:j.budgetVersion,budgetTargetSha256:j.budgetTargetSha256,");
 text=replaceOnce(text,"const j=await readJournal(),plan=exampleAcceptancePlan(j);await checkOriginal();", "const j=await readJournal(),plan=exampleAcceptancePlan(j);await checkOriginal();");
 text=text.replace('planHash:plan.planHash,source,aliases:plan.aliases', 'planHash:plan.planHash,source:plan.source,aliases:plan.aliases');
 text=replaceOnce(text,"if(action==='plan'&&process.argv.length===3){", "if(action==='plan'&&process.argv.length===3){await readBudgetPreviewTarget();");
 text=replaceOnce(text,"const result=await runExamplePreviewAcceptance(action);", "const candidate=await readBudgetPreviewTarget(),j=await journalRead();if(j.budgetTargetSha256!==candidate.targetSha256||j.candidateSources?.bazaar!==candidate.sourceDigest)fail('BUDGET_PREVIEW_FROZEN_TARGET_CHANGED');await previousPreviewProfileUnchanged(candidate.previousPreviewProfileSha256);const result=await runExamplePreviewAcceptance(action);");
 return text;
}
function transformPrivate(text){return namespace(text);}
function transformStorage(text){return namespace(text);}
export async function prepareBudgetPreviewHelpers(){
 const buffers=new Map(),bases=[];
 for(const [key,path]of Object.entries(sourcePaths)){const file=resolve(root,path),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>150000)throw Error('PLAIN_BOUNDED_PUBLIC_CONTROLLER_REQUIRED');const bytes=await readFile(file);bases.push({path,sha256:sha(bytes)});buffers.set(key,Buffer.from(({lib:transformLib,setup:transformSetup,private:transformPrivate,deploy:transformDeploy,acceptance:transformAcceptance,storage:transformStorage}[key])(bytes.toString('utf8'))));}
 for(const path of [...Object.values(targetPaths),outputManifest])try{await lstat(resolve(root,path));throw Error('NEW_ISOLATED_HELPER_FILES_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}
 const files=[];for(const [key,bytes]of buffers){const path=targetPaths[key];await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),bytes,{flag:'wx'});files.push({path,bytes:bytes.length,sha256:sha(bytes)});}
 const manifest={version:1,status:'PREPARED_LOCAL_SECOND_PREVIEW_CONTROLLERS_NO_REMOTE_ACTION',preparedAt:new Date().toISOString(),files,bases,aliases:{bazaar:'stellar-bazaar-x402-example-budget.vercel.app',provider:'ai-video-scriptwriter-example-budget.vercel.app'},profile:'.vercel/recovery-example-budget-preview-profile.dpapi',purpose:'bazaar-recovery-example-budget-preview-v2',publicTarget:'.vercel/recovery-example-budget-preview-target.json',candidateSourceNotChosen:true,budgetEnvironmentNotConfigured:true,requiredBeforeExecution:['Root freezes measured candidate and build, then writes the exact public target.','Root inserts the final version/cardHash/owner budget environment contract into the private deployment map.','Root separately authorizes the new Preview ACL/native setup stage after measurement.','Preserve old production and prior Preview holds; record before/after read-only snapshots.'],credentialsRead:0,privateProfilesRead:0,networkRequests:0,cloudWrites:0,payments:0,productionLimitsChanged:false,productionReservationsChanged:false};
 await writeFile(resolve(root,outputManifest),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return {...manifest,files:files.length,manifest:outputManifest};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==3||process.argv[2]!=='prepare')throw Error('OFFLINE_PREPARE_ONLY');console.log(JSON.stringify(await prepareBudgetPreviewHelpers()));}
