// Local-only cloning into new controller/artifact paths; old v1 controllers and
// encrypted profiles are never opened or changed. Final candidate pins remain required.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error(code);};
const files=Object.freeze([
  'scripts/recovery-example-budget-preview-lib.mjs',
  'scripts/prepare-recovery-example-budget-preview-target.mjs',
  'scripts/recovery-example-budget-preview-hold-read.mjs',
  '.vercel/recovery-example-budget-preview-setup.mjs',
  '.vercel/recovery-example-budget-preview-private.ps1',
  '.vercel/recovery-example-budget-preview-deploy.mjs',
  '.vercel/recovery-example-budget-preview-acceptance.mjs',
  '.vercel/recovery-example-budget-preview-storage.mjs',
  '.vercel/recovery-example-budget-preview-qr.mjs',
  '.vercel/recovery-example-budget-preview-waf.mjs',
]);
const destination=path=>path.replaceAll('recovery-example-budget-preview','recovery-example-budget2-preview');
export function budget2ControllerSource(path,input){
  if(!files.includes(path)||typeof input!=='string'||input.length>200000)fail('BUDGET2_REVIEWED_CONTROLLER_SOURCE_REQUIRED');
  let out=input.replaceAll('recovery-example-budget-preview','recovery-example-budget2-preview')
    .replaceAll('recovery-example-budget-','recovery-example-budget2-')
    .replaceAll('example-budget.vercel.app','example-budget2.vercel.app')
    .replaceAll('bazaar_example_budget_preview_','bazaar_example_budget2_preview_')
    .replaceAll('bazaar_example_budget_accounts_preview_','bazaar_example_budget2_accounts_preview_')
    .replaceAll('example-text-wire/v1','example-text-wire/v2')
    .replaceAll('FROZEN_REVIEWED_EXAMPLE_BUDGET_PREVIEW_TARGET','FROZEN_REVIEWED_EXAMPLE_BUDGET2_PREVIEW_TARGET')
    .replaceAll('2026-10-12.json','2026-10-13.json')
    .replaceAll('public:155000','public:115000');
  // Preserve the last accepted encrypted v1 profile by its exact byte hash.
  if(path.endsWith('preview-lib.mjs'))out=out.replaceAll('.vercel/recovery-example-preview-profile.dpapi','.vercel/recovery-example-budget-preview-profile.dpapi');
  // An unfinalized hold reader must fail before decrypting any profile or GET.
  if(path.endsWith('preview-hold-read.mjs')){
    out=out.replace("sourceDigest:'5f998f9f089e1e1b0493fe94e66cb455f414df6cd77fe12b40c19a76c0d7231f',initial:Object.freeze({recoveryCommands:8736,backgroundCommands:6300,transferBytes:1508921344})","sourceDigest:null,initial:null");
    out=out.replace('export function summarizeNewPreviewHold(raw,j){',"export function summarizeNewPreviewHold(raw,j){\n if(!NEW_PREVIEW_HOLD.sourceDigest||!NEW_PREVIEW_HOLD.initial)fail('BUDGET2_FINAL_SOURCE_AND_RESERVATION_PIN_REQUIRED');");
    out=out.replace(" if(!['before-recover','after-recover'].includes(stage)"," if(!NEW_PREVIEW_HOLD.sourceDigest||!NEW_PREVIEW_HOLD.initial)fail('BUDGET2_FINAL_SOURCE_AND_RESERVATION_PIN_REQUIRED');\n if(!['before-recover','after-recover'].includes(stage)");
    if(out.includes('initial:Object.freeze({recoveryCommands:8736'))fail('BUDGET2_PRIOR_HOLD_PIN_MUST_NOT_CARRY_FORWARD');
  }
  if(out.includes('example-text-wire/v1')||out.includes('example-budget.vercel.app')||out.includes('public:155000'))fail('BUDGET2_OLD_PROFILE_OR_ALIAS_REFERENCE');
  return out;
}
export async function inspectBudget2Helpers(){
  const outputs=[],records=[];
  for(const path of files){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>200000)fail('BUDGET2_PLAIN_BOUNDED_ANCESTOR_SOURCE_REQUIRED');const before=await readFile(path),after=Buffer.from(budget2ControllerSource(path,before.toString('utf8'))),target=destination(path);outputs.push({target,bytes:after});records.push({ancestor:path,ancestorSha256:sha(before),target,sha256:sha(after),bytes:after.length});}
  const plan={version:1,status:'LOCAL_BUDGET_V2_PREVIEW_CONTROLLERS_PREPARATION_ONLY',budgetVersion:'example-text-wire/v2',aliases:{bazaar:'stellar-bazaar-x402-example-budget2.vercel.app',provider:'ai-video-scriptwriter-example-budget2.vercel.app'},
    commandBudget:{public:115000,authenticated:90000,recovery:105000,background:50000},records,
    oldEncryptedProfilePreserved:'.vercel/recovery-example-budget-preview-profile.dpapi',
    finalSourceAndReservationPinsRequired:true,newFamilyRequired:true,allPriorIntentsAndReceiptsPreserved:true,
    profilePurpose:'bazaar-recovery-example-budget2-preview-v2',cronSchedules:[],newOrdersMaximum:1,orderMustRemainUnpaid:true,
    networkRequests:0,cloudWrites:0,credentialReads:0,dpapiReads:0,productionPublished:false,limitsChanged:false,payments:0};
  return {plan:{...plan,planHash:sha(JSON.stringify(plan))},outputs};
}
export async function prepareBudget2Helpers(pin){
  const {plan,outputs}=await inspectBudget2Helpers();if(!/^[a-f0-9]{64}$/.test(pin??'')||pin!==plan.planHash)fail('BUDGET2_APPROVED_LOCAL_CONTROLLER_PLAN_REQUIRED');
  const manifest='docs/evidence/recovery-example-budget2-preview-controller-template-2026-10-13.json';
  for(const path of [...outputs.map(row=>row.target),manifest]){try{await lstat(path);fail('BUDGET2_NEW_CONTROLLER_ARTIFACT_REQUIRED');}catch(error){if(error.code!=='ENOENT')throw error;}}
  for(const row of outputs)await writeFile(row.target,row.bytes,{flag:'wx',mode:0o600});
  await writeFile(manifest,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});return {status:plan.status,planHash:plan.planHash,manifest,files:outputs.length,finalSourceAndReservationPinsRequired:true,networkRequests:0,cloudWrites:0,credentialReads:0,productionPublished:false,payments:0};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)try{const[action,...args]=process.argv.slice(2);let result;if(action==='inspect'&&!args.length)result=(await inspectBudget2Helpers()).plan;else if(action==='prepare'&&args.length===2&&args[0]==='--approved-plan')result=await prepareBudget2Helpers(args[1]);else fail('BUDGET2_LOCAL_CONTROLLER_PREPARATION_ACTION_REQUIRED');console.log(JSON.stringify(result));}catch(error){console.error(JSON.stringify({status:'UNCONFIRMED',code:/^[A-Z][A-Z0-9_]{2,95}$/.test(error.message??'')?error.message:'BUDGET2_PREPARATION_UNCONFIRMED',networkRequests:0,cloudWrites:0,credentialReads:0,productionPublished:false,payments:0}));process.exitCode=1;}
