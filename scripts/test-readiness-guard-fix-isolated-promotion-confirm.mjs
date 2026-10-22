import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {guardFixIsolatedProductionPlan,ISOLATED_PRODUCTION_PATHS as F} from '../.vercel/readiness-guard-fix-isolated-production-control.mjs';
import {confirmIsolatedPromotion,PROMOTION_CONFIRM_POLICY as C,validateActualCanonicalAssignment} from '../.vercel/readiness-guard-fix-isolated-promotion-confirm.mjs';
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v),hash=v=>createHash('sha256').update(canonical(v)).digest('hex'),clone=structuredClone;
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(f,re)=>{await assert.rejects(f,re);checks++;};
const current=await guardFixIsolatedProductionPlan(),plan=current.plan,approval={approvedPlanHash:plan.planHash,approvedReviewHash:plan.reviewHash,approvedSupplementalReviewHash:plan.supplementalReviewHash};
// These are public, local deployment and acceptance records, never private profiles.
const originals=new Map();for(const path of [F.intent,F.staged,F.promoteIntent,F.handover,F.preview,F.previewFinal,F.previewProvider,F.previewAlias])originals.set(path,JSON.parse(await readFile(path,'utf8')));
function fixture(){
 const records=new Map([...originals].map(([k,v])=>[k,clone(v)])),calls=[],writes=[],env={},projects={},deployments={},aliases={},clock=Date.parse('2026-10-12T04:50:00Z');
 for(const kind of ['bazaar','provider']){
  const id=kind==='bazaar'?C.deploymentId:C.providerDeploymentId,host=kind==='bazaar'?C.host:'ai-video-scriptwriter-2g3cvxx3z.vercel.app';
  env[kind]={envs:current.envReceipts[kind].environmentReferences.map(r=>({...clone(r),value:r.type==='plain'?(current.oldPlan.environment[kind][r.key]??'UNCHANGED_SYNTHETIC_PLAIN'):'MASKED_SYNTHETIC'}))};
  projects[kind]={id:plan.projects[kind],accountId:plan.teamId,targets:{production:{id}},ssoProtection:{deploymentType:'all_except_custom_domains'},crons:{deploymentId:id,definitions:kind==='bazaar'?plan.crons.map(r=>({...r,host})):[]}};
  deployments[kind]={id,projectId:plan.projects[kind],target:'production',readyState:'READY',url:host,aliasAssigned:true,alias:[],crons:kind==='bazaar'?plan.crons:[],meta:{sourceDigest:kind==='bazaar'?plan.sourceDigest:plan.providerSourceDigest}};
  aliases[kind]={alias:new URL(plan.origins[kind]).hostname,projectId:plan.projects[kind],deployment:{id}};
 }
 Object.assign(deployments.bazaar.meta,{demoCandidate:plan.candidate,readinessGuardFixPlan:plan.planHash,readinessGuardFixIntent:C.intentId,readinessGuardFixReview:plan.reviewHash,readinessGuardFixSupplement:plan.supplementalReviewHash,readinessGuardFixValidationFamily:plan.validationFamily,readinessGuardFixPreviewPlan:plan.isolatedPreviewPlanHash,readinessGuardFixStage:'production'});
 const responses=new Map();for(const kind of ['bazaar','provider']){responses.set('/v13/deployments/'+deployments[kind].id+'?teamId='+plan.teamId,deployments[kind]);responses.set('/v9/projects/'+plan.projects[kind]+'?teamId='+plan.teamId,projects[kind]);responses.set('/v4/aliases/'+new URL(plan.origins[kind]).hostname+'?teamId='+plan.teamId,aliases[kind]);responses.set('/v9/projects/'+plan.projects[kind]+'/env?teamId='+plan.teamId,env[kind]);}
 const deps={planResolver:async()=>current,now:()=>clock,readOptional:async p=>records.has(p)?clone(records.get(p)):undefined,writeExclusive:async(p,v)=>{if(records.has(p))throw Error('EEXIST');writes.push(p);records.set(p,clone(v));},command:async(args,timeout)=>{eq(args[0],'api');eq(args.slice(-3),['--raw','--method','GET']);assert(timeout>0&&timeout<=20000);checks++;calls.push(args);assert(responses.has(args[1]));checks++;return clone(responses.get(args[1]));}};
 return {records,calls,writes,env,projects,deployments,aliases,responses,deps,invoke:(action='confirm',a=approval)=>confirmIsolatedPromotion(action,a,process.cwd(),deps)};
}
const f=fixture();eq((await f.invoke('check')).networkRequests,0);eq(f.calls.length,0);
const ready=await f.invoke();eq(ready.status,'READY_READINESS_GUARD_FIX_PRODUCTION_PENDING_ACCEPTANCE');eq(ready.canonicalAssigned,true);eq(ready.productionPublished,true);eq(ready.canonicalAssignmentSource,'V4_ALIAS_AND_PROJECT_PRODUCTION_TARGET');eq(ready.canonicalAliasProof,{host:'bazaar.browns.studio',deploymentId:C.deploymentId,projectId:plan.projects.bazaar});eq(ready.providerCanonicalAliasProof.deploymentId,C.providerDeploymentId);eq(ready.projectProductionTarget,C.deploymentId);eq(ready.projectCronDeploymentId,C.deploymentId);eq(f.calls.length,8);eq(f.writes,[F.ready]);eq(ready.promotions,0);eq(ready.cloudWrites,0);eq(ready.externalAcceptanceValidated,false);
// Historical alias arrays can contradict current assignment. They are ignored.
eq(f.deployments.bazaar.alias,[]);eq(f.deployments.provider.alias,[]);eq(f.calls.some(a=>a[1].includes(plan.oldDeploymentIds.bazaar)),false);eq(JSON.stringify(ready).includes('MASKED_SYNTHETIC'),false);
eq((await f.invoke()).recoveredReadOnly,true);eq(f.writes.length,1);eq(f.calls.length,16);
for(const mutation of [
 x=>x.aliases.bazaar.deployment.id=plan.oldDeploymentIds.bazaar,
 x=>x.aliases.bazaar.alias='another.example',
 x=>x.aliases.bazaar.projectId=plan.projects.provider,
 x=>x.aliases.bazaar.deploymentId=plan.oldDeploymentIds.bazaar,
 x=>x.projects.bazaar.targets.production.id=plan.oldDeploymentIds.bazaar,
 x=>x.projects.bazaar.crons.deploymentId=plan.oldDeploymentIds.bazaar,
 x=>x.projects.bazaar.crons.definitions[0].host='stellar-bazaar-x402-old-cabscryptocontacto-6028s-projects.vercel.app',
 x=>x.projects.bazaar.ssoProtection.deploymentType='all',
 x=>x.projects.bazaar.crons.definitions[0].schedule='*/2 * * * *',
 x=>x.deployments.bazaar.meta.sourceDigest='bad',
 x=>x.deployments.bazaar.readyState='BUILDING',
 x=>x.env.bazaar.envs[0].updatedAt++,
 x=>x.aliases.provider.deployment.id='dpl_Other',
 x=>x.projects.provider.targets.production.id='dpl_Other',
 x=>x.deployments.provider.meta.sourceDigest='bad',
 x=>x.projects.provider.crons.definitions.push({path:'/api/seller/tick',schedule:'*/2 * * * *'}),
 x=>x.env.provider.envs[0].updatedAt++
]){const x=fixture();mutation(x);await reject(()=>x.invoke(),/REQUIRED|CHANGED/);eq(x.writes.length,0);eq(x.calls.length<=8,true);}
for(const path of [F.intent,F.staged,F.promoteIntent,F.handover,F.preview,F.previewAlias]){const x=fixture();x.records.get(path).sourceDigest='wrong';await reject(()=>x.invoke(),/REQUIRED|CHANGED/);eq(x.calls.length,0);eq(x.writes.length,0);}
for(const key of ['stagedReceiptSha256','handoverProofSha256']){const x=fixture();x.records.get(F.promoteIntent)[key]='f'.repeat(64);await reject(()=>x.invoke(),/PROMOTION_INTENT_REQUIRED/);eq(x.calls.length,0);}
const changedProof=fixture();changedProof.records.get(F.preview).observedAt='2026-10-12T04:01:00Z';await reject(()=>changedProof.invoke(),/ACCEPTANCE_BINDINGS_CHANGED/);eq(changedProof.calls.length,0);
for(const key of Object.keys(approval)){const x=fixture();await reject(()=>x.invoke('confirm',{...approval,[key]:'wrong'}),/APPROVED/);eq(x.calls.length,0);}
const wrongAction=fixture();await reject(()=>wrongAction.invoke('promote'),/READONLY_CONFIRM_ACTION_REQUIRED/);eq(wrongAction.calls.length,0);
const failure=fixture();failure.deps.command=async()=>{throw Error('SIMULATED_GET_LOST');};await reject(()=>failure.invoke(),/SIMULATED_GET_LOST/);eq(failure.writes.length,0);eq(failure.records.has(F.promoteIntent),true);
const excessive=fixture();excessive.deployments.bazaar.harmlessPadding='x'.repeat(2097153);await reject(()=>excessive.invoke(),/BOUNDED_READONLY_METADATA_REQUIRED/);eq(excessive.writes.length,0);
const forged=fixture();forged.records.set(F.ready,{...ready,projectProductionTarget:plan.oldDeploymentIds.bazaar});await reject(()=>forged.invoke(),/EXISTING_ACTUAL_ALIAS_RECEIPT_REQUIRED/);eq(forged.writes.length,0);
const direct=fixture();eq(validateActualCanonicalAssignment(direct.aliases.bazaar,direct.projects.bazaar,direct.deployments.bazaar,'bazaar',plan).deploymentId,C.deploymentId);direct.aliases.bazaar.deploymentId=C.deploymentId;delete direct.aliases.bazaar.deployment;eq(validateActualCanonicalAssignment(direct.aliases.bazaar,direct.projects.bazaar,direct.deployments.bazaar,'bazaar',plan).deploymentId,C.deploymentId);
eq(hash(originals.get(F.staged)),originals.get(F.promoteIntent).stagedReceiptSha256);
console.log(JSON.stringify({status:'PASS_OFFLINE_READONLY_ACTUAL_PROMOTION_CONFIRMATION',checks,planHash:plan.planHash,sourceDigest:plan.sourceDigest,networkRequests:0,cloudWrites:0,realPromotions:0,dpapiReads:0,newPayments:0}));
